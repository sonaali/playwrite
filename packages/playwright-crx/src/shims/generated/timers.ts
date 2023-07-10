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

// This file is generated by generate_node_shims.js, do not edit manually.

import { errorProxy } from '../error';

export const setTimeout = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers.setTimeout__');
export const clearTimeout = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers.clearTimeout__');
export const setImmediate = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers.setImmediate__');
export const clearImmediate = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers.clearImmediate__');
export const setInterval = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers.setInterval__');
export const clearInterval = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers.clearInterval__');
export const _unrefActive = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers._unrefActive__');
export const active = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers.active__');
export const unenroll = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers.unenroll__');
export const enroll = /* @__PURE__ */ errorProxy('__PW_CRX_error_timers.enroll__');

export default /* @__PURE__ */ errorProxy('__PW_CRX_error_timers__');