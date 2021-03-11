/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License");
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

import { BrowserType } from '../server/browserType';
import { BrowserDispatcher } from './browserDispatcher';
import * as channels from './channels';
import { Dispatcher, DispatcherScope } from './dispatcher';
import { BrowserContextDispatcher } from './browserContextDispatcher';
import { Progress } from '../server/progress';

export class BrowserTypeDispatcher extends Dispatcher<BrowserType, channels.BrowserTypeInitializer> implements channels.BrowserTypeChannel {
  constructor(scope: DispatcherScope, browserType: BrowserType) {
    super(scope, browserType, 'BrowserType', {
      executablePath: browserType.executablePath(),
      name: browserType.name()
    }, true);
  }

  async launch(progress: Progress, params: channels.BrowserTypeLaunchParams): Promise<channels.BrowserTypeLaunchResult> {
    const browser = await this._object.launch(progress, params);
    return { browser: new BrowserDispatcher(this._scope, browser) };
  }

  async launchPersistentContext(progress: Progress, params: channels.BrowserTypeLaunchPersistentContextParams): Promise<channels.BrowserTypeLaunchPersistentContextResult> {
    const browserContext = await this._object.launchPersistentContext(progress, params.userDataDir, params);
    return { context: new BrowserContextDispatcher(this._scope, browserContext) };
  }

  async connectOverCDP(progress: Progress, params: channels.BrowserTypeConnectOverCDPParams): Promise<channels.BrowserTypeConnectOverCDPResult> {
    const browser = await this._object.connectOverCDP(progress, params.wsEndpoint, params, params.timeout);
    return {
      browser: new BrowserDispatcher(this._scope, browser),
      defaultContext: browser._defaultContext ? new BrowserContextDispatcher(this._scope, browser._defaultContext) : undefined,
    };
  }
}
