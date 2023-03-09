/*
  Copyright (c) Microsoft Corporation.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import * as React from 'react';
import './xtermWrapper.css';
import type { ITheme, Terminal } from 'xterm';
import type { XtermModule } from './xtermModule';
import { isDarkTheme } from '@web/theme';

export type XtermDataSource = {
  pending: (string | Uint8Array)[];
  clear: () => void,
  write: (data: string | Uint8Array) => void;
  resize: (cols: number, rows: number) => void;
};

export const XtermWrapper: React.FC<{ source: XtermDataSource }> = ({
  source
}) => {
  const xtermElement = React.useRef<HTMLDivElement>(null);
  const [modulePromise] = React.useState<Promise<XtermModule>>(import('./xtermModule').then(m => m.default));
  const [terminal] = React.useState<{ value?: Terminal }>({});
  React.useEffect(() => {
    (async () => {
      // Always load the module first.
      const { Terminal, FitAddon } = await modulePromise;
      const element = xtermElement.current;
      if (!element)
        return;

      if (terminal.value)
        return;

      const newTerminal = new Terminal({
        convertEol: true,
        fontSize: 13,
        fontFamily: 'var(--vscode-editor-font-family)',
        theme: isDarkTheme() ? darkTheme : lightTheme
      });

      const fitAddon = new FitAddon();
      newTerminal.loadAddon(fitAddon);
      for (const p of source.pending)
        newTerminal.write(p);
      source.write = (data => {
        source.pending.push(data);
        newTerminal.write(data);
      });
      source.clear = () => {
        source.pending = [];
        newTerminal.clear();
      };
      newTerminal.open(element);
      fitAddon.fit();
      terminal.value = newTerminal;
      const resizeObserver = new ResizeObserver(() => {
        source.resize(newTerminal.cols, newTerminal.rows);
        fitAddon.fit();
      });
      resizeObserver.observe(element);
    })();
  }, [modulePromise, terminal, xtermElement, source]);
  return <div className='xterm-wrapper' style={{ flex: 'auto' }} ref={xtermElement}>
  </div>;
};

const lightTheme: ITheme = {
  foreground: '#383a42',
  background: '#fafafa',
  cursor: '#383a42',
  black: '#000000',
  red: '#e45649',
  green: '#50a14f',
  yellow: '#c18401',
  blue: '#4078f2',
  magenta: '#a626a4',
  cyan: '#0184bc',
  white: '#a0a0a0',
  brightBlack: '#000000',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#d19a66',
  brightBlue: '#4078f2',
  brightMagenta: '#a626a4',
  brightCyan: '#0184bc',
  brightWhite: '#383a42',
  selectionBackground: '#d7d7d7',
  selectionForeground: '#383a42',
};

const darkTheme: ITheme = {
  foreground: '#f8f8f2',
  background: '#1e1e1e',
  cursor: '#f8f8f0',
  black: '#000000',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#bfbfbf',
  brightBlack: '#4d4d4d',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#e6e6e6',
  selectionBackground: '#44475a',
  selectionForeground: '#f8f8f2',
};
