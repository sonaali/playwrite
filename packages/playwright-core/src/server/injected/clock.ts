/**
 * Copyright (c) 2010-2014, Christian Johansen, christian@cjohansen.no. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

export type ClockMethods = {
  Date: DateConstructor;
  setTimeout: Window['setTimeout'];
  clearTimeout: Window['clearTimeout'];
  setInterval: Window['setInterval'];
  clearInterval: Window['clearInterval'];
  requestAnimationFrame?: Window['requestAnimationFrame'];
  cancelAnimationFrame?: (id: number) => void;
  requestIdleCallback?: Window['requestIdleCallback'];
  cancelIdleCallback?: (id: number) => void;
  Intl?: typeof Intl;
  performance?: Window['performance'];
};

export type ClockConfig = {
  now?: number | Date;
  loopLimit?: number;
};

export type InstallConfig = ClockConfig & {
  toFake?: (keyof ClockMethods)[];
  speed?: number;
};

enum TimerType {
  Timeout = 'Timeout',
  Interval = 'Interval',
  Immediate = 'Immediate',
  AnimationFrame = 'AnimationFrame',
  IdleCallback = 'IdleCallback',
}

type Timer = {
  type: TimerType;
  func: TimerHandler;
  args: any[];
  delay: number;
  callAt: number;
  createdAt: number;
  id: number;
  error?: Error;
};

interface Embedder {
  performanceNow(): DOMHighResTimeStamp;
  postTask(task: () => void, timeout?: number): () => void;
  postTaskPeriodically(task: () => void, delay: number): () => void;
}

export class ClockController {
  readonly timeOrigin: number;
  private _now: { time: number, ticks: number, timeFrozen: boolean };
  private _loopLimit: number;
  private _duringTick = false;
  private _timers = new Map<number, Timer>();
  private _uniqueTimerId = idCounterStart;
  private _embedder: Embedder;
  readonly disposables: (() => void)[] = [];
  private _realTime: { startTicks: number, speed: number, lastSyncTicks: number } | undefined;
  private _currentRealTimeTimer: { callAt: number, dispose: () => void } | undefined;

  constructor(embedder: Embedder, startDate: Date | number | undefined, loopLimit: number = 1000) {
    const start = Math.floor(getEpoch(startDate));
    this.timeOrigin = start;
    this._now = { time: start, ticks: 0, timeFrozen: false };
    this._embedder = embedder;
    this._loopLimit = loopLimit;
  }

  uninstall() {
    this.disposables.forEach(dispose => dispose());
    this.disposables.length = 0;
  }

  now(): number {
    return this._now.time;
  }

  setTime(now: Date | number, options: { freeze?: boolean } = {}) {
    this._now.time = getEpoch(now);
    this._now.timeFrozen = !!options.freeze;
  }

  performanceNow(): DOMHighResTimeStamp {
    return this._now.ticks;
  }

  private _advanceNow(toTicks: number) {
    if (!this._now.timeFrozen)
      this._now.time += toTicks - this._now.ticks;
    this._now.ticks = toTicks;
  }

  private async _doTick(msFloat: number): Promise<number> {
    if (msFloat < 0)
      throw new TypeError('Negative ticks are not supported');

    const ms = Math.floor(msFloat);
    const tickTo = this._now.ticks + ms;
    let tickFrom = this._now.ticks;
    let previous = this._now.ticks;
    let firstException: Error | undefined;
    let timer = this._firstTimerInRange(tickFrom, tickTo);
    while (timer && tickFrom <= tickTo) {
      tickFrom = timer.callAt;
      const error = await this._callTimer(timer).catch(e => e);
      firstException = firstException || error;
      timer = this._firstTimerInRange(previous, tickTo);
      previous = tickFrom;
    }

    this._advanceNow(tickTo);
    if (firstException)
      throw firstException;

    return this._now.ticks;
  }

  async recordTick(tickValue: string | number) {
    const msFloat = parseTime(tickValue);
    this._advanceNow(this._now.ticks + msFloat);
  }

  async tick(tickValue: string | number): Promise<number> {
    return await this._doTick(parseTime(tickValue));
  }

  async next(): Promise<number> {
    const timer = this._firstTimer();
    if (!timer)
      return this._now.ticks;
    await this._callTimer(timer);
    return this._now.ticks;
  }

  async runToFrame(): Promise<number> {
    return this.tick(this.getTimeToNextFrame());
  }

  startRealTime(options: { speed?: number } = {}) {
    const now = Math.ceil(this._embedder.performanceNow());
    this._realTime = { startTicks: now, speed: options.speed || 1, lastSyncTicks: now };
  }

  private _ensureTimer() {
    const firstTimer = this._firstTimer();
    if (!firstTimer)
      return;
    const callAt = firstTimer.callAt;

    if (this._currentRealTimeTimer && this._currentRealTimeTimer.callAt < callAt)
      return;

    if (this._currentRealTimeTimer) {
      this._currentRealTimeTimer.dispose();
      this._currentRealTimeTimer = undefined;
    }

    this._currentRealTimeTimer = {
      callAt,
      dispose: this._embedder.postTask(() => {
        const now = Math.ceil(this._embedder.performanceNow());
        const sinceLastSync = now - this._realTime!.lastSyncTicks;
        this._realTime!.lastSyncTicks = now;
        this._currentRealTimeTimer = undefined;
        this.tick(sinceLastSync * this._realTime!.speed).then(() => this._ensureTimer());
      }, (callAt - this._now.ticks) / this._realTime!.speed),
    };
  }

  async runAll(): Promise<number> {
    for (let i = 0; i < this._loopLimit; i++) {
      const numTimers = this._timers.size;
      if (numTimers === 0)
        return this._now.ticks;

      await this.next();
    }

    const excessJob = this._firstTimer();
    if (!excessJob)
      return this._now.ticks;
    throw this._getInfiniteLoopError(excessJob);
  }

  async runToLast(): Promise<number> {
    const timer = this._lastTimer();
    if (!timer)
      return this._now.ticks;
    return await this.tick(timer.callAt - this._now.ticks);
  }

  reset() {
    this._timers.clear();
    this._now = { time: this.timeOrigin, ticks: 0, timeFrozen: false };
  }

  async jump(tickValue: string | number): Promise<number> {
    const msFloat = parseTime(tickValue);
    const ms = Math.floor(msFloat);

    for (const timer of this._timers.values()) {
      if (this._now.ticks + ms > timer.callAt)
        timer.callAt = this._now.ticks + ms;
    }
    return await this.tick(ms);
  }

  addTimer(options: { func: TimerHandler, type: TimerType, delay?: number | string, args?: any[] }): number {
    if (options.func === undefined)
      throw new Error('Callback must be provided to timer calls');

    let delay = options.delay ? +options.delay : 0;
    if (!Number.isFinite(delay))
      delay = 0;
    delay = delay > maxTimeout ? 1 : delay;
    delay = Math.max(0, delay);

    const timer: Timer = {
      type: options.type,
      func: options.func,
      args: options.args || [],
      delay,
      callAt: this._now.ticks + (delay || (this._duringTick ? 1 : 0)),
      createdAt: this._now.ticks,
      id: this._uniqueTimerId++,
      error: new Error(),
    };
    this._timers.set(timer.id, timer);
    if (this._realTime)
      this._ensureTimer();
    return timer.id;
  }

  private _firstTimerInRange(from: number, to: number): Timer | null {
    let firstTimer: Timer | null = null;
    for (const timer of this._timers.values()) {
      const isInRange = inRange(from, to, timer);
      if (isInRange && (!firstTimer || compareTimers(firstTimer, timer) === 1))
        firstTimer = timer;
    }
    return firstTimer;
  }

  countTimers() {
    return this._timers.size;
  }

  private _firstTimer(): Timer | null {
    let firstTimer: Timer | null = null;

    for (const timer of this._timers.values()) {
      if (!firstTimer || compareTimers(firstTimer, timer) === 1)
        firstTimer = timer;
    }
    return firstTimer;
  }

  private _lastTimer(): Timer | null {
    let lastTimer: Timer | null = null;

    for (const timer of this._timers.values()) {
      if (!lastTimer || compareTimers(lastTimer, timer) === -1)
        lastTimer = timer;
    }
    return lastTimer;
  }

  private async _callTimer(timer: Timer) {
    this._advanceNow(timer.callAt);

    if (timer.type === TimerType.Interval)
      this._timers.get(timer.id)!.callAt += timer.delay;
    else
      this._timers.delete(timer.id);

    this._duringTick = true;
    try {
      if (typeof timer.func !== 'function') {
        (() => { eval(timer.func); })();
        return;
      }

      let args = timer.args;
      if (timer.type === TimerType.AnimationFrame)
        args = [this._now.ticks];
      else if (timer.type === TimerType.IdleCallback)
        args = [{ didTimeout: false, timeRemaining: () => 0 }];

      timer.func.apply(null, args);
      await new Promise<void>(f => this._embedder.postTask(f));
    } finally {
      this._duringTick = false;
    }
  }

  private _getInfiniteLoopError(job: Timer) {
    const infiniteLoopError = new Error(
        `Aborting after running ${this._loopLimit} timers, assuming an infinite loop!`,
    );

    if (!job.error)
      return infiniteLoopError;

    // pattern never matched in Node
    const computedTargetPattern = /target\.*[<|(|[].*?[>|\]|)]\s*/;
    const clockMethodPattern = new RegExp(
        String(Object.keys(this).join('|')),
    );

    let matchedLineIndex = -1;
    job.error.stack!.split('\n').some((line, i) => {
      // If we've matched a computed target line (e.g. setTimeout) then we
      // don't need to look any further. Return true to stop iterating.
      const matchedComputedTarget = line.match(computedTargetPattern);
      /* istanbul ignore if */
      if (matchedComputedTarget) {
        matchedLineIndex = i;
        return true;
      }

      // If we've matched a clock method line, then there may still be
      // others further down the trace. Return false to keep iterating.
      const matchedClockMethod = line.match(clockMethodPattern);
      if (matchedClockMethod) {
        matchedLineIndex = i;
        return false;
      }

      // If we haven't matched anything on this line, but we matched
      // previously and set the matched line index, then we can stop.
      // If we haven't matched previously, then we should keep iterating.
      return matchedLineIndex >= 0;
    });

    const funcName = typeof job.func === 'function' ? job.func.name : 'anonymous';
    const stack = `${infiniteLoopError}\n${job.type || 'Microtask'} - ${funcName}\n${job.error.stack!
        .split('\n')
        .slice(matchedLineIndex + 1)
        .join('\n')}`;

    infiniteLoopError.stack = stack;
    return infiniteLoopError;
  }

  getTimeToNextFrame() {
    return 16 - this._now.ticks % 16;
  }

  clearTimer(timerId: number, type: TimerType) {
    if (!timerId) {
      // null appears to be allowed in most browsers, and appears to be
      // relied upon by some libraries, like Bootstrap carousel
      return;
    }

    // in Node, the ID is stored as the primitive value for `Timeout` objects
    // for `Immediate` objects, no ID exists, so it gets coerced to NaN
    const id = Number(timerId);

    if (Number.isNaN(id) || id < idCounterStart) {
      const handlerName = getClearHandler(type);
      new Error(`Clock: ${handlerName} was invoked to clear a native timer instead of one created by the clock library.`);
    }

    const timer = this._timers.get(id);
    if (timer) {
      if (
        timer.type === type ||
        (timer.type === 'Timeout' && type === 'Interval') ||
        (timer.type === 'Interval' && type === 'Timeout')
      ) {
        this._timers.delete(id);
      } else {
        const clear = getClearHandler(type);
        const schedule = getScheduleHandler(timer.type);
        throw new Error(
            `Cannot clear timer: timer created with ${schedule}() but cleared with ${clear}()`,
        );
      }
    }
  }

  advanceAutomatically(advanceTimeDelta: number = 20): () => void {
    return this._embedder.postTaskPeriodically(
        () => this._doTick(advanceTimeDelta!),
        advanceTimeDelta,
    );
  }
}

function getEpoch(epoch: Date | number | undefined): number {
  if (!epoch)
    return 0;
  if (typeof epoch !== 'number')
    return epoch.getTime();
  return epoch;
}

function inRange(from: number, to: number, timer: Timer): boolean {
  return timer && timer.callAt >= from && timer.callAt <= to;
}

/**
 * Parse strings like '01:10:00' (meaning 1 hour, 10 minutes, 0 seconds) into
 * number of milliseconds. This is used to support human-readable strings passed
 * to clock.tick()
 */
function parseTime(value: number | string): number {
  if (typeof value === 'number')
    return value;
  if (!value)
    return 0;
  const str = value;

  const strings = str.split(':');
  const l = strings.length;
  let i = l;
  let ms = 0;
  let parsed;

  if (l > 3 || !/^(\d\d:){0,2}\d\d?$/.test(str)) {
    throw new Error(
        `Clock only understands numbers, 'mm:ss' and 'hh:mm:ss'`,
    );
  }

  while (i--) {
    parsed = parseInt(strings[i], 10);
    if (parsed >= 60)
      throw new Error(`Invalid time ${str}`);
    ms += parsed * Math.pow(60, l - i - 1);
  }

  return ms * 1000;
}

function mirrorDateProperties(target: any, source: typeof Date): DateConstructor & Date {
  let prop;
  for (prop of Object.getOwnPropertyNames(source) as (keyof DateConstructor)[])
    target[prop] = source[prop];
  target.toString = () => source.toString();
  target.prototype = source.prototype;
  target.parse = source.parse;
  target.UTC = source.UTC;
  target.prototype.toUTCString = source.prototype.toUTCString;
  target.isFake = true;
  return target;
}

function createDate(clock: ClockController, NativeDate: typeof Date): DateConstructor & Date {
  function ClockDate(this: typeof ClockDate, year: number, month: number, date: number, hour: number, minute: number, second: number, ms: number): Date | string {
    // the Date constructor called as a function, ref Ecma-262 Edition 5.1, section 15.9.2.
    // This remains so in the 10th edition of 2019 as well.
    if (!(this instanceof ClockDate))
      return new NativeDate(clock.now()).toString();

    // if Date is called as a constructor with 'new' keyword
    // Defensive and verbose to avoid potential harm in passing
    // explicit undefined when user does not pass argument
    switch (arguments.length) {
      case 0:
        return new NativeDate(clock.now());
      case 1:
        return new NativeDate(year);
      case 2:
        return new NativeDate(year, month);
      case 3:
        return new NativeDate(year, month, date);
      case 4:
        return new NativeDate(year, month, date, hour);
      case 5:
        return new NativeDate(year, month, date, hour, minute);
      case 6:
        return new NativeDate(
            year,
            month,
            date,
            hour,
            minute,
            second,
        );
      default:
        return new NativeDate(
            year,
            month,
            date,
            hour,
            minute,
            second,
            ms,
        );
    }
  }

  ClockDate.now = () => clock.now();
  return mirrorDateProperties(ClockDate, NativeDate);
}

/**
 * Mirror Intl by default on our fake implementation
 *
 * Most of the properties are the original native ones,
 * but we need to take control of those that have a
 * dependency on the current clock.
 */
function createIntl(clock: ClockController, NativeIntl: typeof Intl): typeof Intl {
  const ClockIntl: any = {};
  /*
    * All properties of Intl are non-enumerable, so we need
    * to do a bit of work to get them out.
    */
  for (const key of Object.getOwnPropertyNames(NativeIntl) as (keyof typeof Intl)[])
    ClockIntl[key] = NativeIntl[key];

  ClockIntl.DateTimeFormat = function(...args: any[]) {
    const realFormatter = new NativeIntl.DateTimeFormat(...args);
    const formatter: Intl.DateTimeFormat = {
      formatRange: realFormatter.formatRange.bind(realFormatter),
      formatRangeToParts: realFormatter.formatRangeToParts.bind(realFormatter),
      resolvedOptions: realFormatter.resolvedOptions.bind(realFormatter),
      format: date => realFormatter.format(date || clock.now()),
      formatToParts: date => realFormatter.formatToParts(date || clock.now()),
    };

    return formatter;
  };

  ClockIntl.DateTimeFormat.prototype = Object.create(
      NativeIntl.DateTimeFormat.prototype,
  );

  ClockIntl.DateTimeFormat.supportedLocalesOf =
    NativeIntl.DateTimeFormat.supportedLocalesOf;

  return ClockIntl;
}

function compareTimers(a: Timer, b: Timer) {
  // Sort first by absolute timing
  if (a.callAt < b.callAt)
    return -1;
  if (a.callAt > b.callAt)
    return 1;

  // Sort next by immediate, immediate timers take precedence
  if (a.type === TimerType.Immediate && b.type !== TimerType.Immediate)
    return -1;
  if (a.type !== TimerType.Immediate && b.type === TimerType.Immediate)
    return 1;

  // Sort next by creation time, earlier-created timers take precedence
  if (a.createdAt < b.createdAt)
    return -1;
  if (a.createdAt > b.createdAt)
    return 1;

  // Sort next by id, lower-id timers take precedence
  if (a.id < b.id)
    return -1;
  if (a.id > b.id)
    return 1;

  // As timer ids are unique, no fallback `0` is necessary
}

const maxTimeout = Math.pow(2, 31) - 1;  // see https://heycam.github.io/webidl/#abstract-opdef-converttoint
const idCounterStart = 1e12; // arbitrarily large number to avoid collisions with native timer IDs

function platformOriginals(globalObject: WindowOrWorkerGlobalScope): { raw: ClockMethods, bound: ClockMethods } {
  const raw: ClockMethods = {
    setTimeout: globalObject.setTimeout,
    clearTimeout: globalObject.clearTimeout,
    setInterval: globalObject.setInterval,
    clearInterval: globalObject.clearInterval,
    requestAnimationFrame: (globalObject as any).requestAnimationFrame ? (globalObject as any).requestAnimationFrame : undefined,
    cancelAnimationFrame: (globalObject as any).cancelAnimationFrame ? (globalObject as any).cancelAnimationFrame : undefined,
    requestIdleCallback: (globalObject as any).requestIdleCallback ? (globalObject as any).requestIdleCallback : undefined,
    cancelIdleCallback: (globalObject as any).cancelIdleCallback ? (globalObject as any).cancelIdleCallback : undefined,
    Date: (globalObject as any).Date,
    performance: globalObject.performance,
    Intl: (globalObject as any).Intl,
  };
  const bound = { ...raw };
  for (const key of Object.keys(bound) as (keyof ClockMethods)[]) {
    if (key !== 'Date' && typeof bound[key] === 'function')
      bound[key] = (bound[key] as any).bind(globalObject);
  }
  return { raw, bound };
}

/**
 * Gets schedule handler name for a given timer type
 */
function getScheduleHandler(type: TimerType) {
  if (type === 'IdleCallback' || type === 'AnimationFrame')
    return `request${type}`;

  return `set${type}`;
}

function createApi(clock: ClockController, originals: ClockMethods): ClockMethods {
  return {
    setTimeout: (func: TimerHandler, timeout?: number | undefined, ...args: any[]) => {
      const delay = timeout ? +timeout : timeout;
      return clock.addTimer({
        type: TimerType.Timeout,
        func,
        args,
        delay
      });
    },
    clearTimeout: (timerId: number | undefined): void => {
      if (timerId)
        clock.clearTimer(timerId, TimerType.Timeout);
    },
    setInterval: (func: TimerHandler, timeout?: number | undefined, ...args: any[]): number => {
      const delay = timeout ? +timeout : timeout;
      return clock.addTimer({
        type: TimerType.Interval,
        func,
        args,
        delay,
      });
    },
    clearInterval: (timerId: number | undefined): void => {
      if (timerId)
        return clock.clearTimer(timerId, TimerType.Interval);
    },
    requestAnimationFrame: (callback: FrameRequestCallback): number => {
      return clock.addTimer({
        type: TimerType.AnimationFrame,
        func: callback,
        delay: clock.getTimeToNextFrame(),
      });
    },
    cancelAnimationFrame: (timerId: number): void => {
      if (timerId)
        return clock.clearTimer(timerId, TimerType.AnimationFrame);
    },
    requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions | undefined): number => {
      let timeToNextIdlePeriod = 0;

      if (clock.countTimers() > 0)
        timeToNextIdlePeriod = 50; // const for now
      return clock.addTimer({
        type: TimerType.IdleCallback,
        func: callback,
        delay: options?.timeout ? Math.min(options?.timeout, timeToNextIdlePeriod) : timeToNextIdlePeriod,
      });
    },
    cancelIdleCallback: (timerId: number): void => {
      if (timerId)
        return clock.clearTimer(timerId, TimerType.IdleCallback);
    },
    Intl: originals.Intl ? createIntl(clock, originals.Intl) : undefined,
    Date: createDate(clock, originals.Date),
    performance: originals.performance ? fakePerformance(clock, originals.performance) : undefined,
  };
}

function getClearHandler(type: TimerType) {
  if (type === 'IdleCallback' || type === 'AnimationFrame')
    return `cancel${type}`;

  return `clear${type}`;
}

function fakePerformance(clock: ClockController, performance: Performance): Performance {
  const result: any = {
    now: () => clock.performanceNow(),
    timeOrigin: clock.timeOrigin,
  };
  // eslint-disable-next-line no-proto
  for (const key of Object.keys((performance as any).__proto__)) {
    if (key === 'now' || key === 'timeOrigin')
      continue;
    if (key === 'getEntries' || key === 'getEntriesByName' || key === 'getEntriesByType')
      result[key] = () => [];
    else
      result[key] = () => {};
  }
  return result;
}

export function createClock(globalObject: WindowOrWorkerGlobalScope, config: ClockConfig = {}): { clock: ClockController, api: ClockMethods, originals: ClockMethods } {
  const originals = platformOriginals(globalObject);
  const embedder = {
    performanceNow: () => originals.raw.performance!.now(),
    postTask: (task: () => void, timeout?: number) => {
      const timerId = originals.bound.setTimeout(task, timeout);
      return () => originals.bound.clearTimeout(timerId);
    },
    postTaskPeriodically: (task: () => void, delay: number) => {
      const intervalId = globalObject.setInterval(task, delay);
      return () => originals.bound.clearInterval(intervalId);
    },
  };

  const clock = new ClockController(embedder, config.now, config.loopLimit);
  const api = createApi(clock, originals.bound);
  return { clock, api, originals: originals.raw };
}

export function install(globalObject: WindowOrWorkerGlobalScope, config: InstallConfig = {}): { clock: ClockController, api: ClockMethods, originals: ClockMethods } {
  if ((globalObject as any).Date?.isFake) {
    // Timers are already faked; this is a problem.
    // Make the user reset timers before continuing.
    throw new TypeError(`Can't install fake timers twice on the same global object.`);
  }

  const { clock, api, originals } = createClock(globalObject, config);
  const toFake = config.toFake?.length ? config.toFake : Object.keys(originals) as (keyof ClockMethods)[];

  for (const method of toFake) {
    if (method === 'Date') {
      (globalObject as any).Date = mirrorDateProperties(api.Date, (globalObject as any).Date);
    } else if (method === 'Intl') {
      (globalObject as any).Intl = api[method]!;
    } else if (method === 'performance') {
      (globalObject as any).performance = api[method]!;
    } else {
      (globalObject as any)[method] = (...args: any[]) => {
        return (api[method] as any).apply(api, args);
      };
    }
    clock.disposables.push(() => {
      (globalObject as any)[method] = originals[method];
    });
  }

  if (typeof config.speed === 'number')
    clock.startRealTime({ speed: config.speed });

  return { clock, api, originals };
}

export function inject(globalObject: WindowOrWorkerGlobalScope) {
  return {
    install: (config: InstallConfig) => {
      const { clock } = install(globalObject, config);
      return clock;
    },
    builtin: platformOriginals(globalObject).bound,
  };
}
