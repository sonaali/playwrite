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

import * as api from '../../types/types';
import { Size } from '../common/types';
import * as channels from '../protocol/channels';
import { Artifact } from './artifact';
import { BrowserContext } from './browserContext';

export class Tracing implements api.Tracing {
  private _context: BrowserContext;

  constructor(channel: BrowserContext) {
    this._context = channel;
  }

  async start(options: { name?: string, snapshots?: boolean, screenshots?: boolean, video?: boolean | Size } = {}) {
    await this._context._wrapApiCall(async (channel: channels.BrowserContextChannel) => {
      return await channel.tracingStart({
        ...options,
        video: !!options.video,
        videoSize: typeof options.video === 'object' ? options.video : undefined,
      });
    });
  }

  async _export(options: { path: string }) {
    await this._context._wrapApiCall(async (channel: channels.BrowserContextChannel) => {
      await this._doExport(channel, options.path);
    });
  }

  async stop(options: { path?: string } = {}) {
    await this._context._wrapApiCall(async (channel: channels.BrowserContextChannel) => {
      if (options.path)
        await this._doExport(channel, options.path);
      await channel.tracingStop();
    });
  }

  private async _doExport(channel: channels.BrowserContextChannel, path: string) {
    const result = await channel.tracingExport();
    const artifact = Artifact.from(result.artifact);
    if (this._context.browser()?._remoteType)
      artifact._isRemote = true;
    await artifact.saveAs(path);
    await artifact.delete();
  }
}
