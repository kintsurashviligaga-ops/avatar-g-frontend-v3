import { MODEL_CATALOG } from '@/lib/models/catalog';
import { parseImageRequest, parseImagePlan, type ImagePlan } from './contracts';
import { imageModels, validateCapability } from './capabilities';
import { imagePayload } from './prompt';

export const request = () => ({
  v: 1 as const, operation: 'generate' as const, originalPrompt: '  თბილისი\nზაფხულში ☀️  ',
  instructions: [], references: [], modelId: 'gemini-3.1-flash-image',
  aspectRatio: '1:1' as const, resolution: '1K' as const, count: 1, locale: 'ka' as const,
});
const plan = (): ImagePlan => ({ v: 1, kind: 'image-studio-v1', request: request(), transport: 'vertex', references: [] });
test('keeps original Georgian whitespace and Unicode exactly; adds no style or translation', () => {
  const r = parseImageRequest(request());
  expect(r.originalPrompt).toBe(request().originalPrompt);
  expect(imagePayload({ ...plan(), request: r }, []).contents[0]?.parts).toEqual([
    { text: r.originalPrompt }, { text: 'Requested image operation: generate.' },
  ]);
});
test.each(['seed', 'negativePrompt', 'mask', 'credits', 'provider', 'referenceStrength'])('rejects unimplemented/client-controlled %s', key => {
  expect(() => parseImageRequest({ ...request(), [key]: 1 })).toThrow();
});
test('rejects excessive prompt rather than truncating', () => {
  expect(() => parseImageRequest({ ...request(), originalPrompt: 'a'.repeat(8001) })).toThrow();
});
test('rejects empty prompt, arbitrary URL and duplicate reference IDs', () => {
  expect(() => parseImageRequest({ ...request(), originalPrompt: '  ' })).toThrow();
  const ref = { id: 'a', role: 'face', asset: { kind: 'upload', path: 'https://example.com/a.png' } };
  expect(() => parseImageRequest({ ...request(), references: [ref] })).toThrow();
  ref.asset.path = 'omni-uploads/u/a.png';
  expect(() => parseImageRequest({ ...request(), references: [ref, ref] })).toThrow();
});
test.each(['edit', 'character_variation', 'product_scene'])('%s needs suitable source roles', operation => {
  expect(() => parseImageRequest({ ...request(), operation })).toThrow();
});
test('strict catalog refuses missing, unverified and disabled model instead of falling back', () => {
  expect(imageModels('vertex').map(x => x.id)).toEqual(['gemini-3.1-flash-image']);
  expect(() => validateCapability({ ...request(), modelId: 'imagen-4.0-generate-001' }, 'vertex')).toThrow();
  const catalog = { ...MODEL_CATALOG, entries: MODEL_CATALOG.entries.map(e => ({ ...e, enabled: false })) };
  expect(imageModels('vertex', catalog)).toEqual([]);
  expect(() => validateCapability({ ...request(), modelId: 'nb/auto' }, 'vertex')).toThrow();
});
test.each(['enhance', 'composite'])('does not advertise %s without an adapter', operation => {
  expect(() => validateCapability({ ...request(), operation } as ImagePlan['request'], 'vertex')).toThrow();
});
test('refuses multiple outputs until independently settled batch jobs exist', () => {
  expect(() => validateCapability({ ...request(), count: 4 }, 'vertex')).toThrow();
});
test('preserves two reference roles and order; catches missing, reordered or changed references', () => {
  const refs = ['face', 'clothing'].map((role, i) => ({
    id: 'r' + i, role, digest: 'a'.repeat(64), width: 1, height: 1, mime: 'image/png', bytes: 1,
  })) as ImagePlan['references'];
  const p = parseImagePlan({ ...plan(), references: refs, request: {
    ...request(), operation: 'edit', references: refs.map(r => ({ id: r.id, role: r.role, asset: { kind: 'upload', path: 'u/' + r.id + '.png' } })),
  } });
  const prepared = refs.map(r => ({ ...r, data: Buffer.from('x') }));
  expect(imagePayload(p, prepared).contents[0]?.parts[2]).toEqual({ text: 'Reference 1: id=r0; role=face.' });
  expect(() => imagePayload(p, prepared.slice().reverse())).toThrow();
  expect(() => imagePayload(p, [])).toThrow();
  expect(() => parseImagePlan({ ...p, references: refs.slice().reverse() })).toThrow();
});
