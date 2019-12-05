/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { Events } from './events';
import { assert, helper } from '../helper';
import { BrowserContext } from './BrowserContext';
import { Connection, ConnectionEvents, CDPSession } from './Connection';
import { Page, Viewport } from './Page';
import { Target } from './Target';
import { Protocol } from './protocol';
import { Chromium } from './features/chromium';
import { Screenshotter } from './Screenshotter';

export class Browser extends EventEmitter {
  private _ignoreHTTPSErrors: boolean;
  private _defaultViewport: Viewport;
  private _process: childProcess.ChildProcess;
  private _screenshotter = new Screenshotter();
  _connection: Connection;
  _client: CDPSession;
  private _closeCallback: () => Promise<void>;
  private _defaultContext: BrowserContext;
  private _contexts = new Map<string, BrowserContext>();
  _targets = new Map<string, Target>();
  readonly chromium: Chromium;

  static async create(
    connection: Connection,
    contextIds: string[],
    ignoreHTTPSErrors: boolean,
    defaultViewport: Viewport | null,
    process: childProcess.ChildProcess | null,
    closeCallback?: (() => Promise<void>)) {
    const browser = new Browser(connection, contextIds, ignoreHTTPSErrors, defaultViewport, process, closeCallback);
    await connection.rootSession.send('Target.setDiscoverTargets', { discover: true });
    return browser;
  }

  constructor(
    connection: Connection,
    contextIds: string[],
    ignoreHTTPSErrors: boolean,
    defaultViewport: Viewport | null,
    process: childProcess.ChildProcess | null,
    closeCallback?: (() => Promise<void>)) {
    super();
    this._connection = connection;
    this._client = connection.rootSession;
    this._ignoreHTTPSErrors = ignoreHTTPSErrors;
    this._defaultViewport = defaultViewport;
    this._process = process;
    this._closeCallback = closeCallback || (() => Promise.resolve());
    this.chromium = new Chromium(this);

    this._defaultContext = new BrowserContext(this._client, this, null);
    for (const contextId of contextIds)
      this._contexts.set(contextId, new BrowserContext(this._client, this, contextId));

    this._connection.on(ConnectionEvents.Disconnected, () => this.emit(Events.Browser.Disconnected));
    this._client.on('Target.targetCreated', this._targetCreated.bind(this));
    this._client.on('Target.targetDestroyed', this._targetDestroyed.bind(this));
    this._client.on('Target.targetInfoChanged', this._targetInfoChanged.bind(this));
  }

  process(): childProcess.ChildProcess | null {
    return this._process;
  }

  async createIncognitoBrowserContext(): Promise<BrowserContext> {
    const {browserContextId} = await this._client.send('Target.createBrowserContext');
    const context = new BrowserContext(this._client, this, browserContextId);
    this._contexts.set(browserContextId, context);
    return context;
  }

  browserContexts(): BrowserContext[] {
    return [this._defaultContext, ...Array.from(this._contexts.values())];
  }

  defaultBrowserContext(): BrowserContext {
    return this._defaultContext;
  }

  async _disposeContext(contextId: string | null) {
    await this._client.send('Target.disposeBrowserContext', {browserContextId: contextId || undefined});
    this._contexts.delete(contextId);
  }

  async _targetCreated(event: Protocol.Target.targetCreatedPayload) {
    const targetInfo = event.targetInfo;
    const {browserContextId} = targetInfo;
    const context = (browserContextId && this._contexts.has(browserContextId)) ? this._contexts.get(browserContextId) : this._defaultContext;

    const target = new Target(targetInfo, context, () => this._connection.createSession(targetInfo), this._ignoreHTTPSErrors, this._defaultViewport, this._screenshotter);
    assert(!this._targets.has(event.targetInfo.targetId), 'Target should not exist before targetCreated');
    this._targets.set(event.targetInfo.targetId, target);

    if (await target._initializedPromise)
      this.chromium.emit(Events.Chromium.TargetCreated, target);
  }

  async _targetDestroyed(event: { targetId: string; }) {
    const target = this._targets.get(event.targetId);
    target._initializedCallback(false);
    this._targets.delete(event.targetId);
    target._didClose();
    if (await target._initializedPromise)
      this.chromium.emit(Events.Chromium.TargetDestroyed, target);
  }

  _targetInfoChanged(event: Protocol.Target.targetInfoChangedPayload) {
    const target = this._targets.get(event.targetInfo.targetId);
    assert(target, 'target should exist before targetInfoChanged');
    const previousURL = target.url();
    const wasInitialized = target._isInitialized;
    target._targetInfoChanged(event.targetInfo);
    if (wasInitialized && previousURL !== target.url())
      this.chromium.emit(Events.Chromium.TargetChanged, target);
  }

  async newPage(): Promise<Page> {
    return this._defaultContext.newPage();
  }

  async _createPageInContext(contextId: string | null): Promise<Page> {
    const { targetId } = await this._client.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId || undefined });
    const target = this._targets.get(targetId);
    assert(await target._initializedPromise, 'Failed to create target for page');
    const page = await target.page();
    return page;
  }

  async _closePage(page: Page) {
    await this._client.send('Target.closeTarget', { targetId: Target.fromPage(page)._targetId });
  }

  _allTargets(): Target[] {
    return Array.from(this._targets.values()).filter(target => target._isInitialized);
  }

  async _pages(context: BrowserContext): Promise<Page[]> {
    const targets = this._allTargets().filter(target => target.browserContext() === context && target.type() === 'page');
    const pages = await Promise.all(targets.map(target => target.page()));
    return pages.filter(page => !!page);
  }

  async _activatePage(page: Page) {
    await page._client.send('Target.activateTarget', {targetId: Target.fromPage(page)._targetId});
  }

  async _waitForTarget(predicate: (arg0: Target) => boolean, options: { timeout?: number; } | undefined = {}): Promise<Target> {
    const {
      timeout = 30000
    } = options;
    const existingTarget = this._allTargets().find(predicate);
    if (existingTarget)
      return existingTarget;
    let resolve;
    const targetPromise = new Promise<Target>(x => resolve = x);
    this.chromium.on(Events.Chromium.TargetCreated, check);
    this.chromium.on(Events.Chromium.TargetChanged, check);
    try {
      if (!timeout)
        return await targetPromise;
      return await helper.waitWithTimeout(targetPromise, 'target', timeout);
    } finally {
      this.chromium.removeListener(Events.Chromium.TargetCreated, check);
      this.chromium.removeListener(Events.Chromium.TargetChanged, check);
    }

    function check(target: Target) {
      if (predicate(target))
        resolve(target);
    }
  }

  async pages(): Promise<Page[]> {
    const contextPages = await Promise.all(this.browserContexts().map(context => context.pages()));
    // Flatten array.
    return contextPages.reduce((acc, x) => acc.concat(x), []);
  }

  async version(): Promise<string> {
    const version = await this._getVersion();
    return version.product;
  }

  async userAgent(): Promise<string> {
    const version = await this._getVersion();
    return version.userAgent;
  }

  async close() {
    await this._closeCallback.call(null);
    this.disconnect();
  }

  disconnect() {
    this._connection.dispose();
  }

  isConnected(): boolean {
    return !this._connection._closed;
  }

  _getVersion(): Promise<any> {
    return this._client.send('Browser.getVersion');
  }
}
