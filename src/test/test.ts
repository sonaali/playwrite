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

import type { FixturePool } from './fixtures';
import * as reporterTypes from './reporter';
import type { TestTypeImpl } from './testType';
import { Annotations, Location } from './types';

class Base {
  title: string;
  location: Location = { file: '', line: 0, column: 0 };
  parent?: Suite;

  _titlePath: string[] = [];
  _only = false;
  _requireFile: string = '';

  constructor(title: string) {
    this.title = title;
  }

  _buildTitlePath(parentTitlePath: string[]) {
    this._titlePath = [...parentTitlePath];
    if (this.title)
      this._titlePath.push(this.title);
  }

  titlePath(): string[] {
    return this._titlePath;
  }

  fullTitle(): string {
    return this._titlePath.join(' ');
  }
}

export type Modifier = {
  type: 'slow' | 'fixme' | 'skip' | 'fail',
  fn: Function,
  location: Location,
  description: string | undefined
};

export class Suite extends Base implements reporterTypes.Suite {
  suites: Suite[] = [];
  tests: Test[] = [];
  project!: reporterTypes.TestProject;
  _fixtureOverrides: any = {};
  _entries: (Suite | Test)[] = [];
  _hooks: {
    type: 'beforeEach' | 'afterEach' | 'beforeAll' | 'afterAll',
    fn: Function,
    location: Location,
  }[] = [];
  _timeout: number | undefined;
  _annotations: Annotations = [];
  _modifiers: Modifier[] = [];
  _repeatEachIndex = 0;

  _addTest(test: Test) {
    test.parent = this;
    this.tests.push(test);
    this._entries.push(test);
  }

  _addSuite(suite: Suite) {
    suite.parent = this;
    this.suites.push(suite);
    this._entries.push(suite);
  }

  allTests(): Test[] {
    const result: Test[] = [];
    const visit = (suite: Suite) => {
      for (const entry of suite._entries) {
        if (entry instanceof Suite)
          visit(entry);
        else
          result.push(entry);
      }
    };
    visit(this);
    return result;
  }

  _getOnlyItems(): (Test | Suite)[] {
    const items: (Test | Suite)[] = [];
    if (this._only)
      items.push(this);
    for (const suite of this.suites)
      items.push(...suite._getOnlyItems());
    items.push(...this.tests.filter(test => test._only));
    return items;
  }

  _buildFixtureOverrides(): any {
    return this.parent ? { ...this.parent._buildFixtureOverrides(), ...this._fixtureOverrides } : this._fixtureOverrides;
  }

  _clone(): Suite {
    const suite = new Suite(this.title);
    suite._only = this._only;
    suite.location = this.location;
    suite._requireFile = this._requireFile;
    suite._fixtureOverrides = this._fixtureOverrides;
    suite._hooks = this._hooks.slice();
    suite._timeout = this._timeout;
    suite._annotations = this._annotations.slice();
    suite._modifiers = this._modifiers.slice();
    return suite;
  }
}

export class Test extends Base implements reporterTypes.Test {
  fn: Function;
  results: reporterTypes.TestResult[] = [];

  expectedStatus: reporterTypes.TestStatus = 'passed';
  timeout = 0;
  annotations: Annotations = [];
  retries = 0;
  project!: reporterTypes.TestProject;

  _ordinalInFile: number;
  _testType: TestTypeImpl;
  _id = '';
  _workerHash = '';
  _pool: FixturePool | undefined;

  constructor(title: string, fn: Function, ordinalInFile: number, testType: TestTypeImpl) {
    super(title);
    this.fn = fn;
    this._ordinalInFile = ordinalInFile;
    this._testType = testType;
  }

  status(): 'skipped' | 'expected' | 'unexpected' | 'flaky' {
    // List mode bail out.
    if (!this.results.length)
      return 'skipped';
    if (this.results.length === 1 && this.expectedStatus === this.results[0].status)
      return this.expectedStatus === 'skipped' ? 'skipped' : 'expected';
    let hasPassedResults = false;
    for (const result of this.results) {
      // TODO: we should not report tests that do not belong to the shard.
      // Missing status is Ok when running in shards mode.
      if (!result.status)
        return 'skipped';
      if (result.status === this.expectedStatus)
        hasPassedResults = true;
    }
    if (hasPassedResults)
      return 'flaky';
    return 'unexpected';
  }

  ok(): boolean {
    const status = this.status();
    return status === 'expected' || status === 'flaky' || status === 'skipped';
  }

  _clone(): Test {
    const test = new Test(this.title, this.fn, this._ordinalInFile, this._testType);
    test._only = this._only;
    test.location = this.location;
    test._requireFile = this._requireFile;
    return test;
  }

  _appendTestResult(): reporterTypes.TestResult {
    const result: reporterTypes.TestResult = {
      retry: this.results.length,
      workerIndex: 0,
      duration: 0,
      stdout: [],
      stderr: [],
      data: {},
    };
    this.results.push(result);
    return result;
  }
}
