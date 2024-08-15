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
import { createGuid, getPackageManagerExecCommand, ManualPromise } from 'playwright-core/lib/utils';
import type { FullConfigInternal, FullProjectInternal } from '../common/config';
import { createFileMatcher, createFileMatcherFromArguments } from '../util';
import type { Matcher } from '../util';
import { buildProjectsClosure, filterProjects } from './projectUtils';
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

export async function runWatchModeLoop(config: FullConfigInternal): Promise<FullResult['status']> {
  const testServerDispatcher = new TestServerDispatcher({ configDir: config.configDir, resolvedConfigFile: config.config.configFile });
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

  const dirtyTestFiles = new Map<FullProjectInternal, Set<string>>();
  const onDirtyTestFiles: { resolve?(): void } = {};
  const failedTestIdCollector = new Set<string>();

  testServerConnection.onTestFilesChanged(({ testFiles }) => onTestFilesChanged(testFiles));
  testServerConnection.onReport(report => {
    if (report.method === 'onTestEnd') {
      const { result: { status }, test: { testId, expectedStatus } } = report.params;
      if (status !== expectedStatus)
        failedTestIdCollector.add(testId);
      else
        failedTestIdCollector.delete(testId);
    }
  });

  await testServerConnection.initialize({ interceptStdio: false });
  await testServerConnection.runGlobalSetup({});

  await testServerConnection.listTests({});
  await testServerConnection.watch({ fileNames: [] });

  function onTestFilesChanged(testFiles: string[]) {
    const commandLineFileMatcher = config.cliArgs.length ? createFileMatcherFromArguments(config.cliArgs) : () => true;
    const projects = filterProjects(config.projects, config.cliProjectFilter);
    const projectClosure = buildProjectsClosure(projects);
    const projectFilters = new Map<FullProjectInternal, Matcher>();
    for (const [project, type] of projectClosure) {
      const testMatch = createFileMatcher(project.project.testMatch);
      const testIgnore = createFileMatcher(project.project.testIgnore);
      projectFilters.set(project, file => {
        if (!file.startsWith(project.project.testDir) || !testMatch(file) || testIgnore(file))
          return false;
        return type === 'dependency' || commandLineFileMatcher(file);
      });
    }

    let hasMatches = false;
    for (const [project, filter] of projectFilters) {
      const filteredFiles = testFiles.filter(filter);
      if (!filteredFiles.length)
        continue;
      let set = dirtyTestFiles.get(project);
      if (!set) {
        set = new Set();
        dirtyTestFiles.set(project, set);
      }
      filteredFiles.map(f => set!.add(f));
      hasMatches = true;
    }

    if (!hasMatches)
      return;

    onDirtyTestFiles.resolve?.();
  }

  let lastRun: { type: 'changed' | 'regular' | 'failed', failedTestIds?: Set<string>, dirtyTestFiles?: Map<FullProjectInternal, Set<string>> } = { type: 'regular' };
  let result: FullResult['status'] = 'passed';

  // Enter the watch loop.
  await runTests(config, testServerConnection);

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
      const copyOfDirtyTestFiles = new Map(dirtyTestFiles);
      dirtyTestFiles.clear();
      // Resolve files that depend on the changed files.
      await runChangedTests(config, testServerConnection, copyOfDirtyTestFiles);
      lastRun = { type: 'changed', dirtyTestFiles: copyOfDirtyTestFiles };
      continue;
    }

    if (command === 'run') {
      // All means reset filters.
      await runTests(config, testServerConnection);
      lastRun = { type: 'regular' };
      continue;
    }

    if (command === 'project') {
      const { projectNames } = await enquirer.prompt<{ projectNames: string[] }>({
        type: 'multiselect',
        name: 'projectNames',
        message: 'Select projects',
        choices: config.projects.map(p => ({ name: p.project.name })),
      }).catch(() => ({ projectNames: null }));
      if (!projectNames)
        continue;
      config.cliProjectFilter = projectNames.length ? projectNames : undefined;
      await runTests(config, testServerConnection);
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
        config.cliArgs = filePattern.split(' ');
      else
        config.cliArgs = [];
      await runTests(config, testServerConnection);
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
        config.cliGrep = testPattern;
      else
        config.cliGrep = undefined;
      await runTests(config, testServerConnection);
      lastRun = { type: 'regular' };
      continue;
    }

    if (command === 'failed') {
      const failedTestIds = new Set(failedTestIdCollector);
      await runTests(config, testServerConnection, { title: 'running failed tests', testIds: [...failedTestIds] });
      lastRun = { type: 'failed', failedTestIds };
      continue;
    }

    if (command === 'repeat') {
      if (lastRun.type === 'regular') {
        await runTests(config, testServerConnection, { title: 're-running tests' });
        continue;
      } else if (lastRun.type === 'changed') {
        await runChangedTests(config, testServerConnection, lastRun.dirtyTestFiles!, 're-running tests');
      } else if (lastRun.type === 'failed') {
        await runTests(config, testServerConnection, { title: 're-running tests', testIds: [...lastRun.failedTestIds!] });
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


async function runChangedTests(config: FullConfigInternal, testServerConnection: TestServerConnection, filesByProject: Map<FullProjectInternal, Set<string>>, title?: string) {
  const testFiles = new Set<string>();
  for (const files of filesByProject.values())
    files.forEach(f => testFiles.add(f));

  // Collect all the affected projects, follow project dependencies.
  // Prepare to exclude all the projects that do not depend on this file, as if they did not exist.
  const projects = filterProjects(config.projects, config.cliProjectFilter);
  const projectClosure = buildProjectsClosure(projects);
  const affectedProjects = affectedProjectsClosure([...projectClosure.keys()], [...filesByProject.keys()]);
  const affectsAnyDependency = [...affectedProjects].some(p => projectClosure.get(p) === 'dependency');

  // If there are affected dependency projects, do the full run, respect the original CLI.
  // if there are no affected dependency projects, intersect CLI with dirty files
  const locations = affectsAnyDependency ? undefined : [...testFiles];
  await runTests(config, testServerConnection, { title: title || 'files changed', locations });
}

async function runTests(config: FullConfigInternal, testServerConnection: TestServerConnection, options?: {
    title?: string,
    testIds?: string[],
    locations?: string[],
  }) {
  printConfiguration(config, options?.title);

  await testServerConnection.runTests({
    grep: config.cliGrep,
    grepInvert: config.cliGrepInvert,
    testIds: options?.testIds,
    locations: options?.locations ?? config.cliArgs,
    projects: config.cliProjectFilter,
    connectWsEndpoint,
    reuseContext: connectWsEndpoint ? true : undefined,
    workers: connectWsEndpoint ? 1 : undefined,
    headed: connectWsEndpoint ? true : undefined,
  });
}

function affectedProjectsClosure(projectClosure: FullProjectInternal[], affected: FullProjectInternal[]): Set<FullProjectInternal> {
  const result = new Set<FullProjectInternal>(affected);
  for (let i = 0; i < projectClosure.length; ++i) {
    for (const p of projectClosure) {
      for (const dep of p.deps) {
        if (result.has(dep))
          result.add(p);
      }
      if (p.teardown && result.has(p.teardown))
        result.add(p);
    }
  }
  return result;
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

function printConfiguration(config: FullConfigInternal, title?: string) {
  const packageManagerCommand = getPackageManagerExecCommand();
  const tokens: string[] = [];
  tokens.push(`${packageManagerCommand} playwright test`);
  tokens.push(...(config.cliProjectFilter || [])?.map(p => colors.blue(`--project ${p}`)));
  if (config.cliGrep)
    tokens.push(colors.red(`--grep ${config.cliGrep}`));
  if (config.cliArgs)
    tokens.push(...config.cliArgs.map(a => colors.bold(a)));
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

async function toggleShowBrowser(): Promise<string | undefined> {
  if (!showBrowserServer) {
    showBrowserServer = new PlaywrightServer({ mode: 'extension', path: '/' + createGuid(), maxConnections: 1 });
    connectWsEndpoint = await showBrowserServer.listen();
    process.stdout.write(`${colors.dim('Show & reuse browser:')} ${colors.bold('on')}\n`);
  } else {
    await showBrowserServer?.close();
    showBrowserServer = undefined;
    connectWsEndpoint = undefined;
    process.stdout.write(`${colors.dim('Show & reuse browser:')} ${colors.bold('off')}\n`);
    return undefined;
  }
}

type Command = 'run' | 'failed' | 'repeat' | 'changed' | 'project' | 'file' | 'grep' | 'exit' | 'interrupted' | 'toggle-show-browser';
