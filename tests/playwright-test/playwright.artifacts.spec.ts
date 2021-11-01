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

import { test, expect } from './playwright-test-fixtures';
import fs from 'fs';
import path from 'path';

function listFiles(dir: string): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    result.push(entry.name);
    if (entry.isDirectory())
      result.push(...listFiles(path.join(dir, entry.name)).map(x => '  ' + x));
  }
  return result;
}

const testFiles = {
  'artifacts.spec.ts': `
    import fs from 'fs';
    import os from 'os';
    import path from 'path';
    import rimraf from 'rimraf';

    const { test } = pwt;

    test.describe('shared', () => {
      let page;
      test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({});
        await page.setContent('<button>Click me</button><button>And me</button>');
      });

      test.afterAll(async () => {
        await page.close();
      });

      test('shared passing', async ({ }) => {
        await page.click('text=Click me');
      });

      test('shared  failing', async ({ }) => {
        await page.click('text=And me');
        expect(1).toBe(2);
      });
    });

    test('passing', async ({ page }) => {
      await page.setContent('I am the page');
    });

    test('two contexts', async ({ page, browser }) => {
      await page.setContent('I am the page');

      const page2 = await browser.newPage();
      await page2.setContent('I am the page');
      await page2.close();
    });

    test('failing', async ({ page }) => {
      await page.setContent('I am the page');
      expect(1).toBe(2);
    });

    test('two contexts failing', async ({ page, browser }) => {
      await page.setContent('I am the page');

      const page2 = await browser.newPage();
      await page2.setContent('I am the page');
      expect(1).toBe(2);
      await page2.close();
    });

    test('own context passing', async ({ browser }) => {
      const page = await browser.newPage();
      await page.setContent('<button>Click me</button><button>And me</button>');
      await page.click('text=Click me');
      await page.close();
    });

    test('own context failing', async ({ browser }) => {
      const page = await browser.newPage();
      await page.setContent('<button>Click me</button><button>And me</button>');
      await page.click('text=Click me');
      await page.close();
      expect(1).toBe(2);
    });

    const testPersistent = test.extend({
      page: async ({ playwright, browserName }, use) => {
        const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'user-data-dir-'));
        const context = await playwright[browserName].launchPersistentContext(dir);
        await use(context.pages()[0]);
        await context.close();
        rimraf.sync(dir);
      },
    });

    testPersistent('persistent passing', async ({ page }) => {
      await page.setContent('<button>Click me</button><button>And me</button>');
    });

    testPersistent('persistent failing', async ({ page }) => {
      await page.setContent('<button>Click me</button><button>And me</button>');
      expect(1).toBe(2);
    });
  `,
};

test('should work with screenshot: on', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    ...testFiles,
    'playwright.config.ts': `
      module.exports = { use: { screenshot: 'on' } };
    `,
  }, { workers: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(5);
  expect(result.failed).toBe(5);
  expect(listFiles(testInfo.outputPath('test-results'))).toEqual([
    'artifacts-failing',
    '  test-failed-1.png',
    'artifacts-own-context-failing',
    '  test-failed-1.png',
    'artifacts-own-context-passing',
    '  test-finished-1.png',
    'artifacts-passing',
    '  test-finished-1.png',
    'artifacts-persistent-failing',
    '  test-failed-1.png',
    'artifacts-persistent-passing',
    '  test-finished-1.png',
    'artifacts-shared-shared-failing',
    '  test-failed-1.png',
    'artifacts-shared-shared-passing',
    '  test-finished-1.png',
    'artifacts-two-contexts',
    '  test-finished-1.png',
    '  test-finished-2.png',
    'artifacts-two-contexts-failing',
    '  test-failed-1.png',
    '  test-failed-2.png',
    'report.json',
  ]);
});

test('should work with screenshot: only-on-failure', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    ...testFiles,
    'playwright.config.ts': `
      module.exports = { use: { screenshot: 'only-on-failure' } };
    `,
  }, { workers: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(5);
  expect(result.failed).toBe(5);
  expect(listFiles(testInfo.outputPath('test-results'))).toEqual([
    'artifacts-failing',
    '  test-failed-1.png',
    'artifacts-own-context-failing',
    '  test-failed-1.png',
    'artifacts-persistent-failing',
    '  test-failed-1.png',
    'artifacts-shared-shared-failing',
    '  test-failed-1.png',
    'artifacts-two-contexts-failing',
    '  test-failed-1.png',
    '  test-failed-2.png',
    'report.json',
  ]);
});

test('should work with trace: on', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    ...testFiles,
    'playwright.config.ts': `
      module.exports = { use: { trace: 'on' } };
    `,
  }, { workers: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(5);
  expect(result.failed).toBe(5);
  expect(listFiles(testInfo.outputPath('test-results'))).toEqual([
    'artifacts-failing',
    '  trace-failing.zip',
    'artifacts-own-context-failing',
    '  trace-own-context-failing.zip',
    'artifacts-own-context-passing',
    '  trace-own-context-passing.zip',
    'artifacts-passing',
    '  trace-passing.zip',
    'artifacts-persistent-failing',
    '  trace-persistent-failing.zip',
    'artifacts-persistent-passing',
    '  trace-persistent-passing.zip',
    'artifacts-shared-shared-failing',
    '  trace-shared-failing.zip',
    'artifacts-shared-shared-passing',
    '  trace-shared-passing.zip',
    'artifacts-two-contexts',
    '  trace-two-contexts-1.zip',
    '  trace-two-contexts.zip',
    'artifacts-two-contexts-failing',
    '  trace-two-contexts-failing-1.zip',
    '  trace-two-contexts-failing.zip',
    'report.json',
  ]);
});

test('should work with trace: retain-on-failure', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    ...testFiles,
    'playwright.config.ts': `
      module.exports = { use: { trace: 'retain-on-failure' } };
    `,
  }, { workers: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(5);
  expect(result.failed).toBe(5);
  expect(listFiles(testInfo.outputPath('test-results'))).toEqual([
    'artifacts-failing',
    '  trace-failing.zip',
    'artifacts-own-context-failing',
    '  trace-own-context-failing.zip',
    'artifacts-persistent-failing',
    '  trace-persistent-failing.zip',
    'artifacts-shared-shared-failing',
    '  trace-shared-failing.zip',
    'artifacts-two-contexts-failing',
    '  trace-two-contexts-failing-1.zip',
    '  trace-two-contexts-failing.zip',
    'report.json',
  ]);
});

test('should work with trace: on-first-retry', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    ...testFiles,
    'playwright.config.ts': `
      module.exports = { use: { trace: 'on-first-retry' } };
    `,
  }, { workers: 1, retries: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(5);
  expect(result.failed).toBe(5);
  expect(listFiles(testInfo.outputPath('test-results'))).toEqual([
    'artifacts-failing-retry1',
    '  trace-failing.zip',
    'artifacts-own-context-failing-retry1',
    '  trace-own-context-failing.zip',
    'artifacts-persistent-failing-retry1',
    '  trace-persistent-failing.zip',
    'artifacts-shared-shared-failing-retry1',
    '  trace-shared-failing.zip',
    'artifacts-two-contexts-failing-retry1',
    '  trace-two-contexts-failing-1.zip',
    '  trace-two-contexts-failing.zip',
    'report.json',
  ]);
});

test('should stop tracing with trace: on-first-retry, when not retrying', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = { use: { trace: 'on-first-retry' } };
    `,
    'a.spec.ts': `
      const { test } = pwt;

      test.describe('shared', () => {
        let page;
        test.beforeAll(async ({ browser }) => {
          page = await browser.newPage();
        });

        test.afterAll(async () => {
          await page.close();
        });

        test('flaky', async ({}, testInfo) => {
          expect(testInfo.retry).toBe(1);
        });

        test('no tracing', async ({}, testInfo) => {
          const e = await page.context().tracing.stop({ path: 'ignored' }).catch(e => e);
          expect(e.message).toContain('Must start tracing before stopping');
        });
      });
    `,
  }, { workers: 1, retries: 1 });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.flaky).toBe(1);
  expect(listFiles(testInfo.outputPath('test-results'))).toEqual([
    'a-shared-flaky-retry1',
    '  trace-flaky.zip',
    'report.json',
  ]);
});

test('should not throw with trace: on-first-retry and two retries in the same worker', async ({ runInlineTest }, testInfo) => {
  const files = {};
  for (let i = 0; i < 6; i++) {
    files[`a${i}.spec.ts`] = `
      import { test } from './helper';
      test('flaky', async ({ myContext }, testInfo) => {
        await new Promise(f => setTimeout(f, 200 + Math.round(Math.random() * 1000)));
        expect(testInfo.retry).toBe(1);
      });
      test('passing', async ({ myContext }, testInfo) => {
        await new Promise(f => setTimeout(f, 200 + Math.round(Math.random() * 1000)));
      });
    `;
  }
  const result = await runInlineTest({
    ...files,
    'playwright.config.ts': `
      module.exports = { use: { trace: 'on-first-retry' } };
    `,
    'helper.ts': `
      const { test: base } = pwt;
      export const test = base.extend({
        myContext: [async ({ browser }, use) => {
          const c = await browser.newContext();
          await use(c);
          await c.close();
        }, { scope: 'worker' }]
      })
    `,
  }, { workers: 3, retries: 1 });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(6);
  expect(result.flaky).toBe(6);
});
