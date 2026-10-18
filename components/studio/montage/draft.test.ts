/**
 * The montage edit kept on this device (draft.ts): what is saved, what is refused on the way back, and what a reload
 * restores once the media has been signed again.
 */
import {
  DRAFT_KEY, DRAFT_MAX_AGE_MS, draftOf, loadDraft, parseDraft, resignDraftRefs, restoreDraft, saveDraft, storableRef,
  type MontageDraft,
} from './draft';
import { emptyEdit, type Clip, type Edit, type MediaSource } from './project';

const NOW = 1_800_000_000_000;

const clip = (id: string, sourceId: string, extra: Partial<Clip> = {}): Clip => ({
  id, sourceId, startSec: 0, endSec: 3, muted: false, transition: 'cut', caption: '', captionPos: 'bottom', ...extra,
});
const src = (id: string, kind: MediaSource['kind'], ref: string | null, status: MediaSource['status'] = 'ready'): MediaSource => ({
  id, kind, name: `${id}.file`, previewUrl: `blob:${id}`, ref, status, durationSec: kind === 'audio' ? 20 : 6,
});

const sources: Record<string, MediaSource> = {
  s1: src('s1', 'video', 'u1/1-a.mp4'),
  s2: src('s2', 'image', 'https://p.supabase.co/storage/v1/object/sign/library/u1/b.jpg?token=secret#frag'),
  s3: src('s3', 'video', null, 'uploading'),
  m1: src('m1', 'audio', 'u1/2-song.mp3'),
};
const edit: Edit = {
  ...emptyEdit('16:9'),
  clips: [clip('c1', 's1', { caption: 'ზაფხული', transition: 'fade' }), clip('c2', 's2', { captionPos: 'center' }), clip('c3', 's3')],
  musicId: 'm1',
  musicStartSec: 8.5,
  originalSound: false,
  filterId: 'warm',
};

describe('draftOf — what is kept', () => {
  it('keeps the edit and its ready media by reference; a file still uploading is left out with its clip', () => {
    const d = draftOf(edit, sources, NOW)!;
    expect(d.v).toBe(1);
    expect(d.savedAt).toBe(NOW);
    expect(d.edit.clips.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(d.edit).toMatchObject({ aspect: '16:9', musicId: 'm1', musicStartSec: 8.5, originalSound: false, filterId: 'warm' });
    expect(d.sources.map((s) => s.id)).toEqual(['s1', 's2', 'm1']);
  });

  it('never keeps a signing token: a Library URL is stored without its query', () => {
    const d = draftOf(edit, sources, NOW)!;
    expect(d.sources.find((s) => s.id === 's2')!.ref).toBe('https://p.supabase.co/storage/v1/object/sign/library/u1/b.jpg');
    expect(JSON.stringify(d)).not.toContain('secret');
    expect(JSON.stringify(d)).not.toContain('blob:');
    expect(storableRef('u1/1-a.mp4')).toBe('u1/1-a.mp4');
  });

  it('is null when nothing could come back (an empty edit, or only uploads in flight)', () => {
    expect(draftOf(emptyEdit(), {}, NOW)).toBeNull();
    expect(draftOf({ ...emptyEdit(), clips: [clip('c3', 's3')] }, sources, NOW)).toBeNull();
  });

  it('a song that has not uploaded is dropped with its start', () => {
    const d = draftOf({ ...edit, musicId: 'm2' }, { ...sources, m2: src('m2', 'audio', null, 'uploading') }, NOW)!;
    expect(d.edit.musicId).toBeNull();
    expect(d.edit.musicStartSec).toBe(0);
  });
});

describe('parseDraft — what is refused on the way back', () => {
  const good = () => draftOf(edit, sources, NOW)!;

  it('reads back what was saved', () => {
    expect(parseDraft(JSON.stringify(good()), NOW + 1000)).toEqual(good());
  });

  it.each([
    ['missing', null],
    ['not JSON', '{nope'],
    ['another version', JSON.stringify({ ...good(), v: 2 })],
    ['older than a week', JSON.stringify({ ...good(), savedAt: NOW - DRAFT_MAX_AGE_MS - 1 })],
    ['from the future', JSON.stringify({ ...good(), savedAt: NOW + 3_600_000 })],
    ['a bad format', JSON.stringify({ ...good(), edit: { ...good().edit, aspect: '2:1' } })],
    ['a malformed clip', JSON.stringify({ ...good(), edit: { ...good().edit, clips: [{ ...good().edit.clips[0], endSec: -1 }] } })],
    ['an unknown transition', JSON.stringify({ ...good(), edit: { ...good().edit, clips: [{ ...good().edit.clips[0], transition: 'explode' }] } })],
    ['no media', JSON.stringify({ ...good(), sources: [] })],
  ])('%s → null', (_why, raw) => {
    expect(parseDraft(raw as string | null, NOW)).toBeNull();
  });

  it('drops clips whose media entry is unusable, and fills a damaged look with the neutral one', () => {
    const d = good();
    const raw = JSON.stringify({
      ...d,
      sources: d.sources.map((s) => (s.id === 's2' ? { ...s, ref: '' } : s)),
      edit: { ...d.edit, grade: { saturation: 'x' } },
    });
    const back = parseDraft(raw, NOW)!;
    expect(back.edit.clips.map((c) => c.id)).toEqual(['c1']);
    expect(back.edit.grade).toEqual({ saturation: 100, contrast: 100, brightness: 100, temperature: 0 });
  });
});

describe('restoreDraft — the edit again, with fresh URLs', () => {
  const d: MontageDraft = draftOf(edit, sources, NOW)!;
  const libRef = 'https://p.supabase.co/storage/v1/object/sign/library/u1/b.jpg';

  it('everything signs: the same edit, uploads keep their path, Library items take the new URL', () => {
    const back = restoreDraft(d, {
      'u1/1-a.mp4': 'https://signed/a?token=1',
      [libRef]: 'https://signed/b?token=2',
      'u1/2-song.mp3': 'https://signed/song?token=3',
    });
    expect(back.dropped).toBe(0);
    expect(back.edit).toEqual(d.edit);
    expect(back.sources.s1).toMatchObject({ previewUrl: 'https://signed/a?token=1', ref: 'u1/1-a.mp4', status: 'ready' });
    expect(back.sources.s2).toMatchObject({ previewUrl: 'https://signed/b?token=2', ref: 'https://signed/b?token=2' });
    expect(back.sources.m1).toMatchObject({ ref: 'u1/2-song.mp3', durationSec: 20 });
  });

  it('a source that no longer signs drops its clips and the song, and says how many', () => {
    const back = restoreDraft(d, { 'u1/1-a.mp4': 'https://signed/a', [libRef]: null, 'u1/2-song.mp3': null });
    expect(back.edit.clips.map((c) => c.id)).toEqual(['c1']);
    expect(back.edit.musicId).toBeNull();
    expect(back.edit.musicStartSec).toBe(0);
    expect(back.dropped).toBe(2);
    expect(Object.keys(back.sources)).toEqual(['s1']);
  });
});

describe('this device and the route', () => {
  beforeEach(() => window.localStorage.clear());

  it('save → load round-trips; saving null forgets it', () => {
    const d = draftOf(edit, sources)!;
    saveDraft(d);
    expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    expect(loadDraft()).toEqual(d);
    saveDraft(null);
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(loadDraft()).toBeNull();
  });

  it('blocked storage never throws: no draft, nothing kept', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    try {
      expect(loadDraft()).toBeNull();
      expect(() => saveDraft(draftOf(edit, sources))).not.toThrow();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('resignDraftRefs maps each ref to its URL, and answers null when the route cannot', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ urls: ['https://signed/a', null] }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await resignDraftRefs(['u1/a.mp4', 'u2/b.mp4'])).toEqual({ 'u1/a.mp4': 'https://signed/a', 'u2/b.mp4': null });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/upload/resign');
    expect(JSON.parse(String(init.body))).toEqual({ refs: ['u1/a.mp4', 'u2/b.mp4'] });

    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await resignDraftRefs(['u1/a.mp4'])).toBeNull();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ urls: [] }) })) as unknown as typeof fetch;
    expect(await resignDraftRefs(['u1/a.mp4'])).toBeNull();
    global.fetch = jest.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    expect(await resignDraftRefs(['u1/a.mp4'])).toBeNull();
  });
});
