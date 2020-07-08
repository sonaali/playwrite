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

module.exports.addTests = function({browserType, HEADLESS}) {
  const {FFOX, CHROMIUM, LINUX, WEBKIT} = require('./utils').testOptions(browserType);

  describe('Page.focus', function() {
    it('should work', async function({page, server}) {
      await page.setContent(`<div id=d1 tabIndex=0></div>`);
      expect(await page.evaluate(() => document.activeElement.nodeName)).toBe('BODY');
      await page.focus('#d1');
      expect(await page.evaluate(() => document.activeElement.id)).toBe('d1');
    });
    it('should emit focus event', async function({page, server}) {
      await page.setContent(`<div id=d1 tabIndex=0></div>`);
      let focused = false;
      await page.exposeFunction('focusEvent', () => focused = true);
      await page.evaluate(() => d1.addEventListener('focus', focusEvent));
      await page.focus('#d1');
      expect(focused).toBe(true);
    });
    it('should emit blur event', async function({page, server}) {
      await page.setContent(`<div id=d1 tabIndex=0>DIV1</div><div id=d2 tabIndex=0>DIV2</div>`);
      await page.focus('#d1');
      let focused = false;
      let blurred = false;
      await page.exposeFunction('focusEvent', () => focused = true);
      await page.exposeFunction('blurEvent', () => blurred = true);
      await page.evaluate(() => d1.addEventListener('blur', blurEvent));
      await page.evaluate(() => d2.addEventListener('focus', focusEvent));
      await page.focus('#d2');
      expect(focused).toBe(true);
      expect(blurred).toBe(true);
    });
    it.fail(WEBKIT && !LINUX)('should traverse focus', async function({page, server}) {
      await page.setContent(`<input id="i1"><input id="i2">`);
      let focused = false;
      await page.exposeFunction('focusEvent', () => focused = true);
      await page.evaluate(() => i2.addEventListener('focus', focusEvent));

      await page.focus('#i1');
      await page.keyboard.type("First");
      await page.keyboard.press("Tab");
      await page.keyboard.type("Last");

      expect(focused).toBe(true);
      expect(await page.$eval('#i1', e => e.value)).toBe('First');
      expect(await page.$eval('#i2', e => e.value)).toBe('Last');
    });
  });
}
