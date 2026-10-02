/** @jest-environment node */
import { documentToText, type DocumentDeps } from './documentText';

const file = (name: string, type = '') => ({ name, type, size: 10 }) as unknown as File;
const decode = (dataUrl: string) => Buffer.from(dataUrl.split(',')[1]!, 'base64').toString('utf8');
const res = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response;
const deps = (over: Partial<DocumentDeps> = {}): DocumentDeps => ({
  readText: async () => '', readDataUrl: async () => 'data:application/octet-stream;base64,AAAA', fetch: jest.fn(async () => res({ text: '' })) as unknown as typeof fetch, ...over,
});

test('a .txt is decoded in the browser — Georgian survives — and travels as text/plain', async () => {
  const out = await documentToText(file('note.txt', 'text/plain'), 'text', deps({ readText: async () => 'სცენარი: ღამის თბილისი 🎬' }));
  expect(out?.mimeType).toBe('text/plain');
  expect(decode(out!.dataUrl)).toBe('სცენარი: ღამის თბილისი 🎬');
  expect(out?.truncated).toBe(false);
});

test('a .docx goes through the extractor with its own MIME and comes back as text', async () => {
  const fetchMock = jest.fn(async () => res({ text: 'ხელშეკრულება №1' }));
  const out = await documentToText(file('deal.docx'), 'doc', deps({ fetch: fetchMock as unknown as typeof fetch }));
  expect(decode(out!.dataUrl)).toBe('ხელშეკრულება №1');
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/utils/extract-text');
  const body = JSON.parse(String(init.body)) as { mimeType: string; dataUrl: string };
  expect(body.mimeType).toContain('wordprocessingml');
  expect(body.dataUrl.startsWith('data:')).toBe(true);
});

test('an extractor that fails or finds nothing is "unreadable" (null), never an empty attachment', async () => {
  expect(await documentToText(file('a.docx'), 'doc', deps({ fetch: (async () => res({ text: '' })) as unknown as typeof fetch }))).toBeNull();
  expect(await documentToText(file('a.docx'), 'doc', deps({ fetch: (async () => res({}, false)) as unknown as typeof fetch }))).toBeNull();
  expect(await documentToText(file('a.txt'), 'text', deps({ readText: async () => '   \n ' }))).toBeNull();
});

test('a BOM and NULs are stripped; a long document is cut and says so', async () => {
  const out = await documentToText(file('a.txt'), 'text', deps({ readText: async () => `﻿hi\u0000 there` }));
  expect(decode(out!.dataUrl)).toBe('hi there');
  const long = await documentToText(file('big.txt'), 'text', deps({ readText: async () => 'word '.repeat(40_000) }));
  expect(long?.truncated).toBe(true);
  expect(decode(long!.dataUrl).length).toBeLessThanOrEqual(100_000);
});
