/**
 * Copyright Microsoft Corporation. All rights reserved.
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

import readline from 'readline';
import path from 'path';
import { createGuid, getPackageManagerExecCommand, ManualPromise } from 'playwright-core/lib/utils';
import type { ConfigLocation } from '../common/config';
import type { FullResult } from '../../types/testReporter';
import { colors } from 'playwright-core/lib/utilsBundle';
import { enquirer } from '../utilsBundle';
import { separator } from '../reporters/base';
import { PlaywrightServer } from 'playwright-core/lib/remote/playwrightServer';
import { TestServerDispatcher } from './testServer';
import { EventEmitter } from 'stream';
import { type TestServerSocket, TestServerConnection } from '../isomorphic/testServerConnection';

class InMemoryServerSocket extends EventEmitter implements TestServerSocket {
  public readonly send: (data: string) => void;
  public readonly close: () => void;

  constructor(send: (data: any) => void,  close: () => void = () => {}) {
    super();
    this.send = send;
    this.close = close;
  }

  addEventListener(event: string, listener: (e: any) => void) {
    this.addListener(event, listener);
  }
}

interface WatchModeOptions {
  files?: string[];
  projects?: string[];
  grep?: string;
  onlyChanged?: string;
}

export async function runWatchModeLoop(configLocation: ConfigLocation, initialOptions: WatchModeOptions): Promise<FullResult['status']> {
  const options: WatchModeOptions = { ...initialOptions };

  const testServerDispatcher = new TestServerDispatcher(configLocation);
  const inMemorySocket = new InMemoryServerSocket(
      async data => {
        const { id, method, params } = JSON.parse(data);
        try {
          const result = await testServerDispatcher.transport.dispatch(method, params);
          inMemorySocket.emit('message', { data: JSON.stringify({ id, result }) });
        } catch (e) {
          inMemorySocket.emit('message', { data: JSON.stringify({ id, error: String(e) }) });
        }
      }
  );
  testServerDispatcher.transport.sendEvent = (method, params) => {
    inMemorySocket.emit('message', { data: JSON.stringify({ method, params }) });
  };
  const testServerConnection = new TestServerConnection(inMemorySocket);
  inMemorySocket.emit('open');

  const dirtyTestFiles: string[] = [];
  const onDirtyTestFiles: { resolve?(): void } = {};
  const failedTestIdCollector = new Set<string>();
  const projectNames = new Set<string>();

  testServerConnection.onTestFilesChanged(async ({ testFiles: changedFiles }) => {
    if (changedFiles.length === 0)
      return;

    const { report } = await testServerConnection.listTests({ locations: options.files, projects: options.projects, grep: options.grep, onlyChanged: options.onlyChanged });
    const rootDir = report.find(r => r.method === 'onConfigure')!.params.config.rootDir;
    for (const suite of report.find(r => r.method === 'onProject')!.params.project.suites) {
      const suitePath = path.join(rootDir, suite.location.file);
      if (changedFiles.includes(suitePath))
        dirtyTestFiles.push(suitePath);
    }

    if (dirtyTestFiles.length === 0)
      return;

    onDirtyTestFiles.resolve?.();
  });
  testServerConnection.onReport(report => {
    if (report.method === 'onProject') {
      const { name } = report.params.project;
      projectNames.add(name);
    }

    if (report.method === 'onTestEnd') {
      const { result: { status }, test: { testId, expectedStatus } } = report.params;
      if (status !== expectedStatus)
        failedTestIdCollector.add(testId);
      else
        failedTestIdCollector.delete(testId);
    }
  });

  await testServerConnection.initialize({ interceptStdio: false, watchTestDirs: true });
  await testServerConnection.runGlobalSetup({});

  await testServerConnection.listTests({ locations: options.files, projects: options.projects, grep: options.grep, onlyChanged: options.onlyChanged });

  let lastRun: { type: 'changed' | 'regular' | 'failed', failedTestIds?: Set<string>, dirtyTestFiles?: string[] } = { type: 'regular' };
  let result: FullResult['status'] = 'passed';

  // Enter the watch loop.
  await runTests(options, testServerConnection);

  while (true) {
    printPrompt();
    const readCommandPromise = readCommand();
    await Promise.race([
      new Promise<void>(resolve => { onDirtyTestFiles.resolve = resolve; }),
      readCommandPromise,
    ]);
    if (!readCommandPromise.isDone())
      readCommandPromise.resolve('changed');

    const command = await readCommandPromise;

    if (command === 'changed') {
      await runChangedTests(options, testServerConnection, dirtyTestFiles);
      lastRun = { type: 'changed', dirtyTestFiles: [...dirtyTestFiles] };
      continue;
    }

    if (command === 'run') {
      // All means reset filters.
      await runTests(options, testServerConnection);
      lastRun = { type: 'regular' };
      continue;
    }

    if (command === 'project') {
      const { selectedProjects } = await enquirer.prompt<{ selectedProjects: string[] }>({
        type: 'multiselect',
        name: 'selectedProjects',
        message: 'Select projects',
        choices: [...projectNames],
      }).catch(() => ({ selectedProjects: null }));
      if (!selectedProjects)
        continue;
      options.projects = selectedProjects.length ? selectedProjects : undefined;
      await runTests(options, testServerConnection);
      lastRun = { type: 'regular' };
      continue;
    }

    if (command === 'file') {
      const { filePattern } = await enquirer.prompt<{ filePattern: string }>({
        type: 'text',
        name: 'filePattern',
        message: 'Input filename pattern (regex)',
      }).catch(() => ({ filePattern: null }));
      if (filePattern === null)
        continue;
      if (filePattern.trim())
        options.files = filePattern.split(' ');
      else
        options.files = undefined;
      await runTests(options, testServerConnection);
      lastRun = { type: 'regular' };
      continue;
    }

    if (command === 'grep') {
      const { testPattern } = await enquirer.prompt<{ testPattern: string }>({
        type: 'text',
        name: 'testPattern',
        message: 'Input test name pattern (regex)',
      }).catch(() => ({ testPattern: null }));
      if (testPattern === null)
        continue;
      if (testPattern.trim())
        options.grep = testPattern;
      else
        options.grep = undefined;
      await runTests(options, testServerConnection);
      lastRun = { type: 'regular' };
      continue;
    }

    if (command === 'failed') {
      const failedTestIds = new Set(failedTestIdCollector);
      await runTests({}, testServerConnection, { title: 'running failed tests', testIds: [...failedTestIds] });
      lastRun = { type: 'failed', failedTestIds };
      continue;
    }

    if (command === 'repeat') {
      if (lastRun.type === 'regular') {
        await runTests(options, testServerConnection, { title: 're-running tests' });
        continue;
      } else if (lastRun.type === 'changed') {
        await runChangedTests(options, testServerConnection, lastRun.dirtyTestFiles!, 're-running tests');
      } else if (lastRun.type === 'failed') {
        await runTests({}, testServerConnection, { title: 're-running tests', testIds: [...lastRun.failedTestIds!] });
      }
      continue;
    }

    if (command === 'toggle-show-browser') {
      await toggleShowBrowser();
      continue;
    }

    if (command === 'exit')
      break;

    if (command === 'interrupted') {
      result = 'interrupted';
      break;
    }
  }

  const teardown = await testServerConnection.runGlobalTeardown({});

  return result === 'passed' ? teardown.status : result;
}


async function runChangedTests(watchOptions: WatchModeOptions, testServerConnection: TestServerConnection, changedFiles: string[], title?: string) {
  await runTests(watchOptions, testServerConnection, { title: title || 'files changed', changedFiles });
}

async function runTests(watchOptions: WatchModeOptions, testServerConnection: TestServerConnection, options?: {
    title?: string,
    testIds?: string[],
  changedFiles?: string[],
  }) {
  printConfiguration(watchOptions, options?.title);

  await testServerConnection.runTests({
    grep: watchOptions.grep,
    testIds: options?.testIds,
    locations: watchOptions?.files,
    files: options?.changedFiles,
    projects: watchOptions.projects,
    onlyChanged: watchOptions.onlyChanged,
    connectWsEndpoint,
    reuseContext: connectWsEndpoint ? true : undefined,
    workers: connectWsEndpoint ? 1 : undefined,
    headed: connectWsEndpoint ? true : undefined,
  });
}

function readCommand(): ManualPromise<Command> {
  const result = new ManualPromise<Command>();
  const rl = readline.createInterface({ input: process.stdin, escapeCodeTimeout: 50 });
  readline.emitKeypressEvents(process.stdin, rl);
  if (process.stdin.isTTY)
    process.stdin.setRawMode(true);

  const handler = (text: string, key: any) => {
    if (text === '\x03' || text === '\x1B' || (key && key.name === 'escape') || (key && key.ctrl && key.name === 'c')) {
      result.resolve('interrupted');
      return;
    }
    if (process.platform !== 'win32' && key && key.ctrl && key.name === 'z') {
      process.kill(process.ppid, 'SIGTSTP');
      process.kill(process.pid, 'SIGTSTP');
    }
    const name = key?.name;
    if (name === 'q') {
      result.resolve('exit');
      return;
    }
    if (name === 'h') {
      process.stdout.write(`${separator()}
Run tests
  ${colors.bold('enter')}    ${colors.dim('run tests')}
  ${colors.bold('f')}        ${colors.dim('run failed tests')}
  ${colors.bold('r')}        ${colors.dim('repeat last run')}
  ${colors.bold('q')}        ${colors.dim('quit')}

Change settings
  ${colors.bold('c')}        ${colors.dim('set project')}
  ${colors.bold('p')}        ${colors.dim('set file filter')}
  ${colors.bold('t')}        ${colors.dim('set title filter')}
  ${colors.bold('s')}        ${colors.dim('toggle show & reuse the browser')}
`);
      return;
    }

    switch (name) {
      case 'return': result.resolve('run'); break;
      case 'r': result.resolve('repeat'); break;
      case 'c': result.resolve('project'); break;
      case 'p': result.resolve('file'); break;
      case 't': result.resolve('grep'); break;
      case 'f': result.resolve('failed'); break;
      case 's': result.resolve('toggle-show-browser'); break;
    }
  };

  process.stdin.on('keypress', handler);
  void result.finally(() => {
    process.stdin.off('keypress', handler);
    rl.close();
    if (process.stdin.isTTY)
      process.stdin.setRawMode(false);
  });
  return result;
}

let showBrowserServer: PlaywrightServer | undefined;
let connectWsEndpoint: string | undefined = undefined;
let seq = 0;

function printConfiguration(options: WatchModeOptions, title?: string) {
  const packageManagerCommand = getPackageManagerExecCommand();
  const tokens: string[] = [];
  tokens.push(`${packageManagerCommand} playwright test`);
  if (options.projects)
    tokens.push(...options.projects.map(p => colors.blue(`--project ${p}`)));
  if (options.grep)
    tokens.push(colors.red(`--grep ${options.grep}`));
  if (options.onlyChanged)
    tokens.push(colors.yellow(`--only-changed ${options.onlyChanged}`));
  if (options.files)
    tokens.push(...options.files.map(a => colors.bold(a)));
  if (title)
    tokens.push(colors.dim(`(${title})`));
  if (seq)
    tokens.push(colors.dim(`#${seq}`));
  ++seq;
  const lines: string[] = [];
  const sep = separator();
  lines.push('\x1Bc' + sep);
  lines.push(`${tokens.join(' ')}`);
  lines.push(`${colors.dim('Show & reuse browser:')} ${colors.bold(showBrowserServer ? 'on' : 'off')}`);
  process.stdout.write(lines.join('\n'));
}

function printPrompt() {
  const sep = separator();
  process.stdout.write(`
${sep}
${colors.dim('Waiting for file changes. Press')} ${colors.bold('enter')} ${colors.dim('to run tests')}, ${colors.bold('q')} ${colors.dim('to quit or')} ${colors.bold('h')} ${colors.dim('for more options.')}
`);
}

async function toggleShowBrowser() {
  if (!showBrowserServer) {
    showBrowserServer = new PlaywrightServer({ mode: 'extension', path: '/' + createGuid(), maxConnections: 1 });
    connectWsEndpoint = await showBrowserServer.listen();
    process.stdout.write(`${colors.dim('Show & reuse browser:')} ${colors.bold('on')}\n`);
  } else {
    await showBrowserServer?.close();
    showBrowserServer = undefined;
    connectWsEndpoint = undefined;
    process.stdout.write(`${colors.dim('Show & reuse browser:')} ${colors.bold('off')}\n`);
  }
}

type Command = 'run' | 'failed' | 'repeat' | 'changed' | 'project' | 'file' | 'grep' | 'exit' | 'interrupted' | 'toggle-show-browser';
