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

import type { SerializedError } from '@protocol/channels';
import { isError } from '../utils';
import { parseSerializedValue, serializeValue } from '../protocol/serializers';

export class TimeoutError extends Error {}

export class TargetClosedError extends Error {
  constructor(cause?: string) {
    super(cause || 'Target page, context or browser has been closed');
  }
}

export function isTargetClosedError(error: Error) {
  return error instanceof TargetClosedError;
}

export function serializeError(e: any): SerializedError {
  if (isError(e))
    return { error: { message: e.message, stack: e.stack, name: e.name } };
  return { value: serializeValue(e, value => ({ fallThrough: value })) };
}

export function parseError(error: SerializedError): Error {
  if (!error.error) {
    if (error.value === undefined)
      throw new Error('Serialized error must have either an error or a value');
    return parseSerializedValue(error.value, undefined);
  }
  if (error.error.name === 'TimeoutError') {
    const e = new TimeoutError(error.error.message);
    e.stack = error.error.stack || '';
    return e;
  }
  if (error.error.name === 'TargetClosedError') {
    const e = new TargetClosedError(error.error.message);
    e.stack = error.error.stack || '';
    return e;
  }
  const e = new Error(error.error.message);
  e.stack = error.error.stack || '';
  e.name = error.error.name;
  return e;
}
