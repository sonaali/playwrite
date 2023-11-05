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

import { escapeForAttributeSelector, escapeForTextSelector } from '../../utils/isomorphic/stringUtils';
import { asLocators } from './locatorGenerators';
import type { Language, Quote } from './locatorGenerators';
import { getByAltTextSelector, getByLabelSelector, getByPlaceholderSelector, getByRoleSelector, getByTestIdSelector, getByTextSelector, getByTitleSelector } from './locatorUtils';
import { parseSelector } from './selectorParser';

type Re = { source: string, flags: string };
type Token = {
  token?: string;
  string?: string;
  identLike?: string;
  re?: Re;
  eof?: boolean;
};

function tokenize(locator: string, language: Language): Token[] | undefined {
  if (language === 'jsonl')
    return;

  const tokens = {
    javascript: new Set(['(', ')', '{', '}', '.', ',', ':']),
    java: new Set(['(', ')', '.', ',']),
    python: new Set(['(', ')', '.', ',', '=']),
    csharp: new Set(['(', ')', '{', '}', '.', ',', '=']),
  }[language];
  const quotes = {
    javascript: new Set(['\'', '"', '`']),
    java: new Set(['"']),
    python: new Set(['\'', '"']),
    csharp: new Set(['"']),
  }[language];
  const whitespace = new Set([' ', '\n', '\t']);
  const reQuote = language === 'javascript' ? '/' : undefined;
  const isIdentLikeChar = (c: string) => {
    // Identifier, number, true, false.
    return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z') || c == '_' || ('0' <= c && c <= '9') || c === '-' || c === '+';
  };

  const result: Token[] = [];
  let i = 0;
  while (i < locator.length) {
    if (whitespace.has(locator[i])) {
      ++i;
      continue;
    }
    if (tokens.has(locator[i])) {
      result.push({ token: locator[i] });
      ++i;
      continue;
    }
    if (quotes.has(locator[i])) {
      const plain = language === 'python' && locator[i - 1] === 'r';
      const quote = locator[i];
      let j = i + 1;
      let string = '';
      while (j < locator.length) {
        if (plain && locator[j] === '\\' && locator[j + 1] === quote) {
          string += quote;
          j += 2;
        } else if (!plain && locator[j] === '\\' && j + 1 < locator.length) {
          if (locator[j + 1] === 'n')
            string += '\n';
          else if (locator[j + 1] === 'r')
            string += '\r';
          else if (locator[j + 1] === 't')
            string += '\t';
          else
            string += locator[j + 1];
          j += 2;
        } else if (locator[j] === quote) {
          break;
        } else {
          string += locator[j];
          ++j;
        }
      }
      i = j + 1;
      result.push({ string });
      continue;
    }
    if (locator[i] === reQuote) {
      let j = i + 1;
      while (j < locator.length && locator[j] !== '/') {
        if (locator[j] === '\\')
          ++j;
        ++j;
      }
      const source = locator.substring(i + 1, j);
      ++j;
      i = j;
      while (j < locator.length && locator[j] >= 'a' && locator[j] <= 'z')
        ++j;
      const flags = locator.substring(i, j);
      i = j;
      result.push({ re: { source, flags } });
      continue;
    }
    if (isIdentLikeChar(locator[i])) {
      let j = i + 1;
      while (j < locator.length && isIdentLikeChar(locator[j]))
        ++j;
      result.push({ identLike: locator.substring(i, j) });
      i = j;
      continue;
    }
    return undefined;
  }
  result.push({ eof: true });
  return result;
}

type Expr = {
  string?: string;
  re?: Re;
  chain?: Chain;
  identLike?: string;
};
type Call = {
  func: string;
  args: Expr[];
  options: { name: string, value: Expr }[];
};
type Chain = {
  identLike?: string;
  call?: Call;
}[];

function parseJavaScriptTokens(tokens: Token[]): Expr | undefined {
  let pos = 0;

  function expect(condition: boolean): asserts condition {
    if (!condition)
      throw new Error('');
  }

  function parseExpr(): Expr {
    if (tokens[pos].string !== undefined)
      return tokens[pos++];
    if (tokens[pos].re !== undefined)
      return tokens[pos++];
    if (tokens[pos].identLike !== undefined) {
      if (tokens[pos + 1].token === '.' || tokens[pos + 1].token === '(')
        return { chain: parseChain() };
      return tokens[pos++];
    }
    expect(false);
  }

  function parseCall(): Call {
    const func = tokens[pos++].identLike;
    expect(func !== undefined);
    const call: Call = { func, args: [], options: [] };
    expect(tokens[pos++].token === '(');
    while (tokens[pos].token !== ')') {
      let isOptions = false;
      if (tokens[pos].token === '{') {
        isOptions = true;
        ++pos;
        while (true) {
          const name = tokens[pos++].identLike;
          expect(name !== undefined);
          expect(tokens[pos++].token === ':');
          const value = parseExpr();
          call.options.push({ name, value });
          if (tokens[pos].token === ',') {
            ++pos;
            continue;
          }
          break;
        }
        expect(tokens[pos++].token === '}');
      } else {
        call.args.push(parseExpr());
      }
      if (tokens[pos].token === ',') {
        expect(!isOptions);
        ++pos;
        continue;
      }
      break;
    }
    expect(tokens[pos++].token === ')');
    return call;
  }

  function parseChain(): Chain {
    const result: Chain = [];
    while (tokens[pos].identLike !== undefined) {
      if (tokens[pos + 1].token === '(')
        result.push({ call: parseCall() });
      else
        result.push(tokens[pos++]);
      if (tokens[pos].token !== '.')
        break;
      ++pos;
    }
    return result;
  }

  try {
    const result = parseExpr();
    expect(!!tokens[pos].eof);
    return result;
  } catch {
  }
}

function parseJavaTokens(tokens: Token[]): Expr | undefined {
  let pos = 0;

  function expect(condition: boolean): asserts condition {
    if (!condition)
      throw new Error('');
  }

  function parseExpr(): Expr {
    if (tokens[pos].string !== undefined)
      return tokens[pos++];
    if (tokens[pos].identLike !== undefined) {
      if (tokens[pos].identLike === 'Pattern' && tokens[pos + 1].token === '.' && tokens[pos + 2].identLike === 'compile'
        && tokens[pos + 3].token === '(' && tokens[pos + 4].string !== undefined) {
        if (tokens[pos + 5].token === ')') {
          const result = { re: { source: tokens[pos + 4].string!, flags: '' } };
          pos += 6;
          return result;
        }
        if (tokens[pos + 5].token === ',' && tokens[pos + 6].identLike === 'Pattern' && tokens[pos + 7].token === '.' && tokens[pos + 8].identLike === 'CASE_INSENSITIVE' && tokens[pos + 9].token === ')') {
          const result = { re: { source: tokens[pos + 4].string!, flags: 'i' } };
          pos += 10;
          return result;
        }
      }
      if (tokens[pos].identLike === 'AriaRole' && tokens[pos + 1].token === '.' && tokens[pos + 2].identLike !== undefined) {
        const result = { string: tokens[pos + 2].identLike!.toLowerCase() };
        pos += 3;
        return result;
      }
      if (tokens[pos + 1].token === '.' || tokens[pos + 1].token === '(')
        return { chain: parseChain() };
      return tokens[pos++];
    }
    expect(false);
  }

  function parseCall(): Call {
    const func = tokens[pos++].identLike;
    expect(func !== undefined);
    const call: Call = { func, args: [], options: [] };
    expect(tokens[pos++].token === '(');
    while (tokens[pos].token !== ')') {
      let isOptions = false;
      if (tokens[pos].identLike === 'new') {
        isOptions = true;
        ++pos;
        // new Page.GetByRoleOptions()
        expect(tokens[pos++].identLike !== undefined);
        expect(tokens[pos++].token === '.');
        expect(tokens[pos++].identLike !== undefined);
        expect(tokens[pos++].token === '(');
        expect(tokens[pos++].token === ')');
        // .setName("name") [.setExact(true)]
        while (tokens[pos].token === '.') {
          ++pos;
          let name = tokens[pos++].identLike;
          expect(name !== undefined);
          expect(name.startsWith('set'));
          name = name[3].toLowerCase() + name.substring(4);
          expect(tokens[pos++].token === '(');
          const value = parseExpr();
          expect(tokens[pos++].token === ')');
          call.options.push({ name, value });
        }
      } else {
        call.args.push(parseExpr());
      }
      if (tokens[pos].token === ',') {
        expect(!isOptions);
        ++pos;
        continue;
      }
      break;
    }
    expect(tokens[pos++].token === ')');
    return call;
  }

  function parseChain(): Chain {
    const result: Chain = [];
    while (tokens[pos].identLike !== undefined) {
      if (tokens[pos + 1].token === '(')
        result.push({ call: parseCall() });
      else
        result.push(tokens[pos++]);
      if (tokens[pos].token !== '.')
        break;
      ++pos;
    }
    return result;
  }

  try {
    const result = parseExpr();
    expect(!!tokens[pos].eof);
    return result;
  } catch {
  }
}

function parsePythonTokens(tokens: Token[]): Expr | undefined {
  let pos = 0;

  function expect(condition: boolean): asserts condition {
    if (!condition)
      throw new Error('');
  }

  function toCamelCase(s: string) {
    return s.split('_').map((r, index) => index ? r[0].toUpperCase() + r.substring(1) : r).join('');
  }

  function parseExpr(): Expr {
    if (tokens[pos].string !== undefined)
      return tokens[pos++];
    if (tokens[pos].identLike === 'True' || tokens[pos].identLike === 'False')
      return { identLike: tokens[pos++].identLike!.toLowerCase() };
    if (tokens[pos].identLike !== undefined) {
      if (tokens[pos].identLike === 're' && tokens[pos + 1].token === '.' && tokens[pos + 2].identLike === 'compile'
        && tokens[pos + 3].token === '(' && tokens[pos + 4].identLike === 'r' && tokens[pos + 5].string !== undefined) {
        if (tokens[pos + 6].token === ')') {
          const result = { re: { source: tokens[pos + 5].string!, flags: '' } };
          pos += 7;
          return result;
        }
        if (tokens[pos + 6].token === ',' && tokens[pos + 7].identLike === 're' && tokens[pos + 8].token === '.' && tokens[pos + 9].identLike === 'IGNORECASE' && tokens[pos + 10].token === ')') {
          const result = { re: { source: tokens[pos + 5].string!, flags: 'i' } };
          pos += 11;
          return result;
        }
      }
      if (tokens[pos + 1].token === '.' || tokens[pos + 1].token === '(')
        return { chain: parseChain() };
      return tokens[pos++];
    }
    expect(false);
  }

  function parseCall(): Call {
    const func = tokens[pos++].identLike;
    expect(func !== undefined);
    const call: Call = { func: toCamelCase(func), args: [], options: [] };
    if (tokens[pos].token !== '(')
      return call;
    ++pos;
    let seenOptions = false;
    while (tokens[pos].token !== ')') {
      if (tokens[pos].identLike !== undefined && tokens[pos + 1].token === '=') {
        seenOptions = true;
        const name = tokens[pos++].identLike!;
        ++pos;
        const value = parseExpr();
        call.options.push({ name: toCamelCase(name), value });
      } else {
        expect(!seenOptions);
        call.args.push(parseExpr());
      }
      if (tokens[pos].token === ',') {
        ++pos;
        continue;
      }
      break;
    }
    expect(tokens[pos++].token === ')');
    return call;
  }

  function parseChain(): Chain {
    const result: Chain = [];
    while (tokens[pos].identLike !== undefined) {
      if (result.length || tokens[pos + 1].token === '(')
        result.push({ call: parseCall() });
      else
        result.push(tokens[pos++]);
      if (tokens[pos].token !== '.')
        break;
      ++pos;
    }
    return result;
  }

  try {
    const result = parseExpr();
    expect(!!tokens[pos].eof);
    return result;
  } catch {
  }
}

function parseCSharpTokens(tokens: Token[]): Expr | undefined {
  let pos = 0;

  function expect(condition: boolean): asserts condition {
    if (!condition)
      throw new Error('');
  }

  function toCamelCase(s: string) {
    return s[0].toLowerCase() + s.substring(1);
  }

  function parseExpr(): Expr {
    if (tokens[pos].string !== undefined)
      return tokens[pos++];
    if (tokens[pos].identLike !== undefined) {
      if (tokens[pos].identLike === 'new' && tokens[pos + 1].identLike === 'Regex' && tokens[pos + 2].token === '(' && tokens[pos + 3].string !== undefined) {
        if (tokens[pos + 4].token === ')') {
          const result = { re: { source: tokens[pos + 3].string!, flags: '' } };
          pos += 5;
          return result;
        }
        if (tokens[pos + 4].token === ',' && tokens[pos + 5].identLike === 'RegexOptions' && tokens[pos + 6].token === '.' && tokens[pos + 7].identLike === 'IgnoreCase' && tokens[pos + 8].token === ')') {
          const result = { re: { source: tokens[pos + 3].string!, flags: 'i' } };
          pos += 9;
          return result;
        }
      }
      if (tokens[pos].identLike === 'AriaRole' && tokens[pos + 1].token === '.' && tokens[pos + 2].identLike !== undefined) {
        const result = { string: tokens[pos + 2].identLike!.toLowerCase() };
        pos += 3;
        return result;
      }
      if (tokens[pos + 1].token === '.' || tokens[pos + 1].token === '(')
        return { chain: parseChain() };
      return tokens[pos++];
    }
    expect(false);
  }

  function parseCall(): Call {
    const func = tokens[pos++].identLike;
    expect(func !== undefined);
    const call: Call = { func: toCamelCase(func), args: [], options: [] };
    if (tokens[pos].token !== '(')
      return call;
    ++pos;
    while (tokens[pos].token !== ')') {
      let isOptions = false;
      if (tokens[pos].identLike === 'new' && tokens[pos + 1].identLike !== 'Regex') {
        isOptions = true;
        ++pos;
        // new [PageGetByRoleOptions]() { [...] }
        if (tokens[pos].identLike !== undefined)
          ++pos;
        expect(tokens[pos++].token === '(');
        expect(tokens[pos++].token === ')');
        expect(tokens[pos++].token === '{');
        // { Name = "foo", [...] }
        while (true) {
          let name = tokens[pos++].identLike;
          expect(name !== undefined);
          if (name.endsWith('Regex'))
            name = name.substring(0, name.length - 5);
          expect(tokens[pos++].token === '=');
          const value = parseExpr();
          call.options.push({ name: toCamelCase(name), value });
          if (tokens[pos].token === ',') {
            ++pos;
            continue;
          }
          break;
        }
        expect(tokens[pos++].token === '}');
      } else {
        call.args.push(parseExpr());
      }
      if (tokens[pos].token === ',') {
        expect(!isOptions);
        ++pos;
        continue;
      }
      break;
    }
    expect(tokens[pos++].token === ')');
    return call;
  }

  function parseChain(): Chain {
    const result: Chain = [];
    while (tokens[pos].identLike !== undefined) {
      if (result.length || tokens[pos + 1].token === '(')
        result.push({ call: parseCall() });
      else
        result.push(tokens[pos++]);
      if (tokens[pos].token !== '.')
        break;
      ++pos;
    }
    return result;
  }

  try {
    const result = parseExpr();
    expect(!!tokens[pos].eof);
    return result;
  } catch {
  }
}

function parseTokens(tokens: Token[], language: Language): Expr | undefined {
  if (language === 'javascript')
    return parseJavaScriptTokens(tokens);
  if (language === 'java')
    return parseJavaTokens(tokens);
  if (language === 'python')
    return parsePythonTokens(tokens);
  if (language === 'csharp')
    return parseCSharpTokens(tokens);
}

function parseExpr(expr: Expr, testIdAttributeName: string): string | undefined {
  function expect(condition: boolean): asserts condition {
    if (!condition)
      throw new Error('');
  }

  type LocatorOptions = {
    hasText?: string | RegExp;
    hasNotText?: string | RegExp;
    has?: string;
    hasNot?: string;
  };

  function chain(selector1: string, selector2: string, options?: LocatorOptions) {
    const sep = selector1 && selector2 ? ' >> ' : '';
    let selector = selector1 + sep + selector2;
    if (options?.hasText)
      selector += ` >> internal:has-text=${escapeForTextSelector(options.hasText, false)}`;
    if (options?.hasNotText)
      selector += ` >> internal:has-not-text=${escapeForTextSelector(options.hasNotText, false)}`;
    if (options?.has)
      selector += ` >> internal:has=` + JSON.stringify(options.has);
    if (options?.hasNot)
      selector += ` >> internal:has-not=` + JSON.stringify(options.hasNot);
    return selector;
  }

  function toRe(re: Re): RegExp {
    return new RegExp(re.source, re.flags);
  }

  function toString(expr: Expr): string {
    expect(expr.string !== undefined);
    return expr.string;
  }

  function toStringOrRe(expr: Expr): string | RegExp {
    if (expr.string !== undefined)
      return expr.string;
    if (expr.re)
      return toRe(expr.re);
    expect(false);
  }

  function toBoolean(expr: Expr): boolean {
    expect(['true', 'false'].includes(expr.identLike || ''));
    return expr.identLike === 'true';
  }

  function toNumber(expr: Expr): number {
    const num = +expr.identLike!;
    expect(!isNaN(num));
    return num;
  }

  function toOptions(call: Call, allowed: Record<string, 'string' | 'boolean' | 'stringOrRe' | 'number' | 'locator'>): any {
    const result: any = {};
    const seen = new Set<string>();
    for (const option of call.options) {
      expect(!seen.has(option.name));
      seen.add(option.name);
      const type = allowed[option.name];
      expect(!!type);
      const func = {
        string: toString,
        boolean: toBoolean,
        number: toNumber,
        stringOrRe: toStringOrRe,
        locator: toSelector,
      }[type];
      result[option.name] = func(option.value);
    }
    return result;
  }

  function toSelector(expr: Expr): string {
    expect(!!expr.chain);

    let selector = '';
    let isFrameLocator = false;

    const frameLocatorBehavior = (behavior: 'unexpected' | 'frameLocator' | 'locator') => {
      if (!isFrameLocator)
        return;
      expect(behavior !== 'unexpected');
      if (behavior === 'frameLocator')
        return;
      selector = chain(selector, 'internal:control=enter-frame');
      isFrameLocator = false;
    };

    for (let i = 0; i < expr.chain.length; i++) {
      if (i === 0 && expr.chain[i].identLike === 'page')
        continue;
      const call = expr.chain[i].call;
      expect(!!call);
      switch (call.func) {
        case 'and': {
          frameLocatorBehavior('unexpected');
          expect(call.args.length === 1);
          toOptions(call, {});
          selector = chain(selector, `internal:and=` + JSON.stringify(toSelector(call.args[0])));
          break;
        }
        case 'filter': {
          frameLocatorBehavior('unexpected');
          expect(call.args.length === 0);
          selector = chain(selector, '', toOptions(call, { hasText: 'stringOrRe', hasNotText: 'stringOrRe', has: 'locator', hasNot: 'locator' }));
          break;
        }
        case 'first': {
          frameLocatorBehavior('frameLocator');
          expect(call.args.length === 0);
          toOptions(call, {});
          selector = chain(selector, 'nth=0');
          break;
        }
        case 'frameLocator': {
          frameLocatorBehavior('locator');
          expect(call.args.length === 1);
          toOptions(call, {});
          selector = chain(selector, toString(call.args[0]));
          isFrameLocator = true;
          break;
        }
        case 'getByAltText': {
          frameLocatorBehavior('locator');
          expect(call.args.length === 1);
          selector = chain(selector, getByAltTextSelector(toStringOrRe(call.args[0]), toOptions(call, { exact: 'boolean' })));
          break;
        }
        case 'getByLabel': {
          frameLocatorBehavior('locator');
          expect(call.args.length === 1);
          selector = chain(selector, getByLabelSelector(toStringOrRe(call.args[0]), toOptions(call, { exact: 'boolean' })));
          break;
        }
        case 'getByPlaceholder': {
          frameLocatorBehavior('locator');
          expect(call.args.length === 1);
          selector = chain(selector, getByPlaceholderSelector(toStringOrRe(call.args[0]), toOptions(call, { exact: 'boolean' })));
          break;
        }
        case 'getByRole': {
          frameLocatorBehavior('locator');
          expect(call.args.length === 1);
          const options = { checked: 'boolean', disabled: 'boolean', exact: 'boolean', expanded: 'boolean', includeHidden: 'boolean', pressed: 'boolean', selected: 'boolean', level: 'number', name: 'stringOrRe' } as const;
          selector = chain(selector, getByRoleSelector(toString(call.args[0]), toOptions(call, options)));
          break;
        }
        case 'getByTestId': {
          frameLocatorBehavior('locator');
          expect(call.args.length === 1);
          toOptions(call, {});
          selector = chain(selector, getByTestIdSelector(testIdAttributeName, toStringOrRe(call.args[0])));
          break;
        }
        case 'getByText': {
          frameLocatorBehavior('locator');
          expect(call.args.length === 1);
          selector = chain(selector, getByTextSelector(toStringOrRe(call.args[0]), toOptions(call, { exact: 'boolean' })));
          break;
        }
        case 'getByTitle': {
          frameLocatorBehavior('locator');
          expect(call.args.length === 1);
          selector = chain(selector, getByTitleSelector(toStringOrRe(call.args[0]), toOptions(call, { exact: 'boolean' })));
          break;
        }
        case 'last': {
          frameLocatorBehavior('frameLocator');
          expect(call.args.length === 0);
          toOptions(call, {});
          selector = chain(selector, 'nth=-1');
          break;
        }
        case 'locator': {
          frameLocatorBehavior('locator');
          expect(call.args.length === 1);
          const options = toOptions(call, { hasText: 'stringOrRe', hasNotText: 'stringOrRe', has: 'locator', hasNot: 'locator' });
          if (call.args[0].string !== undefined)
            selector = chain(selector, call.args[0].string, options);
          else if (call.args[0].chain)
            selector = chain(selector, toSelector(call.args[0]), options);
          else
            expect(false);
          break;
        }
        case 'nth': {
          frameLocatorBehavior('frameLocator');
          expect(call.args.length === 1);
          toOptions(call, {});
          selector = chain(selector, 'nth=' + toNumber(call.args[0]));
          break;
        }
        case 'or': {
          frameLocatorBehavior('unexpected');
          expect(call.args.length === 1);
          toOptions(call, {});
          selector = chain(selector, `internal:or=` + JSON.stringify(toSelector(call.args[0])));
          break;
        }
        default:
          expect(false);
      }
    }
    return selector;
  }

  try {
    return toSelector(expr);
  } catch {
  }
}

export function locatorOrSelectorAsSelector(language: Language, locator: string, testIdAttributeName: string): string {
  try {
    parseSelector(locator);
    return locator;
  } catch (e) {
  }
  try {
    const tokens = tokenize(locator, language);
    if (!tokens)
      return '';
    const expr = parseTokens(tokens, language);
    if (!expr)
      return '';
    return parseExpr(expr, testIdAttributeName) || '';
  } catch {
  }
  return '';
}
