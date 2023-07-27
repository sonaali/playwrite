/**
 * Copyright (c) Microsoft Corporation.
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

import type zip from '@zip.js/zip.js';
// @ts-ignore
import zipImport from '@zip.js/zip.js/dist/zip-no-worker-inflate.min.js';
import type { TraceModelBackend } from './traceModel';

const zipjs = zipImport as typeof zip;

export async function newZipReader(blobOrUrl: Blob | string, progress: Progress): Promise<{ entries: Map<string, zip.Entry>, reader: zip.ZipReader }> {
  let reader: zip.ZipReader;
  if (blobOrUrl instanceof Blob)
    reader = new zipjs.ZipReader(new zipjs.BlobReader(blobOrUrl), { useWebWorkers: false }) as zip.ZipReader;
  else
    reader = new zipjs.ZipReader(new zipjs.HttpReader(formatUrl(blobOrUrl), { mode: 'cors', preventHeadRequest: true } as any), { useWebWorkers: false }) as zip.ZipReader;
  const entries = await reader.getEntries({ onprogress: progress }).then(entries => {
    const map = new Map<string, zip.Entry>();
    for (const entry of entries)
      map.set(entry.filename, entry);
    return map;
  });
  return { entries, reader };
}

type Progress = (done: number, total: number) => void;

export class ZipTraceModelBackend implements TraceModelBackend {
  private _entries: Map<string, zip.Entry>;
  private _traceURL: string;

  constructor(traceURL: string, entries: Map<string, zip.Entry>) {
    this._traceURL = traceURL;
    this._entries = entries;
  }

  isLive() {
    return false;
  }

  traceURL() {
    return this._traceURL;
  }

  async entryNames(): Promise<string[]> {
    const entries = this._entries;
    return [...entries.keys()];
  }

  async hasEntry(entryName: string): Promise<boolean> {
    const entries = this._entries;
    return entries.has(entryName);
  }

  async readText(entryName: string): Promise<string | undefined> {
    const entries = this._entries;
    const entry = entries.get(entryName);
    if (!entry)
      return;
    const writer = new zipjs.TextWriter();
    await entry.getData?.(writer);
    return writer.getData();
  }

  async readBlob(entryName: string): Promise<Blob | undefined> {
    const entries = this._entries;
    const entry = entries.get(entryName);
    if (!entry)
      return;
    const writer = new zipjs.BlobWriter() as zip.BlobWriter;
    await entry.getData!(writer);
    return writer.getData();
  }
}

export class FetchTraceModelBackend implements TraceModelBackend {
  private _entriesPromise: Promise<Map<string, string>>;
  private _traceURL: string;

  constructor(traceURL: string) {
    this._traceURL = traceURL;
    this._entriesPromise = fetch('/trace/file?path=' + encodeURIComponent(traceURL)).then(async response => {
      const json = JSON.parse(await response.text());
      const entries = new Map<string, string>();
      for (const entry of json.entries)
        entries.set(entry.name, entry.path);
      return entries;
    });
  }

  isLive() {
    return true;
  }

  traceURL(): string {
    return this._traceURL;
  }

  async entryNames(): Promise<string[]> {
    const entries = await this._entriesPromise;
    return [...entries.keys()];
  }

  async hasEntry(entryName: string): Promise<boolean> {
    const entries = await this._entriesPromise;
    return entries.has(entryName);
  }

  async readText(entryName: string): Promise<string | undefined> {
    const response = await this._readEntry(entryName);
    return response?.text();
  }

  async readBlob(entryName: string): Promise<Blob | undefined> {
    const response = await this._readEntry(entryName);
    return response?.blob();
  }

  private async _readEntry(entryName: string): Promise<Response | undefined> {
    const entries = await this._entriesPromise;
    const fileName = entries.get(entryName);
    if (!fileName)
      return;
    return fetch('/trace/file?path=' + encodeURIComponent(fileName));
  }
}

function formatUrl(trace: string) {
  let url = trace.startsWith('http') || trace.startsWith('blob') ? trace : `file?path=${encodeURIComponent(trace)}`;
  // Dropbox does not support cors.
  if (url.startsWith('https://www.dropbox.com/'))
    url = 'https://dl.dropboxusercontent.com/' + url.substring('https://www.dropbox.com/'.length);
  return url;
}

export class PlaywrightReportModel {
  private _assets = new Map<string, { blob: Blob, headers: Record<string, string> }>();
  private _entries: Map<string, zip.Entry>;
  private _dataFiles = new Map<string, Blob>();

  private constructor(entries: Map<string, zip.Entry>) {
    this._entries = entries;
  }

  static async create(entries: Map<string, zip.Entry>): Promise<PlaywrightReportModel> {
    const model = new PlaywrightReportModel(entries);
    await model._load();
    return model;
  }

  public findResponse(url: string): Response | undefined {
    const response = this._assets.get(url);
    if (!response)
      return;
    return new Response(response.blob, {
      headers: response.headers,
    });
  }

  public dataFile(traceUrl: string | null): Blob | undefined {
    if (!traceUrl)
      return;
    return this._dataFiles.get(traceUrl);
  }

  public static isPlaywrightReport(entries: Map<string, zip.Entry>): boolean {
    return entries.has('index.html');
  }

  private async _load() {
    this._assets.clear();
    this._dataFiles.clear();
    for (const [, entry] of this._entries) {
      if (entry.directory)
        continue;
      // We are already a trace viewer, no need for the bundled one.
      if (entry.filename.startsWith('trace/'))
        continue;
      const blob: Blob = await entry.getData!(new zipjs.BlobWriter());
      if (entry.filename.startsWith('data/')) {
        this._dataFiles.set(`${(self as any).registration.scope}report/${entry.filename}`, blob);
      } else {
        this._assets.set(`/report/${entry.filename}`, {
          blob,
          headers: {
            'Content-Type': filenameToMimeType(entry.filename),
          },
        });
      }
    }
  }
}

function filenameToMimeType(filename: string): string {
  const filenameToMimeTypeMapping = new Map<string, string>([
    ['html', 'text/html'],
    ['js', 'application/javascript'],
    ['css', 'text/css'],
    ['png', 'image/png'],
    ['svg', 'image/svg+xml'],
    ['ttf', 'font/ttf'],
    ['woff', 'font/woff'],
    ['woff2', 'font/woff2'],
    ['zip', 'application/zip'],
  ]);

  const extension = filename.split('.').pop() || '';
  if (filenameToMimeTypeMapping.has(extension))
    return filenameToMimeTypeMapping.get(extension)!;
  return 'application/octet-stream';
}
