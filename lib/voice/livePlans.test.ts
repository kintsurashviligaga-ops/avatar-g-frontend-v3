import type { AudioQuote } from '@/lib/agent/media/audioExtract';
import type { EditQuote } from '@/lib/agent/media/editExec';
import type { MontageQuote } from '@/lib/agent/media/montageExec';
import {
  LIVE_PLANS_LISTED,
  agentAudioPlanOf,
  audioPlanWhat,
  liveFingerprint,
  livePlanOf,
  livePlansOf,
  quotedPlanNote,
  type LivePlanCards,
} from './livePlans';

const AUDIO: AudioQuote = {
  jobId: 'ja', credits: 0, source: 'link', host: 'commons.wikimedia.org', name: 'talk.mp3', bytes: 2_500_000,
  contentType: 'video/webm', rights: { status: 'licensed', license: 'CC BY-SA 4.0' }, bitrateKbps: 192, maxSec: 3600, expiresAt: 0,
};
const MONTAGE: MontageQuote = {
  jobId: 'jm', credits: 0, totalSec: 24, shots: 12, clips: 3, aspect: '9:16', beatSynced: true, bpm: 120, musicStartSec: 0,
  unusedFiles: [], expiresAt: 0,
};
const EDIT: EditQuote = {
  jobId: 'je', credits: 0, name: 'clip-edit.mp4', edits: [{ op: 'trim', fromSec: 5, toSec: 20 }],
  plan: { sourceSec: 40, output: 'mp4', durationSec: 15, hasAudio: true, width: 1080, height: 1920, copyVideo: false },
  expiresAt: 0,
};

describe('Agent G cards as a call reads them', () => {
  it('an MP3 plan says from where, as what, its size, that it is free and its rights', () => {
    expect(audioPlanWhat(AUDIO)).toBe('the sound of commons.wikimedia.org as "talk.mp3", source 2.4 MB, MP3 192 kbps, free; rights licensed (CC BY-SA 4.0)');
    expect(audioPlanWhat({ ...AUDIO, source: 'file', host: null, bytes: null, rights: { status: 'own' } }))
      .toBe('the sound of the user\'s file as "talk.mp3", MP3 192 kbps, free; rights the user\'s own upload');
    expect(audioPlanWhat({ ...AUDIO, credits: 3, rights: { status: 'unverified' } })).toMatch(/3 credits; rights unverified: starting confirms/);
  });

  it('each card: its kind, its phase (a plan still being made is "preparing"), its facts in English without "press Start", its price', () => {
    const montage = livePlanOf({ id: 'm1', montage: { phase: 'quoted', quote: MONTAGE, token: 't' } })!;
    expect(montage).toMatchObject({ id: 'm1', kind: 'montage', phase: 'quoted', credits: 0 });
    expect(montage.what).toMatch(/120 BPM.*Plan: 12 shots from 3 clips, 24 s, 9:16.*Free\.$/);
    expect(montage.what).not.toMatch(/press Start|\n/);
    const edit = livePlanOf({ id: 'e1', editJob: { phase: 'quoted', source: 'previous', quote: EDIT, token: 't' } })!;
    expect(edit).toMatchObject({ kind: 'edit', phase: 'quoted', credits: 0 });
    expect(edit.what).toMatch(/^Source: the result I made last here\. Plan: .+ Result: .+clip-edit\.mp4.+ Free\.$/);
    expect(livePlanOf({ id: 'a1', audioJob: { phase: 'checking', source: 'link' } })).toEqual({ id: 'a1', kind: 'audio', phase: 'preparing', what: 'checking the source' });
    expect(livePlanOf({ id: 'm2', montage: { phase: 'reading' } })).toMatchObject({ phase: 'preparing', what: 'reading the clips and the track' });
    expect(livePlanOf({ id: 'a2', audioJob: { phase: 'failed', error: 'platform_blocked' } })).toMatchObject({ phase: 'failed', what: 'an MP3 (platform_blocked)' });
    expect(livePlanOf({ audioJob: { phase: 'quoted', quote: AUDIO } })).toBeNull(); // no id: nothing to name it by
    expect(livePlanOf({ id: 'x' })).toBeNull(); // no card
  });

  it('the chat\'s cards: the newest few, oldest first (the order the call numbers new ones)', () => {
    const msgs: LivePlanCards[] = [];
    for (let i = 0; i < LIVE_PLANS_LISTED + 3; i++) {
      msgs.push({ id: `u${i}` }); // a plain message between cards
      msgs.push({ id: `a${i}`, audioJob: { phase: 'done', quote: AUDIO } });
    }
    const listed = livePlansOf(msgs);
    expect(listed).toHaveLength(LIVE_PLANS_LISTED);
    expect(listed[0]!.id).toBe('a3');
    expect(listed[listed.length - 1]!.id).toBe(`a${LIVE_PLANS_LISTED + 2}`);
    expect(livePlansOf([])).toEqual([]);
  });

  it('a card waiting for a yes is announced under its id and its signed plan; anything else is not', () => {
    const q = quotedPlanNote({ id: 'a1', audioJob: { phase: 'quoted', quote: AUDIO, token: 'tok1' } })!;
    expect(q.key).toBe('a1:tok1');
    expect(q.note).toEqual({ kind: 'plan', what: audioPlanWhat(AUDIO), planId: 'a1', planKind: 'audio' });
    // Quoted again (a changed request): a new plan, a new key.
    expect(quotedPlanNote({ id: 'a1', audioJob: { phase: 'quoted', quote: AUDIO, token: 'tok2' } })!.key).toBe('a1:tok2');
    expect(quotedPlanNote({ id: 'a1', audioJob: { phase: 'running', quote: AUDIO, token: 'tok1' } })).toBeNull();
    expect(quotedPlanNote({ id: 'a1', audioJob: { phase: 'quoted', quote: AUDIO } })).toBeNull();
    expect(quotedPlanNote({ id: 'e1', editJob: { phase: 'quoted', quote: EDIT, token: 't' } })!.note.planKind).toBe('edit');
  });
});

describe('liveFingerprint: what a studio start would run', () => {
  it('is stable for the same tool, prompt (trimmed) and price, and changes when any of them does', () => {
    const fp = liveFingerprint('music', 'a calm piano piece', 4);
    expect(fp).toMatch(/^music:[0-9a-f]{8}$/);
    expect(liveFingerprint('music', '  a calm piano piece \n', 4)).toBe(fp);
    expect(liveFingerprint('music', 'a calm piano piece!', 4)).not.toBe(fp);
    expect(liveFingerprint('music', 'a calm piano piece', 6)).not.toBe(fp);
    expect(liveFingerprint('image', 'a calm piano piece', 4)).not.toBe(fp);
    expect(liveFingerprint('video', 'x', undefined)).not.toBe(liveFingerprint('video', 'x', 0));
  });
});

describe('agentAudioPlanOf: the MP3 plan an ask_agent_g run handed back', () => {
  const good = { quote: AUDIO, request: { url: 'https://commons.wikimedia.org/x.webm' }, token: 'sig' };
  it('takes the shape the route returns', () => {
    expect(agentAudioPlanOf(good)).toEqual(good);
  });
  it.each([
    ['nothing', undefined],
    ['a string', 'plan'],
    ['no token', { ...good, token: '' }],
    ['no request', { ...good, request: null }],
    ['no job id', { ...good, quote: { ...AUDIO, jobId: '' } }],
    ['a strange source', { ...good, quote: { ...AUDIO, source: 'youtube' } }],
    ['no rights', { ...good, quote: { ...AUDIO, rights: null } }],
    ['strange rights', { ...good, quote: { ...AUDIO, rights: { status: 'mine' } } }],
    ['a price that is not a number', { ...good, quote: { ...AUDIO, credits: '0' } }],
  ])('refuses %s', (_label, raw) => {
    expect(agentAudioPlanOf(raw)).toBeNull();
  });
});
