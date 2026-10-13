import type { ImageOutput, ImagePlan } from './contracts';
import type { ImagePayload } from './prompt';
import { ImageError } from './errors';
import { readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';

export interface ImageProviderTransport {
  kind: 'vertex' | 'gemini_api';
  fetch(call: { model: string; method: 'generateContent'; init: RequestInit }): Promise<Response>;
}
export const IMAGE_TIMEOUT_MS = 240_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

/** One invocation only. A timeout never proves the remote inference stopped; the worker records dispatch first. */
export async function invokeGoogleImage(transport: ImageProviderTransport, plan: ImagePlan, payload: ImagePayload, signal: AbortSignal): Promise<ImageOutput> {
  if (transport.kind !== plan.transport) throw new ImageError('not_configured', 'The approved transport is no longer selected.', 503);
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) ctl.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, IMAGE_TIMEOUT_MS);
  try {
    if (ctl.signal.aborted) throw new ImageError('cancelled', 'The image request was cancelled.');
    const res = await transport.fetch({ model: plan.request.modelId, method: 'generateContent',
      init: { method: 'POST', body: JSON.stringify(payload), signal: ctl.signal } });
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      if (res.status === 429) throw new ImageError('provider_rate_limit', 'The model is at capacity. A new attempt requires confirmation.', 429);
      if (res.status === 401 || res.status === 403 || res.status === 404) throw new ImageError('not_configured', 'This model is unavailable for the configured project.', 503);
      throw new ImageError('provider_failed', 'The image provider rejected the request.', 502);
    }
    const data = await readBodyWithCap(res, MAX_RESPONSE_BYTES);
    if (!data) throw new ImageError('provider_failed', 'The provider response exceeded the image limit.', 502);
    let body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = JSON.parse(data.toString('utf8')); } catch { throw new ImageError('provider_failed', 'The provider response was invalid.', 502); }
    if (body.promptFeedback?.blockReason) throw new ImageError('prompt_safety', 'The provider declined this image request.');
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    if (candidates.some(c => ['SAFETY', 'IMAGE_SAFETY', 'PROHIBITED_CONTENT'].includes(c.finishReason))) {
      throw new ImageError('prompt_safety', 'The provider declined this image request.');
    }
    const parts = candidates.flatMap(c => Array.isArray(c.content?.parts) ? c.content.parts : []);
    // Thought images are intermediate reasoning, not the user's deliverable.
    const images = parts.filter(p => !p.thought && p.inlineData);
    if (images.length !== 1) throw new ImageError('provider_failed', 'The provider did not return exactly one final image.', 502);
    const image = images[0].inlineData;
    if (typeof image.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data) ||
      typeof image.mimeType !== 'string') throw new ImageError('provider_failed', 'The provider image encoding is invalid.', 502);
    const usage = body.usageMetadata && typeof body.usageMetadata === 'object'
      ? Object.fromEntries(Object.entries(body.usageMetadata).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])))
      : null;
    return { bytes: Buffer.from(image.data, 'base64'), mime: image.mimeType,
      providerRequestId: typeof body.responseId === 'string' ? body.responseId : null, usage };
  } catch (e) {
    if (timedOut) throw new ImageError('provider_timeout', 'The provider timed out; its remote completion is unknown.', 504);
    if (signal.aborted) throw new ImageError('cancelled', 'The local request was stopped; remote processing may continue.');
    if (e instanceof ImageError) throw e;
    throw new ImageError('provider_outcome_unknown', 'The provider connection ended without a confirmed result.', 502);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}
