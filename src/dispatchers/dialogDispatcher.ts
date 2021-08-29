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

import { Dialog } from '../server/dialog';
import * as channels from '../protocol/channels';
import { Dispatcher, DispatcherScope } from './dispatcher';

export class DialogDispatcher extends Dispatcher<Dialog, channels.DialogInitializer, channels.DialogEvents> implements channels.DialogChannel {
  constructor(scope: DispatcherScope, dialog: Dialog) {
    super(scope, dialog, 'Dialog', {
      type: dialog.type(),
      message: dialog.message(),
      defaultValue: dialog.defaultValue(),
    });
  }

  async accept(params: { promptText?: string }): Promise<void> {
    await this._object.accept(params.promptText);
  }

  async dismiss(): Promise<void> {
    await this._object.dismiss();
  }
}
