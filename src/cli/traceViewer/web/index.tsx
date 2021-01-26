1;/**
 * Copyright (c) Microsoft Corporation.
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

import { TraceModel, VideoMetaInfo, trace } from '../traceModel';
import './third_party/vscode/codicon.css';
import { Workbench } from './ui/workbench';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { applyTheme } from './theme';

declare global {
  interface Window {
    getTraceModel(): Promise<TraceModel>;
    readFile(filePath: string): Promise<string>;
    readResource(sha1: string): Promise<string>;
    renderSnapshot(arg: { action: trace.ActionTraceEvent, snapshot: { snapshotId?: string, snapshotTime?: number } }): void;
  }
}

(async () => {
  applyTheme();
  const traceModel = await window.getTraceModel();
  ReactDOM.render(<Workbench traceModel={traceModel} />, document.querySelector('#root'));
})();
