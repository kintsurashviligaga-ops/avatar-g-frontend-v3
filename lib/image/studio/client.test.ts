import { readBatch, saveBatch } from './client';
const quote = () => ({ jobId: 'one', token: 'signed', credits: 2, expiresAt: Date.now() + 60000,
  supplementaryInstructions: ['Requested image operation: generate.'],
  plan: { v: 1, kind: 'image-studio-v1', transport: 'vertex', references: [],
    request: { v: 1, operation: 'generate', originalPrompt: ' თბილისი ', instructions: [], references: [],
      modelId: 'gemini-3.1-flash-image', aspectRatio: '1:1', resolution: '1K', count: 1, locale: 'ka' } } });
beforeEach(() => sessionStorage.clear());
test('tab recovery omits signed URLs, revalidates the plan and never reads another account', () => {
  const batch = [{ quote: quote(), issued: true, job: { result: { url: 'https://private/signed-secret' } } }] as never;
  expect(saveBatch('owner', batch)).toBe(true);
  expect(sessionStorage.getItem('image-studio:v1:owner')).not.toContain('signed-secret');
  expect(readBatch('owner')).toHaveLength(1);
  expect(readBatch('stranger')).toEqual([]);
});
test.each([null, {}, { kind: 'image-studio-v1' }, { ...quote().plan, request: { ...quote().plan.request, references: 'broken' } }])(
  'incomplete or corrupt persisted plans cannot crash the workspace: %p', plan => {
    sessionStorage.setItem('image-studio:v1:owner', JSON.stringify([{ quote: { ...quote(), plan }, issued: true }]));
    expect(readBatch('owner')).toEqual([]);
});
test('valid pending jobs survive an expired quote; duplicate IDs and client-supplied results do not restore', () => {
  const q = { ...quote(), expiresAt: 1 };
  sessionStorage.setItem('image-studio:v1:owner', JSON.stringify([
    { quote: q, issued: true, job: { result: { url: 'https://untrusted.test' } } },
    { quote: q, issued: true },
  ]));
  expect(readBatch('owner')).toEqual([{ quote: q, issued: true }]);
});
test('invalid JSON, excessive batches and nonnumeric credits are rejected', () => {
  for (const value of ['{', JSON.stringify(Array(5).fill({ quote: quote(), issued: true })),
    JSON.stringify([{ quote: { ...quote(), credits: 'free' }, issued: false }])]) {
    sessionStorage.setItem('image-studio:v1:owner', value);
    expect(readBatch('owner')).toEqual([]);
  }
});
