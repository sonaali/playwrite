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

import { Page } from './page';
import { CDPSession } from './cdpSession';
import { Browser } from './browser';

export class ChromiumBrowser extends Browser {
  async newBrowserCDPSession(): Promise<CDPSession> {
    return CDPSession.from((await this._channel.crNewBrowserCDPSession()).session);
  }

  async startTracing(page?: Page, options: { path?: string; screenshots?: boolean; categories?: string[]; } = {}) {
    await this._channel.crStartTracing({ ...options, page: page ? page._channel : undefined });
  }

  async stopTracing(): Promise<Buffer> {
    return Buffer.from((await this._channel.crStopTracing()).trace, 'base64');
  }
}
