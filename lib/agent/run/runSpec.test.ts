/** @jest-environment node */
/**
 * A run spec is checked field by field before anything runs (PART 2, T1): known tools only, a reference only to an
 * earlier step (so there is never a cycle), bounded sizes, and nothing unchecked carried along.
 */
import { MAX_RUN_STEPS, refsOf, specFingerprint, validateRunSpec, type RunSpec } from './runSpec';

const VIDEO = 'omni-uploads/user-a/concert.mp4';
const CLIPS = ['omni-uploads/user-a/a.mp4', 'omni-uploads/user-a/b.mp4'];
const CHAIN = {
  title: 'Clip to the concert sound',
  steps: [
    { id: 'sound', tool: 'audio_extract', source: { file: VIDEO } },
    { id: 'clip', tool: 'montage', files: [...CLIPS, { step: 'sound' }], prompt: '20 seconds, 9:16', aspect: '9:16' },
  ],
};

test('the Master Task chain (sound out of one video, clips cut to it) is a valid run, rebuilt from what was checked', () => {
  const r = validateRunSpec({ ...CHAIN, extra: 'dropped' });
  expect(r).toEqual({ ok: true, spec: CHAIN });
  if (r.ok) expect(refsOf(r.spec.steps[1]!)).toEqual(['sound']);
});

test('a reference must name an EARLIER step: a later one, itself or an unknown one is refused (no cycles)', () => {
  const later = { steps: [{ id: 'clip', tool: 'montage', files: [...CLIPS, { step: 'sound' }] }, { id: 'sound', tool: 'audio_extract', source: { file: VIDEO } }] };
  expect(validateRunSpec(later)).toMatchObject({ ok: false, error: 'bad_spec', step: 'clip' });
  const self = { steps: [{ id: 'clip', tool: 'montage', files: [...CLIPS, { step: 'clip' }] }] };
  expect(validateRunSpec(self)).toMatchObject({ ok: false, step: 'clip' });
  const extraKey = { steps: [{ id: 's', tool: 'audio_extract', source: { file: VIDEO } }, { id: 'c', tool: 'montage', files: [...CLIPS, { step: 's', x: 1 }] }] };
  expect(validateRunSpec(extraKey)).toMatchObject({ ok: false, step: 'c' });
});

test('unknown tools, duplicate or malformed ids, empty or oversized runs are refused', () => {
  expect(validateRunSpec({ steps: [] })).toMatchObject({ ok: false });
  expect(validateRunSpec({})).toMatchObject({ ok: false });
  expect(validateRunSpec(null)).toMatchObject({ ok: false });
  expect(validateRunSpec({ steps: [{ id: 'x', tool: 'shell', cmd: 'rm -rf /' }] })).toMatchObject({ ok: false, step: 'x' });
  expect(validateRunSpec({ steps: [{ id: 'Bad Id', tool: 'audio_extract', source: { file: VIDEO } }] })).toMatchObject({ ok: false });
  const dup = { steps: [{ id: 'a', tool: 'audio_extract', source: { file: VIDEO } }, { id: 'a', tool: 'audio_extract', source: { file: VIDEO } }] };
  expect(validateRunSpec(dup)).toMatchObject({ ok: false, step: 'a' });
  const many = { steps: Array.from({ length: MAX_RUN_STEPS + 1 }, (_, i) => ({ id: `s${i}`, tool: 'audio_extract', source: { file: VIDEO } })) };
  expect(validateRunSpec(many)).toMatchObject({ ok: false });
});

test('an extraction takes exactly one source: a link (http/https) or a file', () => {
  expect(validateRunSpec({ steps: [{ id: 'a', tool: 'audio_extract', source: { url: 'https://example.com/v.mp4' } }] })).toMatchObject({ ok: true });
  expect(validateRunSpec({ steps: [{ id: 'a', tool: 'audio_extract', source: { url: 'file:///etc/passwd' } }] })).toMatchObject({ ok: false });
  expect(validateRunSpec({ steps: [{ id: 'a', tool: 'audio_extract', source: { url: 'https://e.com/v', file: VIDEO } }] })).toMatchObject({ ok: false });
  expect(validateRunSpec({ steps: [{ id: 'a', tool: 'audio_extract', source: {} }] })).toMatchObject({ ok: false });
});

test('a montage takes 2 to 13 files and only the frames, lengths and music starts it knows', () => {
  const m = (extra: Record<string, unknown>) => validateRunSpec({ steps: [{ id: 'm', tool: 'montage', files: CLIPS, ...extra }] });
  expect(m({})).toMatchObject({ ok: true });
  expect(m({ files: [CLIPS[0]] })).toMatchObject({ ok: false });
  expect(m({ files: Array(14).fill(CLIPS[0]) })).toMatchObject({ ok: false });
  expect(m({ aspect: '4:3' })).toMatchObject({ ok: false });
  expect(m({ targetSec: -1 })).toMatchObject({ ok: false });
  expect(m({ musicFromSec: 'five' })).toMatchObject({ ok: false });
  expect(m({ targetSec: 20, musicFromSec: 5 })).toEqual({ ok: true, spec: { steps: [{ id: 'm', tool: 'montage', files: CLIPS, targetSec: 20, musicFromSec: 5 }] } });
});

test('the plan fingerprint is the spec: any change is a different plan, and it can never equal a single job quote', () => {
  const a = validateRunSpec(CHAIN);
  const b = validateRunSpec({ ...CHAIN, title: 'Another title' });
  if (!a.ok || !b.ok) throw new Error('valid');
  expect(specFingerprint(a.spec)).toBe(specFingerprint(JSON.parse(JSON.stringify(a.spec)) as RunSpec));
  expect(specFingerprint(a.spec)).not.toBe(specFingerprint(b.spec));
  expect(specFingerprint(a.spec)).toMatch(/^run:/);
});

test('an edit step takes one video (a file or an earlier step) and only the edits Agent G knows, typed', () => {
  const e = (extra: Record<string, unknown>) => validateRunSpec({ steps: [{ id: 'e', tool: 'edit', file: VIDEO, edits: [{ op: 'trim', toSec: 10 }], ...extra }] });
  expect(e({})).toEqual({ ok: true, spec: { steps: [{ id: 'e', tool: 'edit', file: VIDEO, edits: [{ op: 'trim', toSec: 10 }] }] } });
  expect(e({ edits: [] })).toMatchObject({ ok: false, step: 'e' });
  expect(e({ edits: Array(10).fill({ op: 'mute' }) })).toMatchObject({ ok: false });
  expect(e({ edits: [{ op: 'shell', cmd: 'rm -rf /' }] })).toMatchObject({ ok: false });
  expect(e({ edits: [{ op: 'trim', toSec: '10' }] })).toMatchObject({ ok: false });
  expect(e({ edits: [{ op: 'trim', toSec: 10, filter: 'movie=/etc/passwd' }] })).toMatchObject({ ok: false });
  expect(e({ edits: [{ op: 'caption', text: 'x'.repeat(201) }] })).toMatchObject({ ok: false });
  expect(e({ file: { step: 'later' } })).toMatchObject({ ok: false });
  expect(e({ name: '' })).toMatchObject({ ok: false });
  const chain = validateRunSpec({ steps: [CHAIN.steps[0], CHAIN.steps[1], { id: 'cut', tool: 'edit', file: { step: 'clip' }, edits: [{ op: 'aspect', to: '9:16', fit: 'pad' }, { op: 'mute' }] }] });
  expect(chain).toMatchObject({ ok: true });
  if (chain.ok) expect(refsOf(chain.spec.steps[2]!)).toEqual(['clip']);
});
