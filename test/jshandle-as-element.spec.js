/**
 * Copyright 2018 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
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
require('./base.fixture');

const {FFOX, CHROMIUM, WEBKIT} = testOptions;

it('should work', async({page, server}) => {
  const aHandle = await page.evaluateHandle(() => document.body);
  const element = aHandle.asElement();
  expect(element).toBeTruthy();
});

it('should return null for non-elements', async({page, server}) => {
  const aHandle = await page.evaluateHandle(() => 2);
  const element = aHandle.asElement();
  expect(element).toBeFalsy();
});

it('should return ElementHandle for TextNodes', async({page, server}) => {
  await page.setContent('<div>ee!</div>');
  const aHandle = await page.evaluateHandle(() => document.querySelector('div').firstChild);
  const element = aHandle.asElement();
  expect(element).toBeTruthy();
  expect(await page.evaluate(e => e.nodeType === HTMLElement.TEXT_NODE, element)).toBeTruthy();
});

it('should work with nullified Node', async({page, server}) => {
  await page.setContent('<section>test</section>');
  await page.evaluate('delete Node');
  const handle = await page.evaluateHandle(() => document.querySelector('section'));
  const element = handle.asElement();
  expect(element).not.toBe(null);
});
