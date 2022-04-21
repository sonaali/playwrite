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
import { test as _test, expect as _expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { Server } from 'http';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import type { SpawnOptions } from 'child_process';
import debugLogger from 'debug';
import { spawn } from 'child_process';

const debug = debugLogger('itest');
const debugExec = debugLogger('itest:exec');
const debugExecStdout = debugLogger('itest:exec:stdout');
const debugExecStderr = debugLogger('itest:exec:stderr');

function spawnAsync(cmd: string, args: string[], options: SpawnOptions = {}): Promise<{stdout: string, stderr: string, code: number | null, error?: Error}> {
  debugExec([cmd, ...args].join(' '));
  const process = spawn(cmd, args, Object.assign({ windowsHide: true }, options));

  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    if (process.stdout) {
      process.stdout.on('data', data => {
        debugExecStdout(data.toString());
        stdout += data;
      });
    }
    if (process.stderr) {
      process.stderr.on('data', data => {
        debugExecStderr(data.toString());
        stderr += data;
      });
    }
    process.on('close', code => resolve({ stdout, stderr, code }));
    process.on('error', error => resolve({ stdout, stderr, code: 0, error }));
  });
}

const kPublicNpmRegistry = 'https://registry.npmjs.org';
const kContentTypeAbbreviatedMetadata = 'application/vnd.npm.install-v1+json';

/**
 * A minimal NPM Registry Server that can serve local packages, or proxy to the upstream registry.
 * This is useful in test installation behavior of packages that aren't yet published. It's particularly helpful
 * when your installation requires transitive dependencies that are also not yet published.
 *
 * See https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md for information on the offical APIs.
 */

_expect.extend({
  toHaveDownloaded(received: any, browsers: ('chromium' | 'firefox' | 'webkit')[]) {
    if (typeof received !== 'string')
      throw new Error(`Expected argument to be a string.`);

    const downloaded = new Set();
    for (const [, browser] of received.matchAll(/^.*(chromium|firefox|webkit) v\d+ downloaded.*$/img))
      downloaded.add(browser);
    try {
      const expected = [...browsers];
      browsers.sort();
      const actual = [...downloaded];
      actual.sort();
      _expect(actual).toEqual(expected);
    } catch (err) {
      return {
        message: () => `Browser download expectation failed:\n${err.toString()}`,
        pass: false,
      };
    }

    return {
      pass: true,
    };
  }
});

const expect = _expect;
class Registry {
  private _workDir: string;
  private _url: string;
  private _objectsDir: string;
  private _packageMeta: Map<string, [any, string]> = new Map();
  private _log: { pkg: string, status: 'PROXIED' | 'LOCAL', type?: 'tar' | 'metadata' }[] = [];
  private _server: Server;

  constructor(workDir: string, url: string) {
    this._workDir = workDir;
    this._objectsDir = path.join(this._workDir);
    this._url = url;
  }

  url() { return this._url; }

  async shutdown() {
    return new Promise<void>((res, rej) => this._server.close(err => err ? rej(err) : res()));
  }

  async start(packages: { [pkg: string]: string }) {
    await fs.promises.mkdir(this._workDir, { recursive: true });
    await fs.promises.mkdir(this._objectsDir, { recursive: true });

    await Promise.all(Object.entries(packages).map(([pkg, tar]) => this._addPackage(pkg, tar)));

    this._server = http.createServer(async (req, res) => {
      // 1. Only support GET requests
      if (req.method !== 'GET')
        return res.writeHead(405).end();

      // 2. Determine what package is being asked for.
      //    The paths we can handle look like:
      //    - /<userSuppliedPackageName>/*/<userSuppliedTarName i.e. some *.tgz>
      //    - /<userSuppliedPackageName>/*
      //    - /<userSuppliedPackageName>
      const url = new URL(req.url, kPublicNpmRegistry);
      let [/* empty */, userSuppliedPackageName, /* empty */, userSuppliedTarName] = url.pathname.split('/');
      if (userSuppliedPackageName)
        userSuppliedPackageName = decodeURIComponent(userSuppliedPackageName);
      if (userSuppliedTarName)
        userSuppliedTarName = decodeURIComponent(userSuppliedTarName);

      // 3. If we have local metadata, serve directly (otherwise, proxy to upstream).
      if (this._packageMeta.has(userSuppliedPackageName)) {
        const [metadata, objectPath] = this._packageMeta.get(userSuppliedPackageName);
        if (userSuppliedTarName) { // Tarball request.
          if (path.basename(objectPath) !== userSuppliedTarName) {
            res.writeHead(404).end();
            return;
          }
          this._logAccess({ status: 'LOCAL', type: 'tar', pkg: userSuppliedPackageName });
          const fileStream = fs.createReadStream(objectPath);
          fileStream.pipe(res, { end: true });
          fileStream.on('error', console.log);
          res.on('error', console.log);
          return;
        } else { // Metadata request.
          this._logAccess({ status: 'LOCAL', type: 'metadata', pkg: userSuppliedPackageName });
          res.setHeader('content-type', kContentTypeAbbreviatedMetadata);
          res.write(JSON.stringify(metadata, null, ' '));
          res.end();
        }
      } else { // Fall through to official registry
        this._logAccess({ status: 'PROXIED', pkg: userSuppliedPackageName });
        const client = { req, res };
        const toNpm = https.request({
          host: url.host,
          headers: { ...req.headers, 'host': url.host },
          method: req.method,
          path: url.pathname,
          searchParams: url.searchParams,
          protocol: 'https:',
        }, fromNpm => {
          client.res.writeHead(fromNpm.statusCode, fromNpm.statusMessage, fromNpm.headers);
          fromNpm.on('error', err => console.log(`error: `, err));
          fromNpm.pipe(client.res, { end: true });
        });
        client.req.pipe(toNpm);
        client.req.on('error', err => console.log(`error: `, err));
      }
    });

    this._server.listen(Number.parseInt(new URL(this._url).port, 10), 'localhost');
    await new Promise<void>((res, rej) => {
      this._server.on('listening', () => res());
      this._server.on('error', rej);
    });
  }

  public assertLocalPackage(pkg) {
    const summary = this._log.reduce((acc, f) => {
      if (f.pkg === pkg) {
        acc.local = f.status === 'LOCAL' || acc.local;
        acc.proxied = f.status === 'PROXIED' || acc.proxied;
      }

      return acc;
    }, { local: false, proxied: false });

    if (summary.local && !summary.proxied)
      return;

    throw new Error(`${pkg} was not accessed strictly locally: local: ${summary.local}, proxied: ${summary.proxied}`);
  }

  private async _addPackage(pkg: string, tarPath: string) {
    const tmpDir = await fs.promises.mkdtemp(path.join(this._workDir, '.staging-package-'));
    const { stderr, code } = await spawnAsync('tar', ['-xvzf', tarPath, '-C', tmpDir]);
    if (!!code)
      throw new Error(`Failed to untar ${pkg}: ${stderr}`);

    const packageJson = JSON.parse((await fs.promises.readFile(path.join(tmpDir, 'package', 'package.json'))).toString());
    if (pkg !== packageJson.name)
      throw new Error(`Package name mismatch: ${pkg} is called ${packageJson.name} in its package.json`);

    const now = new Date().toISOString();
    const shasum = crypto.createHash('sha1').update(await fs.promises.readFile(tarPath)).digest().toString('hex');
    const tarball = new URL(this._url);
    tarball.pathname = `${tarball.pathname}${tarball.pathname.endsWith('/') ? '' : '/'}${encodeURIComponent(pkg)}/-/${shasum}.tgz`;
    const metadata = {
      'dist-tags': {
        latest: packageJson.version,
        [packageJson.version]: packageJson.version,
      },
      'modified': now,
      'name': pkg,
      'versions': {
        [packageJson.version]: {
          _hasShrinkwrap: false,
          name: pkg,
          version: packageJson.version,
          dependencies: packageJson.dependencies || {},
          optionalDependencies: packageJson.optionalDependencies || {},
          devDependencies: packageJson.devDependencies || {},
          bundleDependencies: packageJson.bundleDependencies || {},
          peerDependencies: packageJson.peerDependencies || {},
          bin: packageJson.bin || {},
          directories: packageJson.directories || [],
          scripts: packageJson.scripts || {},
          dist: {
            tarball: tarball.toString(),
            shasum,
          },
          engines: packageJson.engines || {},
        },
      },
    };

    const object = path.join(this._objectsDir, `${shasum}.tgz`);
    await fs.promises.copyFile(tarPath, object);
    this._packageMeta.set(pkg, [metadata, object]);
  }

  private _logAccess(info: {status: 'PROXIED' | 'LOCAL', pkg: string, type?: 'tar' | 'metadata'}) {
    this._log.push(info);
  }
}

export type SpawnResult = {
  stdout: string,
  stderr: string,
  code: number,
  error?: any,
};

export class ExecOutput {
  public readonly raw: SpawnResult;

  constructor(result: SpawnResult) {
    this.raw = result;
  }

  combined() {
    return `${this.raw.stdout}\n${this.raw.stderr}\n`;
  }
}

export type ExecOptions = { cwd?: string, env?: Record<string, string>, message?: string, expectToExitWithError?: boolean };
export type ArgsOrOptions = [] | [...string[]] | [...string[], ExecOptions] | [ExecOptions];
export const test = _test.extend<{
    _autoCopyScripts: void,
    tmpWorkspace: string,
    nodeVersion: number,
    installedBrowsers: () => Promise<string[]>;
    writeFiles: (nameToContents: Record<string, string>) => Promise<void>,
    exec: (cmd: string, ...argsAndOrOptions: ArgsOrOptions) => Promise<string>
    tsc: (...argsAndOrOptions: ArgsOrOptions) => Promise<string>,
    registry: Registry,
        }>({
          _autoCopyScripts: [async ({ tmpWorkspace }, use) => {
            const dstDir = path.join(tmpWorkspace);
            const sourceDir = path.join(__dirname, 'fixture-scripts');
            const contents = await fs.promises.readdir(sourceDir);
            await Promise.all(contents.map(f => fs.promises.copyFile(path.join(sourceDir, f), path.join(dstDir, f))));
            await use();
          }, {
            auto: true,
          }],
          nodeVersion: async ({}, use) => {
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
            const tmpWorkspace = await fs.promises.mkdtemp(path.join('/tmp/pwt/workspaces', 'playwright-installation-tests-workspace-'));
            debug(`Workspace Folder: ${tmpWorkspace}`);
            await spawnAsync('npm', ['init', '-y'], {
              cwd: tmpWorkspace,
            });

            await use(tmpWorkspace);
            // NOTE WELL: We do not remove for easier debugging
            // await promisify(rimraf)(tmpWorkspace);
          },
          registry: async ({}, use, testInfo) => {
            const port = testInfo.workerIndex + 16123;
            const url = `http://localhost:${port}`;
            const registry = new Registry(testInfo.outputPath('registry'), url);
            await registry.start(JSON.parse((await fs.promises.readFile(path.join(__dirname, './registry.json'))).toString()));
            await use(registry);
            await registry.shutdown();
          },
          installedBrowsers: async ({ tmpWorkspace }, use) => {
            await use(async () => fs.promises.readdir(path.join(tmpWorkspace, 'browsers')).catch(() => []).then(files => files.map(f => f.split('-')[0]).filter(f => f !== 'ffmpeg' && !f.startsWith('.'))));
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
                throw new Error(`Expected the command to exit cleanl (0 status code), but exited with ${result.code}.${message}`);
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
