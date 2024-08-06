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
import fs from 'fs';
import path from 'path';
import type { FullResult, TestCase, TestResult } from '../../types/testReporter';
import type { LastRunInfo } from '../runner/runner';
import { BaseReporter, resolveOutputFile } from './base';

type LastRunOptions = {
  outputFile?: string,
  configDir: string,
  _mode: 'list' | 'test' | 'merge',
};


class LastRunReporter extends BaseReporter {

  private lastRun: LastRunInfo = {
    failedTests: [],
    status: 'passed',
    testDurations: {},
  };

  private resolvedOutputFile: string | undefined;

  constructor(options: LastRunOptions) {
    super();
    this.resolvedOutputFile = resolveOutputFile('LASTRUN', { fileName: '.last-run.json', ...options })?.outputFile;
  }

  override printsToStdio() {
    return !this.resolvedOutputFile;
  }

  override onTestEnd(test: TestCase, result: TestResult): void {
    super.onTestEnd(test, result);
    this.lastRun.testDurations![test.id] = result.duration;
    if (result.status === 'failed')
      this.lastRun.failedTests.push(test.id);
  }

  override async onEnd(result: FullResult) {
    await super.onEnd(result);
    this.lastRun.status = result.status;
    await this.outputReport(this.lastRun, this.resolvedOutputFile);
  }

  async outputReport(lastRun: LastRunInfo, resolvedOutputFile: string | undefined) {
    const reportString = JSON.stringify(lastRun, undefined, 2);
    if (resolvedOutputFile) {
      await fs.promises.mkdir(path.dirname(resolvedOutputFile), { recursive: true });
      await fs.promises.writeFile(resolvedOutputFile, reportString);
    } else {
      console.log(reportString);
    }
  }
}

export default LastRunReporter;

