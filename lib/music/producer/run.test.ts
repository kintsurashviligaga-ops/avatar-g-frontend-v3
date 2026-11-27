/** @jest-environment node */
import { runProducer, shiftLines, type ProducerRunDeps } from './run';
import { parseProducerRequest, restyleSpec } from './request';
import { ProducerError } from './errors';
import { DEFAULT_SPEC, type ProducerSpec } from './spec';
import type { ProducerMeta } from './library';
import { planExtend } from './extend';
import { singsGeorgian, producerBook } from './book';

const AUDIO = Buffer.from('mp3-bytes').toString('base64');
const SUNG: ProducerSpec = { ...DEFAULT_SPEC, brief: 'a love song', genre: 'pop', moods: ['romantic'], vocals: true, autoLyrics: false, lyrics: '[Verse]\nline one\nline two\n[Chorus]\nla la la', bpm: 120, lengthSec: 30 };

function deps(over: Partial<ProducerRunDeps> = {}, recipes: Record<string, ProducerMeta> = {}) {
  let n = 0;
  const calls = { inputs: [] as Array<[string, string]>, charges: [] as Array<[number, string]>, refunds: [] as Array<[number, string]>, holds: [] as number[], joined: 0, saved: [] as string[] };
  const d: ProducerRunDeps = {
    loadRecipe: async (_u, id) => recipes[id] ?? null,
    loadAudio: async () => Buffer.from('parent'),
    generate: async (input, model) => { calls.inputs.push([input, model]); return { base64: AUDIO, mime: 'audio/mpeg', caption: 'A song.\n[Verse]\nnew words here\n[Chorus]\noh oh' }; },
    join: async (a, b) => { calls.joined++; return Buffer.concat([a, b]); },
    measure: async (b) => (b.toString().startsWith('parent') ? 58.5 : 30.2),
    hold: async (_u, c) => { calls.holds.push(c); return true; },
    charge: async (_u, c, ref) => { calls.charges.push([c, ref]); return true; },
    refund: async (_u, c, ref) => { calls.refunds.push([c, ref]); },
    save: async (u, id) => { calls.saved.push(id); return { path: `music-producer/${u}/${id}.mp3`, url: `https://x/${id}` }; },
    record: async () => undefined,
    newId: () => `id-00000${++n}`,
    now: () => new Date('2026-11-15T07:00:00Z'),
    ...over,
  };
  return { d, calls };
}

const parentMeta = (over: Partial<ProducerMeta> = {}): ProducerMeta => ({
  v: 1, kind: 'music-producer', id: 'parent-0001', action: 'generate', spec: SUNG, model: 'lyria-3-clip-preview', input: 'x',
  lyrics: '[Verse]\nline one', lines: [{ text: 'line one', start: 2, end: 10, section: 'Verse' }, { text: 'tail', start: 29, end: 30, section: 'Outro' }],
  timeline: [], durationSec: 30, bpm: 120, part: 0, parentId: null, credits: 6, book: 'v8',
  audioPath: 'music-producer/u1/parent-0001.mp3', mime: 'audio/mpeg', createdAt: '2026-11-15T06:00:00Z', ...over,
});

describe('runProducer — generate', () => {
  it('one Clip call, charged once AFTER the track arrived, lyrics synced to the measured length', async () => {
    const { d, calls } = deps();
    const r = await runProducer(d, 'u1', { action: 'generate', spec: SUNG }, 6, 'v8');
    expect(calls.inputs).toHaveLength(1);
    expect(calls.inputs[0]?.[1]).toBe('lyria-3-clip-preview');
    expect(calls.inputs[0]?.[0]).toContain('Tempo: 120 BPM');
    expect(calls.inputs[0]?.[0]).toContain('Lyrics:\n[Verse]');
    expect(calls.charges).toEqual([[6, 'music-producer:id-000001']]);
    expect(calls.refunds).toEqual([]);
    expect(r.meta.durationSec).toBe(30.2);
    expect(r.meta.lines.map((l) => l.text)).toEqual(['line one', 'line two', 'la la la']);
    expect(r.meta.lines.every((l) => l.end <= 30.2)).toBe(true);
    expect(r.meta.audioPath).toBe('music-producer/u1/id-000001.mp3');
  });
  it('1 min goes to Pro with the timed sections', async () => {
    const { d, calls } = deps();
    await runProducer(d, 'u1', { action: 'generate', spec: { ...SUNG, lengthSec: 60 } }, 11, 'v8');
    expect(calls.inputs[0]?.[1]).toBe('lyria-3-pro-preview');
    expect(calls.inputs[0]?.[0]).toMatch(/Create a 1:00-long track/);
    expect(calls.inputs[0]?.[0]).toMatch(/\[0:00 - 0:0\d\]/);
  });
  it('auto lyrics: keeps what Lyria sang (from its caption)', async () => {
    const { d } = deps();
    const r = await runProducer(d, 'u1', { action: 'generate', spec: { ...SUNG, autoLyrics: true, lyrics: '' } }, 6, 'v8');
    expect(r.meta.lyrics).toBe('[Verse]\nnew words here\n[Chorus]\noh oh');
    expect(r.meta.lines.map((l) => l.text)).toEqual(['new words here', 'oh oh']);
  });
  it('a Lyria miss is never charged', async () => {
    const { d, calls } = deps({ generate: async () => null });
    await expect(runProducer(d, 'u1', { action: 'generate', spec: SUNG }, 6, 'v8')).rejects.toMatchObject({ code: 'provider_unavailable', status: 502 });
    expect(calls.charges).toEqual([]);
  });
  it('too few credits: refused before the provider is called', async () => {
    const { d, calls } = deps({ hold: async () => false });
    await expect(runProducer(d, 'u1', { action: 'generate', spec: SUNG }, 6, 'v8')).rejects.toMatchObject({ code: 'insufficient_credits', status: 402 });
    expect(calls.inputs).toEqual([]);
  });
  it('a save miss refunds the charge', async () => {
    const { d, calls } = deps({ save: async () => { throw new Error('bucket down'); } });
    await expect(runProducer(d, 'u1', { action: 'generate', spec: SUNG }, 6, 'v8')).rejects.toMatchObject({ code: 'not_configured' });
    expect(calls.charges).toHaveLength(1);
    expect(calls.refunds).toEqual([[6, 'music-producer:id-000001:refund']]);
  });
});

describe('runProducer — "Add 30 s (new section, same style)"', () => {
  it('a new Clip in the same style, joined on a bar, new lines shifted after the cut', async () => {
    const { d, calls } = deps({}, { 'parent-0001': parentMeta() });
    const r = await runProducer(d, 'u1', { action: 'extend', parentId: 'parent-0001' }, 6, 'v8');
    const plan = planExtend(30, 120);
    if (!plan.ok) throw new Error('plan');
    expect(calls.inputs[0]?.[1]).toBe('lyria-3-clip-preview');
    expect(calls.inputs[0]?.[0]).toContain('Tempo: 120 BPM');
    expect(calls.inputs[0]?.[0]).toMatch(/continuation|continue/i);
    expect(calls.joined).toBe(1);
    expect(r.meta.part).toBe(1);
    expect(r.meta.parentId).toBe('parent-0001');
    expect(r.meta.durationSec).toBe(58.5);
    // The parent's line inside the cut stays; its tail after the cut is gone; the new part starts at cut - crossfade.
    expect(r.meta.lines[0]?.text).toBe('line one');
    expect(r.meta.lines.some((l) => l.text === 'tail')).toBe(false);
    const first = r.meta.lines.find((l) => l.text === 'new words here');
    expect(first && first.start).toBeGreaterThanOrEqual(plan.plan.cutAtSec - plan.plan.crossfadeSec);
    expect(calls.charges).toEqual([[6, 'music-producer:id-000001']]);
  });
  it('a join failure is not charged', async () => {
    const { d, calls } = deps({ join: async () => { throw new Error('ffmpeg'); } }, { 'parent-0001': parentMeta() });
    await expect(runProducer(d, 'u1', { action: 'extend', parentId: 'parent-0001' }, 6, 'v8')).rejects.toMatchObject({ code: 'join_failed' });
    expect(calls.charges).toEqual([]);
  });
  it('refuses past 8 minutes and for someone else\'s track', async () => {
    const { d } = deps({}, { 'parent-0001': parentMeta({ durationSec: 470 }) });
    await expect(runProducer(d, 'u1', { action: 'extend', parentId: 'parent-0001' }, 6, 'v8')).rejects.toMatchObject({ code: 'too_long' });
    await expect(runProducer(d, 'u1', { action: 'extend', parentId: 'other-0001' }, 6, 'v8')).rejects.toBeInstanceOf(ProducerError);
  });
  it('shiftLines moves every line by the offset', () => {
    expect(shiftLines([{ text: 'a', start: 1, end: 2, section: 'Verse' }], 26.5)).toEqual([{ text: 'a', start: 27.5, end: 28.5, section: 'Verse' }]);
  });
});

describe('runProducer — "Restyle (new take)"', () => {
  it('keeps lyrics, tempo and length; changes only the style', async () => {
    const { d, calls } = deps({}, { 'parent-0001': parentMeta({ lyrics: '[Verse]\nline one\nline two', spec: { ...SUNG, autoLyrics: true, lyrics: '' } }) });
    const r = await runProducer(d, 'u1', { action: 'restyle', parentId: 'parent-0001', style: { genre: 'jazz', moods: ['calm'] } }, 6, 'v8');
    expect(r.meta.spec.genre).toBe('jazz');
    expect(r.meta.spec.bpm).toBe(120);
    expect(r.meta.spec.lyrics).toBe('[Verse]\nline one\nline two');
    expect(r.meta.spec.autoLyrics).toBe(false);
    expect(calls.inputs[0]?.[0]).toContain('Lyrics:\n[Verse]\nline one');
    expect(calls.inputs[0]?.[0]).toMatch(/jazz/i);
  });
  it('restyleSpec of an instrumental stays instrumental', () => {
    const s = restyleSpec({ ...DEFAULT_SPEC, genre: 'pop', vocals: false }, '', { genre: 'rock' });
    expect(s).toMatchObject({ genre: 'rock', vocals: false, lyrics: '', autoLyrics: false });
  });
});

describe('parseProducerRequest', () => {
  it('checks the action and ids', () => {
    expect(parseProducerRequest({ action: 'generate', spec: SUNG }).ok).toBe(true);
    expect(parseProducerRequest({ action: 'extend', parentId: 'abc' }).ok).toBe(false);
    expect(parseProducerRequest({ action: 'extend', parentId: 'parent-0001' })).toEqual({ ok: true, request: { action: 'extend', parentId: 'parent-0001' } });
    expect(parseProducerRequest({ action: 'stems', parentId: 'parent-0001' }).ok).toBe(false);
    expect(parseProducerRequest({ action: 'restyle', parentId: 'parent-0001', style: { moods: ['a', 'b', 'c'] } }).ok).toBe(false);
  });
});

describe('book + Georgian beta', () => {
  it('v8 only when NEXT_PUBLIC_PRICING_V8 is on', () => {
    expect(producerBook(undefined)).toBe('today');
    expect(producerBook('on')).toBe('v8');
  });
  it('Georgian beta: chosen, or Georgian script with language auto', () => {
    expect(singsGeorgian({ vocals: true, brief: '', lyrics: '', language: 'ka' })).toBe(true);
    expect(singsGeorgian({ vocals: true, brief: 'სიყვარულის სიმღერა', lyrics: '' })).toBe(true);
    expect(singsGeorgian({ vocals: true, brief: 'სიყვარული', lyrics: '', language: 'en' })).toBe(false);
    expect(singsGeorgian({ vocals: false, brief: 'სიყვარული', lyrics: '' })).toBe(false);
  });
});
