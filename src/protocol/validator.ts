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

// This file is generated by generate_channels.js, do not edit manually.

import { Validator, ValidationError, tOptional, tObject, tBoolean, tNumber, tString, tAny, tEnum, tArray, tBinary } from './validatorPrimitives';
export { Validator, ValidationError } from './validatorPrimitives';

type Scheme = { [key: string]: Validator };

export function createScheme(tChannel: (name: string) => Validator): Scheme {
  const scheme: Scheme = {};

  const tType = (name: string): Validator => {
    return (arg: any, path: string) => {
      const v = scheme[name];
      if (!v)
        throw new ValidationError(path + ': unknown type "' + name + '"');
      return v(arg, path);
    };
  };

  scheme.Metadata = tObject({
    stack: tOptional(tString),
  });
  scheme.SerializedValue = tObject({
    n: tOptional(tNumber),
    b: tOptional(tBoolean),
    s: tOptional(tString),
    v: tOptional(tEnum(['null', 'undefined', 'NaN', 'Infinity', '-Infinity', '-0'])),
    d: tOptional(tString),
    r: tOptional(tObject({
      p: tString,
      f: tString,
    })),
    a: tOptional(tArray(tType('SerializedValue'))),
    o: tOptional(tArray(tObject({
      k: tString,
      v: tType('SerializedValue'),
    }))),
    h: tOptional(tNumber),
  });
  scheme.SerializedArgument = tObject({
    value: tType('SerializedValue'),
    handles: tArray(tChannel('*')),
  });
  scheme.AXNode = tObject({
    role: tString,
    name: tString,
    valueString: tOptional(tString),
    valueNumber: tOptional(tNumber),
    description: tOptional(tString),
    keyshortcuts: tOptional(tString),
    roledescription: tOptional(tString),
    valuetext: tOptional(tString),
    disabled: tOptional(tBoolean),
    expanded: tOptional(tBoolean),
    focused: tOptional(tBoolean),
    modal: tOptional(tBoolean),
    multiline: tOptional(tBoolean),
    multiselectable: tOptional(tBoolean),
    readonly: tOptional(tBoolean),
    required: tOptional(tBoolean),
    selected: tOptional(tBoolean),
    checked: tOptional(tEnum(['checked', 'unchecked', 'mixed'])),
    pressed: tOptional(tEnum(['pressed', 'released', 'mixed'])),
    level: tOptional(tNumber),
    valuemin: tOptional(tNumber),
    valuemax: tOptional(tNumber),
    autocomplete: tOptional(tString),
    haspopup: tOptional(tString),
    invalid: tOptional(tString),
    orientation: tOptional(tString),
    children: tOptional(tArray(tType('AXNode'))),
  });
  scheme.SetNetworkCookie = tObject({
    name: tString,
    value: tString,
    url: tOptional(tString),
    domain: tOptional(tString),
    path: tOptional(tString),
    expires: tOptional(tNumber),
    httpOnly: tOptional(tBoolean),
    secure: tOptional(tBoolean),
    sameSite: tOptional(tEnum(['Strict', 'Lax', 'None'])),
  });
  scheme.NetworkCookie = tObject({
    name: tString,
    value: tString,
    domain: tString,
    path: tString,
    expires: tNumber,
    httpOnly: tBoolean,
    secure: tBoolean,
    sameSite: tEnum(['Strict', 'Lax', 'None']),
  });
  scheme.NameValue = tObject({
    name: tString,
    value: tString,
  });
  scheme.OriginStorage = tObject({
    origin: tString,
    localStorage: tArray(tType('NameValue')),
  });
  scheme.SerializedError = tObject({
    error: tOptional(tObject({
      message: tString,
      name: tString,
      stack: tOptional(tString),
    })),
    value: tOptional(tType('SerializedValue')),
  });
  scheme.SelectorsRegisterParams = tObject({
    name: tString,
    source: tString,
    contentScript: tOptional(tBoolean),
  });
  scheme.BrowserTypeLaunchParams = tObject({
    executablePath: tOptional(tString),
    args: tOptional(tArray(tString)),
    ignoreAllDefaultArgs: tOptional(tBoolean),
    ignoreDefaultArgs: tOptional(tArray(tString)),
    handleSIGINT: tOptional(tBoolean),
    handleSIGTERM: tOptional(tBoolean),
    handleSIGHUP: tOptional(tBoolean),
    timeout: tOptional(tNumber),
    env: tOptional(tArray(tType('NameValue'))),
    headless: tOptional(tBoolean),
    devtools: tOptional(tBoolean),
    proxy: tOptional(tObject({
      server: tString,
      bypass: tOptional(tString),
      username: tOptional(tString),
      password: tOptional(tString),
    })),
    downloadsPath: tOptional(tString),
    firefoxUserPrefs: tOptional(tAny),
    chromiumSandbox: tOptional(tBoolean),
    slowMo: tOptional(tNumber),
  });
  scheme.BrowserTypeLaunchPersistentContextParams = tObject({
    userDataDir: tString,
    executablePath: tOptional(tString),
    args: tOptional(tArray(tString)),
    ignoreAllDefaultArgs: tOptional(tBoolean),
    ignoreDefaultArgs: tOptional(tArray(tString)),
    handleSIGINT: tOptional(tBoolean),
    handleSIGTERM: tOptional(tBoolean),
    handleSIGHUP: tOptional(tBoolean),
    timeout: tOptional(tNumber),
    env: tOptional(tArray(tType('NameValue'))),
    headless: tOptional(tBoolean),
    devtools: tOptional(tBoolean),
    proxy: tOptional(tObject({
      server: tString,
      bypass: tOptional(tString),
      username: tOptional(tString),
      password: tOptional(tString),
    })),
    downloadsPath: tOptional(tString),
    chromiumSandbox: tOptional(tBoolean),
    slowMo: tOptional(tNumber),
    noDefaultViewport: tOptional(tBoolean),
    viewport: tOptional(tObject({
      width: tNumber,
      height: tNumber,
    })),
    ignoreHTTPSErrors: tOptional(tBoolean),
    javaScriptEnabled: tOptional(tBoolean),
    bypassCSP: tOptional(tBoolean),
    userAgent: tOptional(tString),
    locale: tOptional(tString),
    timezoneId: tOptional(tString),
    geolocation: tOptional(tObject({
      longitude: tNumber,
      latitude: tNumber,
      accuracy: tOptional(tNumber),
    })),
    permissions: tOptional(tArray(tString)),
    extraHTTPHeaders: tOptional(tArray(tType('NameValue'))),
    offline: tOptional(tBoolean),
    httpCredentials: tOptional(tObject({
      username: tString,
      password: tString,
    })),
    deviceScaleFactor: tOptional(tNumber),
    isMobile: tOptional(tBoolean),
    hasTouch: tOptional(tBoolean),
    colorScheme: tOptional(tEnum(['light', 'dark', 'no-preference'])),
    acceptDownloads: tOptional(tBoolean),
    _traceResourcesPath: tOptional(tString),
    _tracePath: tOptional(tString),
    recordVideo: tOptional(tObject({
      dir: tString,
      size: tOptional(tObject({
        width: tNumber,
        height: tNumber,
      })),
    })),
    recordHar: tOptional(tObject({
      omitContent: tOptional(tBoolean),
      path: tString,
    })),
  });
  scheme.BrowserCloseParams = tOptional(tObject({}));
  scheme.BrowserNewContextParams = tObject({
    noDefaultViewport: tOptional(tBoolean),
    viewport: tOptional(tObject({
      width: tNumber,
      height: tNumber,
    })),
    ignoreHTTPSErrors: tOptional(tBoolean),
    javaScriptEnabled: tOptional(tBoolean),
    bypassCSP: tOptional(tBoolean),
    userAgent: tOptional(tString),
    locale: tOptional(tString),
    timezoneId: tOptional(tString),
    geolocation: tOptional(tObject({
      longitude: tNumber,
      latitude: tNumber,
      accuracy: tOptional(tNumber),
    })),
    permissions: tOptional(tArray(tString)),
    extraHTTPHeaders: tOptional(tArray(tType('NameValue'))),
    offline: tOptional(tBoolean),
    httpCredentials: tOptional(tObject({
      username: tString,
      password: tString,
    })),
    deviceScaleFactor: tOptional(tNumber),
    isMobile: tOptional(tBoolean),
    hasTouch: tOptional(tBoolean),
    colorScheme: tOptional(tEnum(['dark', 'light', 'no-preference'])),
    acceptDownloads: tOptional(tBoolean),
    _traceResourcesPath: tOptional(tString),
    _tracePath: tOptional(tString),
    recordVideo: tOptional(tObject({
      dir: tString,
      size: tOptional(tObject({
        width: tNumber,
        height: tNumber,
      })),
    })),
    recordHar: tOptional(tObject({
      omitContent: tOptional(tBoolean),
      path: tString,
    })),
    proxy: tOptional(tObject({
      server: tString,
      bypass: tOptional(tString),
      username: tOptional(tString),
      password: tOptional(tString),
    })),
    storageState: tOptional(tObject({
      cookies: tOptional(tArray(tType('SetNetworkCookie'))),
      origins: tOptional(tArray(tType('OriginStorage'))),
    })),
  });
  scheme.BrowserCrNewBrowserCDPSessionParams = tOptional(tObject({}));
  scheme.BrowserCrStartTracingParams = tObject({
    page: tOptional(tChannel('Page')),
    path: tOptional(tString),
    screenshots: tOptional(tBoolean),
    categories: tOptional(tArray(tString)),
  });
  scheme.BrowserCrStopTracingParams = tOptional(tObject({}));
  scheme.BrowserContextAddCookiesParams = tObject({
    cookies: tArray(tType('SetNetworkCookie')),
  });
  scheme.BrowserContextAddInitScriptParams = tObject({
    source: tString,
  });
  scheme.BrowserContextClearCookiesParams = tOptional(tObject({}));
  scheme.BrowserContextClearPermissionsParams = tOptional(tObject({}));
  scheme.BrowserContextCloseParams = tOptional(tObject({}));
  scheme.BrowserContextCookiesParams = tObject({
    urls: tArray(tString),
  });
  scheme.BrowserContextExposeBindingParams = tObject({
    name: tString,
    needsHandle: tOptional(tBoolean),
  });
  scheme.BrowserContextGrantPermissionsParams = tObject({
    permissions: tArray(tString),
    origin: tOptional(tString),
  });
  scheme.BrowserContextNewPageParams = tOptional(tObject({}));
  scheme.BrowserContextSetDefaultNavigationTimeoutNoReplyParams = tObject({
    timeout: tNumber,
  });
  scheme.BrowserContextSetDefaultTimeoutNoReplyParams = tObject({
    timeout: tNumber,
  });
  scheme.BrowserContextSetExtraHTTPHeadersParams = tObject({
    headers: tArray(tType('NameValue')),
  });
  scheme.BrowserContextSetGeolocationParams = tObject({
    geolocation: tOptional(tObject({
      longitude: tNumber,
      latitude: tNumber,
      accuracy: tOptional(tNumber),
    })),
  });
  scheme.BrowserContextSetHTTPCredentialsParams = tObject({
    httpCredentials: tOptional(tObject({
      username: tString,
      password: tString,
    })),
  });
  scheme.BrowserContextSetNetworkInterceptionEnabledParams = tObject({
    enabled: tBoolean,
  });
  scheme.BrowserContextSetOfflineParams = tObject({
    offline: tBoolean,
  });
  scheme.BrowserContextStorageStateParams = tOptional(tObject({}));
  scheme.BrowserContextCrNewCDPSessionParams = tObject({
    page: tChannel('Page'),
  });
  scheme.PageSetDefaultNavigationTimeoutNoReplyParams = tObject({
    timeout: tNumber,
  });
  scheme.PageSetDefaultTimeoutNoReplyParams = tObject({
    timeout: tNumber,
  });
  scheme.PageSetFileChooserInterceptedNoReplyParams = tObject({
    intercepted: tBoolean,
  });
  scheme.PageAddInitScriptParams = tObject({
    source: tString,
  });
  scheme.PageCloseParams = tObject({
    runBeforeUnload: tOptional(tBoolean),
  });
  scheme.PageEmulateMediaParams = tObject({
    media: tOptional(tEnum(['screen', 'print', 'null'])),
    colorScheme: tOptional(tEnum(['dark', 'light', 'no-preference', 'null'])),
  });
  scheme.PageExposeBindingParams = tObject({
    name: tString,
    needsHandle: tOptional(tBoolean),
  });
  scheme.PageGoBackParams = tObject({
    timeout: tOptional(tNumber),
    waitUntil: tOptional(tEnum(['load', 'domcontentloaded', 'networkidle'])),
  });
  scheme.PageGoForwardParams = tObject({
    timeout: tOptional(tNumber),
    waitUntil: tOptional(tEnum(['load', 'domcontentloaded', 'networkidle'])),
  });
  scheme.PageOpenerParams = tOptional(tObject({}));
  scheme.PageReloadParams = tObject({
    timeout: tOptional(tNumber),
    waitUntil: tOptional(tEnum(['load', 'domcontentloaded', 'networkidle'])),
  });
  scheme.PageScreenshotParams = tObject({
    timeout: tOptional(tNumber),
    type: tOptional(tEnum(['png', 'jpeg'])),
    quality: tOptional(tNumber),
    omitBackground: tOptional(tBoolean),
    fullPage: tOptional(tBoolean),
    clip: tOptional(tObject({
      width: tNumber,
      height: tNumber,
      x: tNumber,
      y: tNumber,
    })),
  });
  scheme.PageSetExtraHTTPHeadersParams = tObject({
    headers: tArray(tType('NameValue')),
  });
  scheme.PageSetNetworkInterceptionEnabledParams = tObject({
    enabled: tBoolean,
  });
  scheme.PageSetViewportSizeParams = tObject({
    viewportSize: tObject({
      width: tNumber,
      height: tNumber,
    }),
  });
  scheme.PageKeyboardDownParams = tObject({
    key: tString,
  });
  scheme.PageKeyboardUpParams = tObject({
    key: tString,
  });
  scheme.PageKeyboardInsertTextParams = tObject({
    text: tString,
  });
  scheme.PageKeyboardTypeParams = tObject({
    text: tString,
    delay: tOptional(tNumber),
  });
  scheme.PageKeyboardPressParams = tObject({
    key: tString,
    delay: tOptional(tNumber),
  });
  scheme.PageMouseMoveParams = tObject({
    x: tNumber,
    y: tNumber,
    steps: tOptional(tNumber),
  });
  scheme.PageMouseDownParams = tObject({
    button: tOptional(tEnum(['left', 'right', 'middle'])),
    clickCount: tOptional(tNumber),
  });
  scheme.PageMouseUpParams = tObject({
    button: tOptional(tEnum(['left', 'right', 'middle'])),
    clickCount: tOptional(tNumber),
  });
  scheme.PageMouseClickParams = tObject({
    x: tNumber,
    y: tNumber,
    delay: tOptional(tNumber),
    button: tOptional(tEnum(['left', 'right', 'middle'])),
    clickCount: tOptional(tNumber),
  });
  scheme.PageTouchscreenTapParams = tObject({
    x: tNumber,
    y: tNumber,
  });
  scheme.PageAccessibilitySnapshotParams = tObject({
    interestingOnly: tOptional(tBoolean),
    root: tOptional(tChannel('ElementHandle')),
  });
  scheme.PagePdfParams = tObject({
    scale: tOptional(tNumber),
    displayHeaderFooter: tOptional(tBoolean),
    headerTemplate: tOptional(tString),
    footerTemplate: tOptional(tString),
    printBackground: tOptional(tBoolean),
    landscape: tOptional(tBoolean),
    pageRanges: tOptional(tString),
    format: tOptional(tString),
    width: tOptional(tString),
    height: tOptional(tString),
    preferCSSPageSize: tOptional(tBoolean),
    margin: tOptional(tObject({
      top: tOptional(tString),
      bottom: tOptional(tString),
      left: tOptional(tString),
      right: tOptional(tString),
    })),
  });
  scheme.PageCrStartJSCoverageParams = tObject({
    resetOnNavigation: tOptional(tBoolean),
    reportAnonymousScripts: tOptional(tBoolean),
  });
  scheme.PageCrStopJSCoverageParams = tOptional(tObject({}));
  scheme.PageCrStartCSSCoverageParams = tObject({
    resetOnNavigation: tOptional(tBoolean),
  });
  scheme.PageCrStopCSSCoverageParams = tOptional(tObject({}));
  scheme.PageBringToFrontParams = tOptional(tObject({}));
  scheme.FrameEvalOnSelectorParams = tObject({
    selector: tString,
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.FrameEvalOnSelectorAllParams = tObject({
    selector: tString,
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.FrameAddScriptTagParams = tObject({
    url: tOptional(tString),
    content: tOptional(tString),
    type: tOptional(tString),
  });
  scheme.FrameAddStyleTagParams = tObject({
    url: tOptional(tString),
    content: tOptional(tString),
  });
  scheme.FrameCheckParams = tObject({
    selector: tString,
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    timeout: tOptional(tNumber),
  });
  scheme.FrameClickParams = tObject({
    selector: tString,
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    modifiers: tOptional(tArray(tEnum(['Alt', 'Control', 'Meta', 'Shift']))),
    position: tOptional(tObject({
      x: tNumber,
      y: tNumber,
    })),
    delay: tOptional(tNumber),
    button: tOptional(tEnum(['left', 'right', 'middle'])),
    clickCount: tOptional(tNumber),
    timeout: tOptional(tNumber),
  });
  scheme.FrameContentParams = tOptional(tObject({}));
  scheme.FrameDblclickParams = tObject({
    selector: tString,
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    modifiers: tOptional(tArray(tEnum(['Alt', 'Control', 'Meta', 'Shift']))),
    position: tOptional(tObject({
      x: tNumber,
      y: tNumber,
    })),
    delay: tOptional(tNumber),
    button: tOptional(tEnum(['left', 'right', 'middle'])),
    timeout: tOptional(tNumber),
  });
  scheme.FrameDispatchEventParams = tObject({
    selector: tString,
    type: tString,
    eventInit: tType('SerializedArgument'),
    timeout: tOptional(tNumber),
  });
  scheme.FrameEvaluateExpressionParams = tObject({
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
    world: tOptional(tEnum(['main', 'utility'])),
  });
  scheme.FrameEvaluateExpressionHandleParams = tObject({
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
    world: tOptional(tEnum(['main', 'utility'])),
  });
  scheme.FrameFillParams = tObject({
    selector: tString,
    value: tString,
    timeout: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
  });
  scheme.FrameFocusParams = tObject({
    selector: tString,
    timeout: tOptional(tNumber),
  });
  scheme.FrameFrameElementParams = tOptional(tObject({}));
  scheme.FrameGetAttributeParams = tObject({
    selector: tString,
    name: tString,
    timeout: tOptional(tNumber),
  });
  scheme.FrameGotoParams = tObject({
    url: tString,
    timeout: tOptional(tNumber),
    waitUntil: tOptional(tEnum(['load', 'domcontentloaded', 'networkidle'])),
    referer: tOptional(tString),
  });
  scheme.FrameHoverParams = tObject({
    selector: tString,
    force: tOptional(tBoolean),
    modifiers: tOptional(tArray(tEnum(['Alt', 'Control', 'Meta', 'Shift']))),
    position: tOptional(tObject({
      x: tNumber,
      y: tNumber,
    })),
    timeout: tOptional(tNumber),
  });
  scheme.FrameInnerHTMLParams = tObject({
    selector: tString,
    timeout: tOptional(tNumber),
  });
  scheme.FrameInnerTextParams = tObject({
    selector: tString,
    timeout: tOptional(tNumber),
  });
  scheme.FramePressParams = tObject({
    selector: tString,
    key: tString,
    delay: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
    timeout: tOptional(tNumber),
  });
  scheme.FrameQuerySelectorParams = tObject({
    selector: tString,
  });
  scheme.FrameQuerySelectorAllParams = tObject({
    selector: tString,
  });
  scheme.FrameSelectOptionParams = tObject({
    selector: tString,
    elements: tOptional(tArray(tChannel('ElementHandle'))),
    options: tOptional(tArray(tObject({
      value: tOptional(tString),
      label: tOptional(tString),
      index: tOptional(tNumber),
    }))),
    timeout: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
  });
  scheme.FrameSetContentParams = tObject({
    html: tString,
    timeout: tOptional(tNumber),
    waitUntil: tOptional(tEnum(['load', 'domcontentloaded', 'networkidle'])),
  });
  scheme.FrameSetInputFilesParams = tObject({
    selector: tString,
    files: tArray(tObject({
      name: tString,
      mimeType: tString,
      buffer: tBinary,
    })),
    timeout: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
  });
  scheme.FrameTapParams = tObject({
    selector: tString,
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    modifiers: tOptional(tArray(tEnum(['Alt', 'Control', 'Meta', 'Shift']))),
    position: tOptional(tObject({
      x: tNumber,
      y: tNumber,
    })),
    timeout: tOptional(tNumber),
  });
  scheme.FrameTextContentParams = tObject({
    selector: tString,
    timeout: tOptional(tNumber),
  });
  scheme.FrameTitleParams = tOptional(tObject({}));
  scheme.FrameTypeParams = tObject({
    selector: tString,
    text: tString,
    delay: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
    timeout: tOptional(tNumber),
  });
  scheme.FrameUncheckParams = tObject({
    selector: tString,
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    timeout: tOptional(tNumber),
  });
  scheme.FrameWaitForFunctionParams = tObject({
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
    timeout: tOptional(tNumber),
    pollingInterval: tOptional(tNumber),
  });
  scheme.FrameWaitForSelectorParams = tObject({
    selector: tString,
    timeout: tOptional(tNumber),
    state: tOptional(tEnum(['attached', 'detached', 'visible', 'hidden'])),
  });
  scheme.FrameExtendInjectedScriptParams = tObject({
    source: tString,
    arg: tType('SerializedArgument'),
  });
  scheme.WorkerEvaluateExpressionParams = tObject({
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.WorkerEvaluateExpressionHandleParams = tObject({
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.JSHandleDisposeParams = tOptional(tObject({}));
  scheme.ElementHandleDisposeParams = tType('JSHandleDisposeParams');
  scheme.JSHandleEvaluateExpressionParams = tObject({
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.ElementHandleEvaluateExpressionParams = tType('JSHandleEvaluateExpressionParams');
  scheme.JSHandleEvaluateExpressionHandleParams = tObject({
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.ElementHandleEvaluateExpressionHandleParams = tType('JSHandleEvaluateExpressionHandleParams');
  scheme.JSHandleGetPropertyListParams = tOptional(tObject({}));
  scheme.ElementHandleGetPropertyListParams = tType('JSHandleGetPropertyListParams');
  scheme.JSHandleGetPropertyParams = tObject({
    name: tString,
  });
  scheme.ElementHandleGetPropertyParams = tType('JSHandleGetPropertyParams');
  scheme.JSHandleJsonValueParams = tOptional(tObject({}));
  scheme.ElementHandleJsonValueParams = tType('JSHandleJsonValueParams');
  scheme.ElementHandleEvalOnSelectorParams = tObject({
    selector: tString,
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.ElementHandleEvalOnSelectorAllParams = tObject({
    selector: tString,
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.ElementHandleBoundingBoxParams = tOptional(tObject({}));
  scheme.ElementHandleCheckParams = tObject({
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleClickParams = tObject({
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    modifiers: tOptional(tArray(tEnum(['Alt', 'Control', 'Meta', 'Shift']))),
    position: tOptional(tObject({
      x: tNumber,
      y: tNumber,
    })),
    delay: tOptional(tNumber),
    button: tOptional(tEnum(['left', 'right', 'middle'])),
    clickCount: tOptional(tNumber),
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleContentFrameParams = tOptional(tObject({}));
  scheme.ElementHandleDblclickParams = tObject({
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    modifiers: tOptional(tArray(tEnum(['Alt', 'Control', 'Meta', 'Shift']))),
    position: tOptional(tObject({
      x: tNumber,
      y: tNumber,
    })),
    delay: tOptional(tNumber),
    button: tOptional(tEnum(['left', 'right', 'middle'])),
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleDispatchEventParams = tObject({
    type: tString,
    eventInit: tType('SerializedArgument'),
  });
  scheme.ElementHandleFillParams = tObject({
    value: tString,
    timeout: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
  });
  scheme.ElementHandleFocusParams = tOptional(tObject({}));
  scheme.ElementHandleGetAttributeParams = tObject({
    name: tString,
  });
  scheme.ElementHandleHoverParams = tObject({
    force: tOptional(tBoolean),
    modifiers: tOptional(tArray(tEnum(['Alt', 'Control', 'Meta', 'Shift']))),
    position: tOptional(tObject({
      x: tNumber,
      y: tNumber,
    })),
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleInnerHTMLParams = tOptional(tObject({}));
  scheme.ElementHandleInnerTextParams = tOptional(tObject({}));
  scheme.ElementHandleOwnerFrameParams = tOptional(tObject({}));
  scheme.ElementHandlePressParams = tObject({
    key: tString,
    delay: tOptional(tNumber),
    timeout: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
  });
  scheme.ElementHandleQuerySelectorParams = tObject({
    selector: tString,
  });
  scheme.ElementHandleQuerySelectorAllParams = tObject({
    selector: tString,
  });
  scheme.ElementHandleScreenshotParams = tObject({
    timeout: tOptional(tNumber),
    type: tOptional(tEnum(['png', 'jpeg'])),
    quality: tOptional(tNumber),
    omitBackground: tOptional(tBoolean),
  });
  scheme.ElementHandleScrollIntoViewIfNeededParams = tObject({
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleSelectOptionParams = tObject({
    elements: tOptional(tArray(tChannel('ElementHandle'))),
    options: tOptional(tArray(tObject({
      value: tOptional(tString),
      label: tOptional(tString),
      index: tOptional(tNumber),
    }))),
    timeout: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
  });
  scheme.ElementHandleSelectTextParams = tObject({
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleSetInputFilesParams = tObject({
    files: tArray(tObject({
      name: tString,
      mimeType: tString,
      buffer: tBinary,
    })),
    timeout: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
  });
  scheme.ElementHandleTapParams = tObject({
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    modifiers: tOptional(tArray(tEnum(['Alt', 'Control', 'Meta', 'Shift']))),
    position: tOptional(tObject({
      x: tNumber,
      y: tNumber,
    })),
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleTextContentParams = tOptional(tObject({}));
  scheme.ElementHandleTypeParams = tObject({
    text: tString,
    delay: tOptional(tNumber),
    noWaitAfter: tOptional(tBoolean),
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleUncheckParams = tObject({
    force: tOptional(tBoolean),
    noWaitAfter: tOptional(tBoolean),
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleWaitForElementStateParams = tObject({
    state: tEnum(['visible', 'hidden', 'stable', 'enabled', 'disabled']),
    timeout: tOptional(tNumber),
  });
  scheme.ElementHandleWaitForSelectorParams = tObject({
    selector: tString,
    timeout: tOptional(tNumber),
    state: tOptional(tEnum(['attached', 'detached', 'visible', 'hidden'])),
  });
  scheme.ElementHandleCreateSelectorForTestParams = tObject({
    name: tString,
  });
  scheme.RequestResponseParams = tOptional(tObject({}));
  scheme.RouteAbortParams = tObject({
    errorCode: tOptional(tString),
  });
  scheme.RouteContinueParams = tObject({
    url: tOptional(tString),
    method: tOptional(tString),
    headers: tOptional(tArray(tType('NameValue'))),
    postData: tOptional(tBinary),
  });
  scheme.RouteFulfillParams = tObject({
    status: tOptional(tNumber),
    headers: tOptional(tArray(tType('NameValue'))),
    body: tOptional(tString),
    isBase64: tOptional(tBoolean),
  });
  scheme.ResourceTiming = tObject({
    startTime: tNumber,
    domainLookupStart: tNumber,
    domainLookupEnd: tNumber,
    connectStart: tNumber,
    secureConnectionStart: tNumber,
    connectEnd: tNumber,
    requestStart: tNumber,
    responseStart: tNumber,
  });
  scheme.ResponseBodyParams = tOptional(tObject({}));
  scheme.ResponseFinishedParams = tOptional(tObject({}));
  scheme.BindingCallRejectParams = tObject({
    error: tType('SerializedError'),
  });
  scheme.BindingCallResolveParams = tObject({
    result: tType('SerializedArgument'),
  });
  scheme.DialogAcceptParams = tObject({
    promptText: tOptional(tString),
  });
  scheme.DialogDismissParams = tOptional(tObject({}));
  scheme.DownloadPathParams = tOptional(tObject({}));
  scheme.DownloadSaveAsParams = tObject({
    path: tString,
  });
  scheme.DownloadSaveAsStreamParams = tOptional(tObject({}));
  scheme.DownloadFailureParams = tOptional(tObject({}));
  scheme.DownloadStreamParams = tOptional(tObject({}));
  scheme.DownloadDeleteParams = tOptional(tObject({}));
  scheme.StreamReadParams = tObject({
    size: tOptional(tNumber),
  });
  scheme.StreamCloseParams = tOptional(tObject({}));
  scheme.CDPSessionSendParams = tObject({
    method: tString,
    params: tOptional(tAny),
  });
  scheme.CDPSessionDetachParams = tOptional(tObject({}));
  scheme.ElectronLaunchParams = tObject({
    executablePath: tString,
    args: tOptional(tArray(tString)),
    cwd: tOptional(tString),
    env: tOptional(tArray(tType('NameValue'))),
    handleSIGINT: tOptional(tBoolean),
    handleSIGTERM: tOptional(tBoolean),
    handleSIGHUP: tOptional(tBoolean),
    timeout: tOptional(tNumber),
  });
  scheme.ElectronApplicationNewBrowserWindowParams = tObject({
    arg: tType('SerializedArgument'),
  });
  scheme.ElectronApplicationEvaluateExpressionParams = tObject({
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.ElectronApplicationEvaluateExpressionHandleParams = tObject({
    expression: tString,
    isFunction: tBoolean,
    arg: tType('SerializedArgument'),
  });
  scheme.ElectronApplicationCloseParams = tOptional(tObject({}));

  return scheme;
}
