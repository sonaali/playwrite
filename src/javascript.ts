/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as types from './types';
import * as dom from './dom';
import * as platform from './platform';

export interface ExecutionContextDelegate {
  evaluate(context: ExecutionContext, returnByValue: boolean, pageFunction: string | Function, ...args: any[]): Promise<any>;
  getProperties(handle: JSHandle): Promise<Map<string, JSHandle>>;
  releaseHandle(handle: JSHandle): Promise<void>;
  handleToString(handle: JSHandle, includeType: boolean): string;
  handleJSONValue<T>(handle: JSHandle<T>): Promise<T>;
}

export class ExecutionContext {
  readonly _delegate: ExecutionContextDelegate;

  constructor(delegate: ExecutionContextDelegate) {
    this._delegate = delegate;
  }

  _evaluate(returnByValue: boolean, waitForNavigations: boolean, pageFunction: string | Function, ...args: any[]): Promise<any> {
    return this._delegate.evaluate(this, returnByValue, pageFunction, ...args);
  }

  evaluate: types.Evaluate = async (pageFunction, ...args) => {
    return this._evaluate(true /* returnByValue */, true /* waitForNavigations */, pageFunction, ...args);
  }

  evaluateHandle: types.EvaluateHandle = async (pageFunction, ...args) => {
    return this._evaluate(false /* returnByValue */, true /* waitForNavigations */, pageFunction, ...args);
  }

  _createHandle(remoteObject: any): JSHandle {
    return new JSHandle(this, remoteObject);
  }
}

export class JSHandle<T = any> {
  readonly _context: ExecutionContext;
  readonly _remoteObject: any;
  _disposed = false;

  constructor(context: ExecutionContext, remoteObject: any) {
    this._context = context;
    this._remoteObject = remoteObject;
  }

  evaluate: types.EvaluateOn<T> = (pageFunction, ...args) => {
    return this._context.evaluate(pageFunction as any, this, ...args);
  }

  evaluateHandle: types.EvaluateHandleOn<T> = (pageFunction, ...args) => {
    return this._context.evaluateHandle(pageFunction as any, this, ...args);
  }

  async getProperty(propertyName: string): Promise<JSHandle> {
    const objectHandle = await this.evaluateHandle((object: any, propertyName) => {
      const result: any = {__proto__: null};
      result[propertyName] = object[propertyName];
      return result;
    }, propertyName);
    const properties = await objectHandle.getProperties();
    const result = properties.get(propertyName)!;
    objectHandle.dispose();
    return result;
  }

  getProperties(): Promise<Map<string, JSHandle>> {
    return this._context._delegate.getProperties(this);
  }

  jsonValue(): Promise<T> {
    return this._context._delegate.handleJSONValue(this);
  }

  asElement(): dom.ElementHandle | null {
    return null;
  }

  async dispose() {
    if (this._disposed)
      return;
    this._disposed = true;
    await this._context._delegate.releaseHandle(this);
  }

  toString(): string {
    return this._context._delegate.handleToString(this, true /* includeType */);
  }
}

export function prepareFunctionCall<T>(
  pageFunction: Function,
  context: ExecutionContext,
  args: any[],
  toCallArgumentIfNeeded: (value: any) => { handle?: T, value?: any }): { functionText: string, values: any[], handles: T[] } {

  let functionText = pageFunction.toString();
  try {
    new Function('(' + functionText + ')');
  } catch (e1) {
    // This means we might have a function shorthand. Try another
    // time prefixing 'function '.
    if (functionText.startsWith('async '))
      functionText = 'async function ' + functionText.substring('async '.length);
    else
      functionText = 'function ' + functionText;
    try {
      new Function('(' + functionText  + ')');
    } catch (e2) {
      // We tried hard to serialize, but there's a weird beast here.
      throw new Error('Passed function is not well-serializable!');
    }
  }

  const guids: string[] = [];
  const handles: T[] = [];
  const pushHandle = (handle: T): string => {
    const guid = platform.guid();
    guids.push(guid);
    handles.push(handle);
    return guid;
  };

  const visited = new Set<any>();
  let error: string | undefined;
  const visit = (arg: any, depth: number): any => {
    if (!depth) {
      error = 'Argument nesting is too deep';
      return;
    }
    if (visited.has(arg)) {
      error = 'Argument is a circular structure';
      return;
    }
    if (Array.isArray(arg)) {
      visited.add(arg);
      const result = [];
      for (let i = 0; i < arg.length; ++i)
        result.push(visit(arg[i], depth - 1));
      visited.delete(arg);
      return result;
    }
    if (arg && (typeof arg === 'object') && !(arg instanceof JSHandle)) {
      visited.add(arg);
      const result: any = {};
      for (const name of Object.keys(arg))
        result[name] = visit(arg[name], depth - 1);
      visited.delete(arg);
      return result;
    }
    if (arg && (arg instanceof JSHandle)) {
      if (arg._context !== context)
        throw new Error('JSHandles can be evaluated only in the context they were created!');
      if (arg._disposed)
        throw new Error('JSHandle is disposed!');
    }
    const { handle, value } = toCallArgumentIfNeeded(arg);
    if (handle)
      return pushHandle(handle);
    return value;
  };

  args = args.map(arg => visit(arg, 100));
  if (error)
    throw new Error(error);

  if (!guids.length)
    return { functionText, values: args, handles: [] };

  functionText = `(...__playwright__args__) => {
    return (${functionText})(...(() => {
      const args = __playwright__args__;
      __playwright__args__ = undefined;
      const argCount = args[0];
      const handleCount = args[argCount + 1];
      const handles = { __proto__: null };
      for (let i = 0; i < handleCount; i++)
        handles[args[argCount + 2 + i]] = args[argCount + 2 + handleCount + i];
      const visit = (arg) => {
        if ((typeof arg === 'string') && (arg in handles))
          return handles[arg];
        if (arg && (typeof arg === 'object')) {
          for (const name of Object.keys(arg))
            arg[name] = visit(arg[name]);
        }
        return arg;
      };
      const result = [];
      for (let i = 0; i < argCount; i++)
        result[i] = visit(args[i + 1]);
      return result;
    })());
  }`;

  return { functionText, values: [ args.length, ...args, guids.length, ...guids ], handles };
}
