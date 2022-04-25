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

// eslint-disable-next-line spaced-comment
/// <reference path="./expect.d.ts" />

import { test as _test, expect as _expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import debugLogger from 'debug';
import { Registry }  from './registry';
import { spawnAsync } from './spawnAsync';
import { TMP_WORKSPACES } from './constants';

const debug = debugLogger('itest');

/**
 * A minimal NPM Registry Server that can serve local packages, or proxy to the upstream registry.
 * This is useful in test installation behavior of packages that aren't yet published. It's particularly helpful
 * when your installation requires transitive dependencies that are also not yet published.
 *
 * See https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md for information on the offical APIs.
 */

_expect.extend({
  toHaveLoggedSoftwareDownload(received: any, browsers: ('chromium' | 'firefox' | 'webkit' | 'ffmpeg')[]) {
    if (typeof received !== 'string')
      throw new Error(`Expected argument to be a string.`);

    const downloaded = new Set();
    for (const [, browser] of received.matchAll(/^.*(chromium|firefox|webkit|ffmpeg) v\d+ downloaded.*$/img))
      downloaded.add(browser);

    const expected = browsers;
    if (expected.length === downloaded.size && expected.every(browser => downloaded.has(browser)))
      return { pass: true };
    return {
      pass: false,
      message: () => [
        `Browser download expectation failed!`,
        ` expected: ${[...expected].sort().join(', ')}`,
        `   actual: ${[...downloaded].sort().join(', ')}`,
      ].join('\n'),
    };
  }
});

const expect = _expect;

export type ExecOptions = { cwd?: string, env?: Record<string, string>, message?: string, expectToExitWithError?: boolean };
export type ArgsOrOptions = [] | [...string[]] | [...string[], ExecOptions] | [ExecOptions];
export const test = _test.extend<{
    _auto: void,
    tmpWorkspace: string,
    nodeMajorVersion: number,
    installedSoftwareOnDisk: (registryPath?: string) => Promise<string[]>;
    writeFiles: (nameToContents: Record<string, string>) => Promise<void>,
    exec: (cmd: string, ...argsAndOrOptions: ArgsOrOptions) => Promise<string>
    tsc: (...argsAndOrOptions: ArgsOrOptions) => Promise<string>,
    registry: Registry,
        }>({
          _auto: [async ({ tmpWorkspace, exec }, use) => {
            await exec('npm init -y');
            const sourceDir = path.join(__dirname, 'fixture-scripts');
            const contents = await fs.promises.readdir(sourceDir);
            await Promise.all(contents.map(f => fs.promises.copyFile(path.join(sourceDir, f), path.join(tmpWorkspace, f))));
            await use();
          }, {
            auto: true,
          }],
          nodeMajorVersion: async ({}, use) => {
            await use(+process.versions.node.split('.')[0]);
          },
          writeFiles: async ({ tmpWorkspace }, use) => {
            await use(async (nameToContents: Record<string, string>) => {
              for (const [name, contents] of Object.entries(nameToContents))
                await fs.promises.writeFile(path.join(tmpWorkspace, name), contents);
            });
          },
          tmpWorkspace: async ({}, use) => {
            // We want a location that won't have a node_modules dir anywhere along its path
            const tmpWorkspace = path.join(TMP_WORKSPACES, path.basename(test.info().outputDir));
            await fs.promises.mkdir(tmpWorkspace);
            debug(`Workspace Folder: ${tmpWorkspace}`);
            await use(tmpWorkspace);
          },
          registry: async ({}, use, testInfo) => {
            const port = testInfo.workerIndex + 16123;
            const url = `http://127.0.0.1:${port}`;
            const registry = new Registry(testInfo.outputPath('registry'), url);
            await registry.start(JSON.parse((await fs.promises.readFile(path.join(__dirname, '.registry.json'), 'utf8'))));
            await use(registry);
            await registry.shutdown();
          },
          installedSoftwareOnDisk: async ({ tmpWorkspace }, use) => {
            await use(async (registryPath?: string) => fs.promises.readdir(registryPath || path.join(tmpWorkspace, 'browsers')).catch(() => []).then(files => files.map(f => f.split('-')[0]).filter(f => !f.startsWith('.'))));
          },
          exec: async ({ registry, tmpWorkspace }, use, testInfo) => {
            await use(async (cmd: string, ...argsAndOrOptions: [] | [...string[]] | [...string[], ExecOptions] | [ExecOptions]) => {
              let args: string[] = [];
              let options: ExecOptions = {};
              if (typeof argsAndOrOptions[argsAndOrOptions.length - 1] === 'object')
                options = argsAndOrOptions.pop() as ExecOptions;

              args = argsAndOrOptions as string[];

              let result!: Awaited<ReturnType<typeof spawnAsync>>;
              await test.step(`exec: ${[cmd, ...args].join(' ')}`, async () => {
                result = await spawnAsync(cmd, args, {
                  shell: true,
                  cwd: options.cwd ?? tmpWorkspace,
                  // NB: We end up running npm-in-npm, so it's important that we do NOT forward process.env and instead cherry-pick environment variables.
                  env: {
                    'PATH': process.env.PATH,
                    'DISPLAY': process.env.DISPLAY,
                    'XAUTHORITY': process.env.XAUTHORITY,
                    'PLAYWRIGHT_BROWSERS_PATH': path.join(tmpWorkspace, 'browsers'),
                    'npm_config_cache': testInfo.outputPath('npm_cache'),
                    'npm_config_registry': registry.url(),
                    'npm_config_prefix': testInfo.outputPath('npm_global'),
                    ...options.env,
                  }
                });
              });

              const stdio = `${result.stdout}\n${result.stderr}`;

              await testInfo.attach(`${[cmd, ...args].join(' ')}`, { body: `COMMAND: ${[cmd, ...args].join(' ')}\n\nEXIT CODE: ${result.code}\n\n====== STDIO + STDERR ======\n\n${stdio}` });

              // This means something is really off with spawn
              if (result.error)
                throw result.error;

              // User expects command to fail
              if (options.expectToExitWithError) {
                if (result.code === 0) {
                  const message = options.message ? ` Message: ${options.message}` : '';
                  throw new Error(`Expected the command to exit with an error, but exited cleanly.${message}`);
                }
              } else if (result.code !== 0) {
                const message = options.message ? ` Message: ${options.message}` : '';
                throw new Error(`Expected the command to exit cleanly (0 status code), but exited with ${result.code}.${message}`);
              }

              return stdio;

            });
          },
          tsc: async ({ exec }, use) => {
            await exec('npm i --foreground-scripts typescript@3.8 @types/node@14');
            await use((...args: ArgsOrOptions) => exec('npx', '-p', 'typescript@3.8', 'tsc', ...args));
          },
        });


export { expect };
