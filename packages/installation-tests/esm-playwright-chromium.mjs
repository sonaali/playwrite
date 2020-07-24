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

import { chromium, selectors, devices, errors } from 'playwright-chromium';
import playwright from 'playwright-chromium';
import errorsFile from 'playwright-chromium/lib/errors.js';

if (playwright.chromium !== chromium)
  process.exit(1);

if (playwright.errors !== errors)
  process.exit(1);
if (errors.TimeoutError !== errorsFile.TimeoutError)
  process.exit(1);

(async () => {
  for (const browserType of [chromium]) {
    const browser = await browserType.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.evaluate(() => navigator.userAgent);
    await browser.close();
  }
  console.log(`esm SUCCESS`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
