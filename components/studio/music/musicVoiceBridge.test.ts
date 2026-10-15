import type { MusicRequest } from '@/lib/music/studio/contracts';
import {
  handleMusicVoice, joinNewestTracks, newestTracks, PLAN_DEDUPE_MS, registerMusicCard, resetMusicVoiceForTests, type MusicCardSnapshot,
} from './musicVoiceBridge';

function fakeCard(id: string, over: Partial<MusicCardSnapshot> = {}) {
  const calls = { cancel: 0, edits: [] as string[], versions: [] as string[], downloads: 0 };
  const snap: MusicCardSnapshot = { draftId: id, phase: 'completed', prompt: `p ${id}`, mode: 'instrumental', tracks: [], busy: false, ...over };
  const off = registerMusicCard({
    draftId: id,
    snapshot: () => snap,
    cancel: async () => { calls.cancel += 1; return true; },
    edit: async (t) => { calls.edits.push(t); return { ok: true }; },
    addVersion: (v) => { calls.versions.push(v.jobId); snap.tracks.push(v); },
    download: () => { calls.downloads += 1; return true; },
  });
  return { calls, snap, off };
}

const track = (jobId: string, sec = 30) => ({ jobId, url: `https://x/${jobId}`, durationSec: sec, label: jobId });

describe('musicVoiceBridge — Music Studio by voice never spends', () => {
  beforeEach(() => resetMusicVoiceForTests());

  it('plan only adds a draft card (the server prices it); a repeated identical call within the window adds no second card', () => {
    const drafts: MusicRequest[] = [];
    let t = 1_000;
    const ctx = { locale: 'en' as const, now: () => t, addDraft: (r: MusicRequest) => { drafts.push(r); const id = `d${drafts.length}`; fakeCard(id, { phase: 'pricing' }); return id; } };
    const r = handleMusicVoice({ action: 'plan', prompt: 'calm piano', tempo: 'slow', genre: 'jazz' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/only by tapping Create/);
    expect(drafts).toEqual([{ v: 1, prompt: 'calm piano', mode: 'instrumental', genre: 'jazz', tempo: 'slow', modelId: 'lyria-3-clip-preview', durationSec: 30, locale: 'en' }]);
    expect(handleMusicVoice({ action: 'plan', prompt: 'calm piano', tempo: 'slow', genre: 'jazz' }, ctx).message).toMatch(/already on screen/);
    expect(drafts).toHaveLength(1);
    t += PLAN_DEDUPE_MS + 1;
    handleMusicVoice({ action: 'plan', prompt: 'calm piano', tempo: 'slow', genre: 'jazz' }, ctx);
    expect(drafts).toHaveLength(2);
    // A change of genre / mood / tempo is a new plan (a new quote), never a silent change of a priced one.
    handleMusicVoice({ action: 'plan', prompt: 'calm piano', tempo: 'fast', genre: 'jazz' }, ctx);
    expect(drafts).toHaveLength(3);
    expect(handleMusicVoice({ action: 'plan', prompt: '  ' }, ctx)).toMatchObject({ ok: false, error: 'no_prompt' });
  });

  it('a song stays a song (never silently an instrumental); a lyrics language travels only with lyrics', () => {
    const drafts: MusicRequest[] = [];
    const ctx = { locale: 'ka' as const, addDraft: (r: MusicRequest) => { drafts.push(r); return `s${drafts.length}`; } };
    const r = handleMusicVoice({ action: 'plan', prompt: 'ქართული სიმღერა', mode: 'song', lyricsLanguage: 'ka', vocalGender: 'female' }, ctx);
    expect(r.message).toMatch(/never offer an instrumental as if it were the song/);
    expect(drafts[0]).toMatchObject({ mode: 'song', vocalGender: 'female', locale: 'ka' });
    expect(drafts[0]).not.toHaveProperty('lyricsLanguage');
    handleMusicVoice({ action: 'plan', prompt: 'x', mode: 'song', lyrics: 'ლა ლა', lyricsLanguage: 'ka' }, ctx);
    expect(drafts[1]).toMatchObject({ mode: 'song', lyrics: 'ლა ლა', lyricsLanguage: 'ka' });
  });

  it('status reports every card newest first, with price, stage and refusal; none → an empty list', () => {
    const ctx = { locale: 'en' as const, addDraft: () => 'x' };
    expect(handleMusicVoice({ action: 'status' }, ctx)).toMatchObject({ ok: true, state: { cards: [] } });
    fakeCard('a', { phase: 'refused', message: 'Sung vocals are not verified on this model yet.' });
    fakeCard('b', { phase: 'quoted', credits: 5 });
    const r = handleMusicVoice({ action: 'status' }, ctx);
    expect(r.state).toEqual({ cards: [
      { phase: 'quoted', prompt: 'p b', mode: 'instrumental', credits: 5, tracks: 0, busy: false },
      { phase: 'refused', prompt: 'p a', mode: 'instrumental', message: 'Sung vocals are not verified on this model yet.', tracks: 0, busy: false },
    ] });
  });

  it('cancel reaches only a running card; edit / download reach the newest card with a track; busy refuses a second edit', async () => {
    const notes: string[] = [];
    const ctx = { locale: 'en' as const, addDraft: () => 'x', note: (w: string) => notes.push(w) };
    expect(handleMusicVoice({ action: 'cancel' }, ctx)).toMatchObject({ ok: false, error: 'nothing_running' });
    expect(handleMusicVoice({ action: 'edit', command: 'fade out 3s' }, ctx)).toMatchObject({ ok: false, error: 'no_track' });
    expect(handleMusicVoice({ action: 'save' }, ctx)).toMatchObject({ ok: false, error: 'no_track' });
    const done = fakeCard('done', { tracks: [track('j1')] });
    const running = fakeCard('run', { phase: 'running', stage: 'generating' });
    expect(handleMusicVoice({ action: 'cancel' }, ctx).ok).toBe(true);
    expect(handleMusicVoice({ action: 'edit', command: 'fade out 3s' }, ctx).ok).toBe(true);
    expect(handleMusicVoice({ action: 'download' }, ctx).ok).toBe(true);
    expect(handleMusicVoice({ action: 'save' }, ctx).message).toMatch(/already saved in the user's Library/);
    await new Promise((r) => setTimeout(r, 0));
    expect(running.calls.cancel).toBe(1);
    expect(done.calls.edits).toEqual(['fade out 3s']);
    expect(done.calls.downloads).toBe(1);
    expect(notes.join(' ')).toMatch(/cancelled.*returned/);
    done.snap.busy = true;
    expect(handleMusicVoice({ action: 'edit', command: 'louder' }, ctx)).toMatchObject({ ok: false, error: 'busy' });
    expect(done.calls.edits).toHaveLength(1);
  });

  it('join takes the newest tracks (oldest of them first), crossfaded, and files the version under the newest card', async () => {
    const first = fakeCard('first', { tracks: [track('a')] });
    const second = fakeCard('second', { tracks: [track('b'), track('b2', 10)] });
    expect(newestTracks().map((t) => t.jobId)).toEqual(['b2', 'b', 'a']);
    const sent: Array<Record<string, unknown>> = [];
    const r = await joinNewestTracks({ count: 3, crossfadeSec: 2, locale: 'ru' }, {
      edit: async (body) => { sent.push(body); return { ok: true, jobId: 'joined', url: 'https://x/joined', durationSec: 66, format: 'mp3', label: 'join ×3', credits: 0 }; },
    });
    expect(r.ok).toBe(true);
    expect(sent).toEqual([{ v: 1, sources: ['a', 'b', 'b2'], ops: [], crossfadeSec: 2, format: 'mp3', locale: 'ru' }]);
    expect(second.calls.versions).toEqual(['joined']);
    expect(first.calls.versions).toEqual([]);
  });

  it('join refuses with fewer than two tracks and says the server\'s refusal as it is', async () => {
    fakeCard('one', { tracks: [track('a')] });
    expect(await joinNewestTracks({ locale: 'en' })).toMatchObject({ ok: false, code: 'need_two_tracks' });
    expect(handleMusicVoice({ action: 'join' }, { locale: 'en', addDraft: () => 'x' })).toMatchObject({ ok: false, error: 'need_two_tracks' });
    fakeCard('two', { tracks: [track('b')] });
    const r = await joinNewestTracks({ locale: 'en', crossfadeSec: 2 }, { edit: async () => ({ ok: false, code: 'validation_failed', message: 'The crossfade must be 0–10 s and shorter than every track.' }) });
    expect(r).toEqual({ ok: false, code: 'validation_failed', message: 'The crossfade must be 0–10 s and shorter than every track.' });
  });
});

import { downloadHref, mimeOfUrl, trackFileName } from './musicDraft';
describe('Download links of signed Storage URLs', () => {
  it('ask Storage for an attachment (a cross-origin link ignores the download attribute), once, with a safe name', () => {
    const u = 'https://x.supabase.co/storage/v1/object/sign/renders/music-studio/u/j.wav?token=abc';
    expect(downloadHref(u, 'myavatar music/1.wav')).toBe(`${u}&download=myavatar-music-1.wav`);
    expect(downloadHref(`${u}&download=a.wav`, 'b.wav')).toBe(`${u}&download=a.wav`);
    expect(downloadHref('https://cdn.example.com/a.mp3', 'a.mp3')).toBe('https://cdn.example.com/a.mp3');
    expect(mimeOfUrl(u)).toBe('audio/wav');
    expect(trackFileName('0123456789abcdef', 'audio/mp4', 'trim + fade_out → m4a')).toBe('myavatar-music-01234567-trim-fade-out.m4a');
    expect(trackFileName('0123456789abcdef', 'audio/mpeg', 'join ×2 · crossfade 2s → mp3')).toBe('myavatar-music-01234567-join-2-crossfade-2s.mp3');
  });
});
