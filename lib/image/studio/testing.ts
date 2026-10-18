import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { memoryLeaseStore } from '@/lib/orchestrator/testing/memoryLeaseStore';
import type { ImageDeps } from './engine';
import type { ImageRequest, SavedImage } from './contracts';
import { prepareReference } from './quality';

export const imageRequest = (): ImageRequest => ({
  v: 1, operation: 'generate', originalPrompt: '  თბილისი ღამით\n  ', instructions: [], references: [],
  modelId: 'gemini-3.1-flash-image', aspectRatio: '1:1', resolution: '1K', count: 1, locale: 'ka',
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function fakeImage() {
  const clock = { now: 1_000_000 };
  const store = memoryLeaseStore(() => clock.now);
  const png = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#338fe8' } }).png().toBuffer();
  const ticks = new Set<() => Promise<void>>();
  const ledger = new Map<string, number>();
  const outputs = new Map<string, SavedImage>();
  const deps: ImageDeps = {
    store, transport: 'vertex', key: () => 'test-image-quote-secret', now: () => clock.now, newId: randomUUID,
    assertConfigured: jest.fn(),
    prepare: jest.fn((ref) => prepareReference(ref, png, 'image/png')),
    checkParent: jest.fn(async () => true),
    admit: jest.fn(async () => true),
    releaseAdmission: jest.fn(async () => undefined),
    reserve: jest.fn(async (_uid, credits, ref) => {
      if (ledger.has(ref)) return { charged: false, reason: 'replay' };
      ledger.set(ref, credits); return { charged: true, reason: 'ok' };
    }),
    refund: jest.fn(async (_uid, ref) => {
      const n = ledger.get(ref) ?? 0;
      if (!n) return 'nothing';
      ledger.set(ref, 0); return 'refunded';
    }),
    persistPayload: jest.fn(async id => id + '/provider-request.json'),
    generate: jest.fn(async () => ({ bytes: png, mime: 'image/png', providerRequestId: 'test-response', usage: { candidatesTokenCount: 1200 } })),
    save: jest.fn(async (id, uid, image) => {
      const saved: SavedImage = { path: 'image-studio/' + uid + '/' + id + '/result.png', url: 'https://private.example/' + id,
        bytes: image.bytes, width: image.width, height: image.height, mime: image.mime, digest: image.digest };
      outputs.set(id, saved); return saved;
    }),
    recover: jest.fn(async id => outputs.get(id) ?? null),
    resign: jest.fn(async image => ({ ...image, url: image.url + '?fresh=1' })),
    every: (_ms, tick) => { ticks.add(tick); return () => { ticks.delete(tick); }; },
    audit: jest.fn(async () => undefined),
  };
  return { deps, store, clock, png, ledger, outputs, ticks, net: () => [...ledger.values()].reduce((a, b) => a + b, 0) };
}
