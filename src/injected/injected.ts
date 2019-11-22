// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SelectorEngine } from './selectorEngine';
import { Utils } from './utils';

type ParsedSelector = { engine: SelectorEngine, selector: string }[];

export class Injected {
  readonly utils: Utils;
  readonly engines: Map<string, SelectorEngine>;

  constructor(engines: SelectorEngine[]) {
    this.utils = new Utils();
    this.engines = new Map();
    for (const engine of engines)
      this.engines.set(engine.name, engine);
  }

  querySelector(selector: string, root: Element): Element | undefined {
    const parsed = this._parseSelector(selector);
    let element = root;
    for (const { engine, selector } of parsed) {
      const next = engine.query(element.shadowRoot || element, selector);
      if (!next)
        return;
      element = next;
    }
    return element;
  }

  querySelectorAll(selector: string, root: Element): Element[] {
    const parsed = this._parseSelector(selector);
    let set = new Set<Element>([ root ]);
    for (const { engine, selector } of parsed) {
      const newSet = new Set<Element>();
      for (const prev of set) {
        for (const next of engine.queryAll(prev.shadowRoot || prev, selector)) {
          if (newSet.has(next))
            continue;
          newSet.add(next);
        }
      }
      set = newSet;
    }
    return Array.from(set);
  }

  private _parseSelector(selector: string): ParsedSelector {
    let index = 0;
    let quote: string | undefined;
    let start = 0;
    const result: ParsedSelector = [];
    const append = () => {
      const part = selector.substring(start, index);
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1)
        throw new Error(`Cannot parse selector ${selector}`);
      const name = part.substring(0, eqIndex).trim();
      const body = part.substring(eqIndex + 1);
      const engine = this.engines.get(name.toLowerCase());
      if (!engine)
        throw new Error(`Unknown engine ${name} while parsing selector ${selector}`);
      result.push({ engine, selector: body });
    };
    while (index < selector.length) {
      const c = selector[index];
      if (c === '\\' && index + 1 < selector.length) {
        index += 2;
      } else if (c === quote) {
        quote = undefined;
        index++;
      } else if (!quote && c === '>' && selector[index + 1] === '>') {
        append();
        index += 2;
        start = index;
      } else {
        index++;
      }
    }
    append();
    return result;
  }
}

export default Injected;
