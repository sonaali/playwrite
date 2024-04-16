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

import { JSONReport, JSONReportSuite, JSONReportTestResult } from 'packages/playwright-test/reporter';
import type { Suite, TestCase } from '../common/test';

export type TestGroup = {
  workerHash: string;
  requireFile: string;
  repeatEachIndex: number;
  projectId: string;
  tests: TestCase[];
};

type testDetails = {
  id: string,
  name: string,
  duration: number
}

export function createTestGroups(projectSuite: Suite, workers: number): TestGroup[] {
  // This function groups tests that can be run together.
  // Tests cannot be run together when:
  // - They belong to different projects - requires different workers.
  // - They have a different repeatEachIndex - requires different workers.
  // - They have a different set of worker fixtures in the pool - requires different workers.
  // - They have a different requireFile - reuses the worker, but runs each requireFile separately.
  // - They belong to a parallel suite.

  // Using the map "workerHash -> requireFile -> group" makes us preserve the natural order
  // of worker hashes and require files for the simple cases.
  const groups = new Map<string, Map<string, {
    // Tests that must be run in order are in the same group.
    general: TestGroup,

    // There are 3 kinds of parallel tests:
    // - Tests belonging to parallel suites, without beforeAll/afterAll hooks.
    //   These can be run independently, they are put into their own group, key === test.
    // - Tests belonging to parallel suites, with beforeAll/afterAll hooks.
    //   These should share the worker as much as possible, put into single parallelWithHooks group.
    //   We'll divide them into equally-sized groups later.
    // - Tests belonging to serial suites inside parallel suites.
    //   These should run as a serial group, each group is independent, key === serial suite.
    parallel: Map<Suite | TestCase, TestGroup>,
    parallelWithHooks: TestGroup,
  }>>();

  const createGroup = (test: TestCase): TestGroup => {
    return {
      workerHash: test._workerHash,
      requireFile: test._requireFile,
      repeatEachIndex: test.repeatEachIndex,
      projectId: test._projectId,
      tests: [],
    };
  };

  for (const test of projectSuite.allTests()) {
    let withWorkerHash = groups.get(test._workerHash);
    if (!withWorkerHash) {
      withWorkerHash = new Map();
      groups.set(test._workerHash, withWorkerHash);
    }
    let withRequireFile = withWorkerHash.get(test._requireFile);
    if (!withRequireFile) {
      withRequireFile = {
        general: createGroup(test),
        parallel: new Map(),
        parallelWithHooks: createGroup(test),
      };
      withWorkerHash.set(test._requireFile, withRequireFile);
    }

    // Note that a parallel suite cannot be inside a serial suite. This is enforced in TestType.
    let insideParallel = false;
    let outerMostSequentialSuite: Suite | undefined;
    let hasAllHooks = false;
    for (let parent: Suite | undefined = test.parent; parent; parent = parent.parent) {
      if (parent._parallelMode === 'serial' || parent._parallelMode === 'default')
        outerMostSequentialSuite = parent;
      insideParallel = insideParallel || parent._parallelMode === 'parallel';
      hasAllHooks = hasAllHooks || parent._hooks.some(hook => hook.type === 'beforeAll' || hook.type === 'afterAll');
    }

    if (insideParallel) {
      if (hasAllHooks && !outerMostSequentialSuite) {
        withRequireFile.parallelWithHooks.tests.push(test);
      } else {
        const key = outerMostSequentialSuite || test;
        let group = withRequireFile.parallel.get(key);
        if (!group) {
          group = createGroup(test);
          withRequireFile.parallel.set(key, group);
        }
        group.tests.push(test);
      }
    } else {
      withRequireFile.general.tests.push(test);
    }
  }

  const result: TestGroup[] = [];
  for (const withWorkerHash of groups.values()) {
    for (const withRequireFile of withWorkerHash.values()) {
      // Tests without parallel mode should run serially as a single group.
      if (withRequireFile.general.tests.length)
        result.push(withRequireFile.general);

      // Parallel test groups without beforeAll/afterAll can be run independently.
      result.push(...withRequireFile.parallel.values());

      // Tests with beforeAll/afterAll should try to share workers as much as possible.
      const parallelWithHooksGroupSize = Math.ceil(withRequireFile.parallelWithHooks.tests.length / workers);
      let lastGroup: TestGroup | undefined;
      for (const test of withRequireFile.parallelWithHooks.tests) {
        if (!lastGroup || lastGroup.tests.length >= parallelWithHooksGroupSize) {
          lastGroup = createGroup(test);
          result.push(lastGroup);
        }
        lastGroup.tests.push(test);
      }
    }
  }
  return result;
}

export function filterForShard(shard: { total: number, current: number }, testGroups: TestGroup[]): Set<TestGroup> {
  // Note that sharding works based on test groups.
  // This means parallel files will be sharded by single tests,
  // while non-parallel files will be sharded by the whole file.
  //
  // Shards are still balanced by the number of tests, not files,
  // even in the case of non-paralleled files.

  let shardableTotal = 0;
  for (const group of testGroups)
    shardableTotal += group.tests.length;

  // Each shard gets some tests.
  const shardSize = Math.floor(shardableTotal / shard.total);
  // First few shards get one more test each.
  const extraOne = shardableTotal - shardSize * shard.total;

  const currentShard = shard.current - 1; // Make it zero-based for calculations.
  const from = shardSize * currentShard + Math.min(extraOne, currentShard);
  const to = from + shardSize + (currentShard < extraOne ? 1 : 0);

  let current = 0;
  const result = new Set<TestGroup>();
  for (const group of testGroups) {
    // Any test group goes to the shard that contains the first test of this group.
    // So, this shard gets any group that starts at [from; to)
    if (current >= from && current < to)
      result.add(group);
    current += group.tests.length;
  }
  return result;
}

export function filterForShardFromTimingFile(timingFile: JSONReport, shard: { total: number, current: number }, testGroups: TestGroup[]): Set<TestGroup> {
  const testDetails = getAllTestDetails(timingFile);
  const shardsMapping = mapTestDetailsToShards(testDetails, shard);
  const testIds = shardsMapping[shard.current - 1].map(shardDetails => shardDetails.id);
  const recordedTests = testGroups.filter(group => testIds.includes(group.tests[0].id));
  const result = new Set<TestGroup>();

  recordedTests.forEach(group => result.add(group));

  // If not all test groups have recorded timing information, filter the remaining groups based on shard distribution
  if (testDetails.length != testGroups.length) {
    const allTestIds = testDetails.map(shardDetails => shardDetails.id);
    const UnrecordedTests = testGroups.filter(group => !allTestIds.includes(group.tests[0].id));

    let shardableTotal = 0;
    for (const group of UnrecordedTests)
      shardableTotal += group.tests.length;
  
    // Each shard gets some tests.
    const shardSize = Math.floor(shardableTotal / shard.total);
    // First few shards get one more test each.
    const extraOne = shardableTotal - shardSize * shard.total;
  
    const currentShard = shard.current - 1; // Make it zero-based for calculations.
    const from = shardSize * currentShard + Math.min(extraOne, currentShard);
    const to = from + shardSize + (currentShard < extraOne ? 1 : 0);
  
    let current = 0;
    for (const group of UnrecordedTests) {
      // Any test group goes to the shard that contains the first test of this group.
      // So, this shard gets any group that starts at [from; to)
      if (current >= from && current < to)
        result.add(group);
      current += group.tests.length;
    }
  }
  return result;
}

// Extracts test details from a JSON report and returns an array of test details objects.
function getAllTestDetails(report: JSONReport) {
  const allTestDetails:testDetails[] = [];
  report.suites.forEach((suite: JSONReportSuite) => {
    getTestDetails(suite, allTestDetails);
  });

  return allTestDetails;
}

// Recursively traverses through test suites in a JSON report and extracts test details.
function getTestDetails(suite: JSONReportSuite, allTestDetails: testDetails[]) {
  if (suite.specs) {
    suite.specs.forEach((spec) => {
      spec.tests.forEach((test) => {
        test.results.forEach((result) => {
          allTestDetails.push({
            id: spec.id,
            name: spec.title,
            duration: result.duration,
          });
        });
      });
    });
  }

  if (suite.suites) {
    suite.suites.forEach((subSuite) => {
      getTestDetails(subSuite, allTestDetails);
    });
  }
}

function mapTestDetailsToShards(testDetails: testDetails[], shard: {total: number, current: number}) {
  testDetails.sort((a, b) => b.duration - a.duration);

  const result:testDetails[][] = Array.from({ length: shard.total }, () => []);
  const sums = Array(shard.total).fill(0);

  // Distribute tests to shards based on their durations
  for (let testDetailsObj of testDetails) {
    // Find the shard with the smallest total duration and assign the test to that shard
    let minIndex = sums.indexOf(Math.min(...sums));
    result[minIndex].push(testDetailsObj);
    sums[minIndex] += testDetailsObj.duration;
  }

  return result;
}
