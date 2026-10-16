/** @jest-environment node */
import { invokeGoogleImage, IMAGE_TIMEOUT_MS } from './provider';
import { imagePayload } from './prompt';
import { imageRequest } from './testing';
import type { ImagePlan } from './contracts';
const plan = (): ImagePlan => ({ v: 1, kind: 'image-studio-v1', transport: 'vertex', request: imageRequest(), references: [] });
const response = (parts: unknown[]) => new Response(JSON.stringify({ responseId: 'google-response', candidates: [{ content: { parts } }] }));
test('one exact model/payload call and final image only (ignores thought images)', async () => {
  const p = plan(), fetch = jest.fn(async () => response([
    { thought: true, inlineData: { mimeType: 'image/png', data: 'eA==' } },
    { inlineData: { mimeType: 'image/png', data: 'YQ==' } },
  ]));
  const out = await invokeGoogleImage({ kind: 'vertex', fetch }, p, imagePayload(p, []), new AbortController().signal);
  expect(out.bytes.toString()).toBe('a');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0]![0].init.body as string).contents[0].parts[0].text).toBe(p.request.originalPrompt);
});
test.each([429, 403, 404, 500])('HTTP %s never falls back or retries', async status => {
  const p = plan(), fetch = jest.fn(async () => new Response('private upstream diagnostic', { status }));
  await expect(invokeGoogleImage({ kind: 'vertex', fetch }, p, imagePayload(p, []), new AbortController().signal)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
test.each([
  { promptFeedback: { blockReason: 'SAFETY' } },
  { candidates: [{ finishReason: 'IMAGE_SAFETY' }] },
])('safety rejection is explicit', async body => {
  const p = plan();
  await expect(invokeGoogleImage({ kind: 'vertex', fetch: async () => new Response(JSON.stringify(body)) }, p, imagePayload(p, []), new AbortController().signal))
    .rejects.toMatchObject({ code: 'prompt_safety' });
});
test('empty, multiple or malformed image is not a success', async () => {
  const p = plan();
  for (const parts of [[], [{ text: 'sorry' }], [{ inlineData: { mimeType: 'image/png', data: '!!invalid!!' } }],
    [{ inlineData: { data: 'YQ==' } }, { inlineData: { data: 'YQ==' } }]]) {
    await expect(invokeGoogleImage({ kind: 'vertex', fetch: async () => response(parts) }, p, imagePayload(p, []), new AbortController().signal)).rejects.toThrow();
  }
});
test('timeout preserves unknown remote outcome with one call and no dangling timer', async () => {
  jest.useFakeTimers();
  try {
    const p = plan(), fetch = jest.fn(async ({ init }: { init: RequestInit }) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const call = invokeGoogleImage({ kind: 'vertex', fetch }, p, imagePayload(p, []), new AbortController().signal);
    const assertion = expect(call).rejects.toMatchObject({ code: 'provider_timeout' });
    await jest.advanceTimersByTimeAsync(IMAGE_TIMEOUT_MS);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
test('transport change is rejected before fetch', async () => {
  const p = plan(), fetch = jest.fn();
  await expect(invokeGoogleImage({ kind: 'gemini_api', fetch }, p, imagePayload(p, []), new AbortController().signal)).rejects.toMatchObject({ code: 'not_configured' });
  expect(fetch).not.toHaveBeenCalled();
});
