const path = require('path');
const wrapper = require('@playwright/jest-wrapper');
const DefaultTestRunner = require('../utils/testrunner');
const {TestRunner, TestRun} = require('../utils/testrunner/TestRunner');
const {Environment} = require('../utils/testrunner/Test');
const utils = require('./utils');
const fs = require('fs');
const pirates = require('pirates');
const babel =require('@babel/core');
const testRunnerInfo = makeTestRunnerInfo();


module.exports = wrapper.createJestRunner(async ({path: filePath}) => {
  const config = require('./test.config');
  const spec = config.specs.find(spec => {
    return spec.files.some(f => path.join(__dirname, f) === filePath);
  });
  if (!spec) {
    console.error('cannot find spec for', filePath);
    return [];
  }
  const {testRunner, browserInfo} = testRunnerInfo;
  testRunner.collector()._tests = [];
  for (const [key, value] of Object.entries(testRunner.api()))
    global[key] = value;
  for (const {browserEnvironment, browserTypeEnvironment, browserName, browserType, pageEnvironment, launchOptions} of browserInfo) {
    const suiteName = { 'chromium': 'Chromium', 'firefox': 'Firefox', 'webkit': 'WebKit' }[browserName];
    describe(suiteName, () => {
      // In addition to state, expose these two on global so that describes can access them.
      global.browserType = browserType;
      global.HEADLESS = !!launchOptions.headless;

      testRunner.collector().useEnvironment(browserTypeEnvironment);
      const skip = spec.browsers && !spec.browsers.includes(browserName);
      (skip ? xdescribe : describe)(spec.title || '', () => {
        for (const e of spec.environments || ['page']) {
          if (e === 'browser') {
            testRunner.collector().useEnvironment(browserEnvironment);
          } else if (e === 'page') {
            testRunner.collector().useEnvironment(browserEnvironment);
            testRunner.collector().useEnvironment(pageEnvironment);
          } else {
            testRunner.collector().useEnvironment(e);
          }
        }
        const revert = pirates.addHook((code, filename) => {
          const result = babel.transformFileSync(filename, {
            presets: [
              ['@babel/preset-env', {targets: {node: 'current'}}],
              '@babel/preset-typescript']
          });
          return result.code;
        }, {
          exts: ['.ts']
        });
        require(filePath);
        revert();
        delete require.cache[require.resolve(filePath)];
      });
    
      delete global.HEADLESS;
      delete global.browserType;
    });
  }
  for (const [key, value] of Object.entries(testRunner.api())) {
    // expect is used when running tests, while the rest of api is not.
    if (key !== 'expect')
      delete global[key];
  }

  // console.log(testRunner.collector().tests());
  
  return testRunner._filter.filter(testRunner.collector().tests()).map(test => {
    return {
      titles: test.titles(),
      test
    }
  })
}, async (tests, options, onStart, onResult) => {
  const parallel = Math.min(options.workers, 30);
  require('events').defaultMaxListeners *= parallel;
  const runner = new TestRunner();
  const runs = tests.map(test => {
    const run = new TestRun(test.test);
    run.__test__ = test;
    return run;
  });
  await runner.run(runs, {
    parallel,
    breakOnFailure: false,
    hookTimeout: options.timeout,
    totalTimeout: options.timeout,
    // onStarted = async (testRuns) => {},
    // onFinished = async (result) => {},
    onTestRunStarted: async (testRun) => {
      onStart(testRun.__test__);
    },
    onTestRunFinished: async(testRun) => {
      let status = 'skip';
      if (testRun.isFailure())
        status = 'fail';
      else if (testRun.result() === 'ok')
        status = 'pass';
      else if (testRun.test().expectation() === 'fail')
        status = 'todo';
      onResult(testRun.__test__, {
        status,
        error: testRun.error(),
      });  
    }
  });
});

function makeTestRunnerInfo() {
  let parallel = 1;
  let timeout = process.env.CI ? 30 * 1000 : 10 * 1000;
  const config = require('./test.config');
  const testRunner = new DefaultTestRunner({
    timeout,
    totalTimeout: process.env.CI ? 30 * 60 * 1000 * browserNames.length : 0, // 30 minutes per browser on CI
    parallel,
    breakOnFailure: process.argv.indexOf('--break-on-failure') !== -1,
    verbose: process.argv.includes('--verbose'),
    summary: !process.argv.includes('--verbose'),
    showSlowTests: process.env.CI ? 5 : 0,
    showMarkedAsFailingTests: 10,
  });
  if (config.setupTestRunner)
    config.setupTestRunner(testRunner);

  // TODO: this should be a preinstalled playwright by default.
  const playwrightPath = config.playwrightPath;
  const playwright = require('..');
  const { setUnderTest } = require(require('path').join(playwrightPath, 'lib/helper.js'));
  setUnderTest();

  const playwrightEnvironment = new Environment('Playwright');
  playwrightEnvironment.beforeAll(async state => {
    state.playwright = playwright;
  });
  playwrightEnvironment.afterAll(async state => {
    delete state.playwright;
  });

  testRunner.collector().useEnvironment(playwrightEnvironment);
  for (const e of config.globalEnvironments || [])
    testRunner.collector().useEnvironment(e);

  global.playwright = playwright;
  const browserNames = ['chromium'];
  const browserInfo = browserNames.map(browserName => {
    const browserType = playwright[browserName];

    const browserTypeEnvironment = new Environment('BrowserType');
    browserTypeEnvironment.beforeAll(async state => {
      state.browserType = browserType;
    });
    browserTypeEnvironment.afterAll(async state => {
      delete state.browserType;
    });

    // TODO: maybe launch options per browser?
    const launchOptions = {
      ...(config.launchOptions || {}),
      handleSIGINT: false,
    };
    if (launchOptions.executablePath)
      launchOptions.executablePath = launchOptions.executablePath[browserName];
    if (launchOptions.executablePath) {
      const YELLOW_COLOR = '\x1b[33m';
      const RESET_COLOR = '\x1b[0m';
      console.warn(`${YELLOW_COLOR}WARN: running ${browserName} tests with ${launchOptions.executablePath}${RESET_COLOR}`);
      browserType._executablePath = launchOptions.executablePath;
      delete launchOptions.executablePath;
    } else {
      if (!fs.existsSync(browserType.executablePath()))
        throw new Error(`Browser is not downloaded. Run 'npm install' and try to re-run tests`);
    }

    const browserEnvironment = new Environment(browserName);
    browserEnvironment.beforeAll(async state => {
      state._logger = utils.createTestLogger(config.dumpLogOnFailure);
      state.browser = await state.browserType.launch({...launchOptions, logger: state._logger});
    });
    browserEnvironment.afterAll(async state => {
      await state.browser.close();
      delete state.browser;
      delete state._logger;
    });
    browserEnvironment.beforeEach(async(state, testRun) => {
      state._logger.setTestRun(testRun);
    });
    browserEnvironment.afterEach(async (state, testRun) => {
      state._logger.setTestRun(null);
    });

    const pageEnvironment = new Environment('Page');
    pageEnvironment.beforeEach(async state => {
      state.context = await state.browser.newContext();
      state.page = await state.context.newPage();
    });
    pageEnvironment.afterEach(async state => {
      await state.context.close();
      state.context = null;
      state.page = null;
    });
    return {browserName, browserType, browserEnvironment, browserTypeEnvironment, pageEnvironment, launchOptions};
  });
  return {testRunner, browserInfo};
}