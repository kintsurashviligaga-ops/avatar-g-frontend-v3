import {
  activeWordAt, alignTimings, buildStudioPlan, checkTake, composeWideArgs, CREDITS_PER_USD, estimateSeconds,
  estimateWordTimings, extractDirections, filterPresenters, fromChunks, LIVE_PRESENTERS, liveSceneCostUsd,
  liveSceneCredits, liveScriptTurn, liveSystemInstruction, MAX_SEC, OMNI_PRESENTERS, omniTurnCostUsd, omniTurnPrompt,
  omniTurns, presentationTimeline, presenterById, price30s, quoteScene, scriptLang, scriptWords, shiftByDub,
  splitScript, studioAllowed, studioAudience, studioStitchInput, sttCostUsd, sttCredits, dubCostUsd, dubCredits,
  toCues, toSrt, V8_OMNI_TURN, wordErrorRate, type WordTiming,
} from './index';
import { buildStitchPlan } from '@/lib/video/longform/stitch';

/** A Georgian paragraph of about 10 s at a natural pace (≈ 140 spoken characters). */
const KA_10S = 'გამარჯობა, მე ვარ თქვენი ვირტუალური წამყვანი. დღეს გაჩვენებთ, როგორ ქმნის მაიავატარი პრეზენტაციას რამდენიმე წუთში. ეს მარტივია და სწრაფი.';
const twoMinutes = (): string => Array.from({ length: 12 }, (_, i) => (i % 3 === 2 ? `${KA_10S}\n\n` : `${KA_10S} `)).join('').trim();

describe('flag AVATAR_STUDIO_V2', () => {
  it('is off unless said in words', () => {
    expect(studioAudience({})).toBe('off');
    expect(studioAudience({ AVATAR_STUDIO_V2: '1' })).toBe('off');
    expect(studioAudience({ AVATAR_STUDIO_V2: 'true' })).toBe('off');
    expect(studioAudience({ AVATAR_STUDIO_V2: ' Admin ' })).toBe('admin');
    expect(studioAllowed(false, { AVATAR_STUDIO_V2: 'admin' })).toBe(false);
    expect(studioAllowed(true, { AVATAR_STUDIO_V2: 'admin' })).toBe(true);
    expect(studioAllowed(false, { AVATAR_STUDIO_V2: 'everyone' })).toBe(true);
  });
});

describe('catalog', () => {
  it('has the three open Live faces and every built-in Omni face, none invented', () => {
    expect(LIVE_PRESENTERS.map((p) => p.face)).toEqual(['Kira', 'Ben', 'Leo']);
    expect(LIVE_PRESENTERS.every((p) => p.thumb === null)).toBe(true);
    expect(OMNI_PRESENTERS.length).toBeGreaterThanOrEqual(6);
    expect(OMNI_PRESENTERS.every((p) => p.face.startsWith('/'))).toBe(true);
    expect(filterPresenters({ gender: 'male', look: 'casual', engine: 'live' }).map((p) => p.id)).toEqual(['live-leo']);
    expect(presenterById('live-ben')?.defaultVoice).toBe('Algieba');
    expect(presenterById('nope')).toBeNull();
  });
});

describe('script splitting', () => {
  it('detects the language and estimates Georgian by characters', () => {
    expect(scriptLang(KA_10S)).toBe('ka');
    expect(scriptLang('Hello there, welcome.')).toBe('en');
    expect(scriptLang('Привет, добро пожаловать.')).toBe('ru');
    const sec = estimateSeconds(KA_10S);
    expect(sec).toBeGreaterThan(8);
    expect(sec).toBeLessThan(13);
    expect(estimateSeconds(KA_10S, 'slower')).toBeGreaterThan(sec);
    expect(estimateSeconds(KA_10S, 'faster')).toBeLessThan(sec);
  });

  it('never speaks stage directions', () => {
    const { speech, directions } = extractDirections('(ღიმილით) გამარჯობა! *ხელს უქნევს* მოგესალმებით.');
    expect(speech).toBe('გამარჯობა! მოგესალმებით.');
    expect(directions).toEqual(['ღიმილით', 'ხელს უქნევს']);
  });

  it('splits a 2-minute script into about 4 even scenes of ~30 s, all under the cap, losing no word', () => {
    const script = twoMinutes();
    const r = splitScript(script);
    if (!r.ok) throw new Error(r.detail);
    expect(r.scenes.length).toBeGreaterThanOrEqual(3);
    expect(r.scenes.length).toBeLessThanOrEqual(5);
    for (const s of r.scenes) {
      expect(s.estSec).toBeLessThanOrEqual(MAX_SEC);
      expect(s.estSec).toBeGreaterThan(15);
    }
    const spread = Math.max(...r.scenes.map((s) => s.estSec)) - Math.min(...r.scenes.map((s) => s.estSec));
    expect(spread).toBeLessThan(15);
    expect(r.scenes.map((s) => s.text).join(' ').replace(/\s+/g, ' ')).toBe(script.replace(/\s+/g, ' '));
    expect(r.scenes.map((s) => s.index)).toEqual(r.scenes.map((_, i) => i));
  });

  it('keeps a short script as one scene and cuts only between sentences', () => {
    const r = splitScript(KA_10S);
    if (!r.ok) throw new Error(r.detail);
    expect(r.scenes).toHaveLength(1);
    expect(r.scenes[0]!.text).toBe(KA_10S);
  });

  it('cuts one over-long sentence at clauses, never mid-word', () => {
    const long = Array.from({ length: 30 }, () => 'ეს არის ძალიან გრძელი წინადადების ნაწილი').join(', ') + '.';
    const r = splitScript(long);
    if (!r.ok) throw new Error(r.detail);
    expect(r.scenes.length).toBeGreaterThan(1);
    for (const s of r.scenes) expect(s.estSec).toBeLessThanOrEqual(MAX_SEC);
    expect(r.scenes.map((s) => s.text).join(' ')).toBe(long);
  });

  it('refuses an empty, too long or too many-scene script with a reason', () => {
    expect(splitScript('   (მხოლოდ მითითება) ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(splitScript('ა'.repeat(3_001))).toMatchObject({ ok: false, reason: 'too_long' });
    expect(splitScript(twoMinutes(), { maxScenes: 2 })).toMatchObject({ ok: false, reason: 'too_many_scenes' });
  });

  it('cuts an Omni scene into turns of at most 10 s', () => {
    const turns = omniTurns(`${KA_10S} ${KA_10S} ${KA_10S}`);
    expect(turns.length).toBeGreaterThanOrEqual(3);
    for (const t of turns) expect(estimateSeconds(t)).toBeLessThanOrEqual(10.5);
  });
});

describe('karaoke timing (mocked recognizer)', () => {
  const words = scriptWords('გამარჯობა, მე ვარ თქვენი წამყვანი.');

  it('spreads words by syllables over the clip when nothing is measured', () => {
    const t = estimateWordTimings(words, 0, 3);
    expect(t).toHaveLength(5);
    expect(t[0]!.start).toBe(0);
    expect(t[4]!.end).toBe(3);
    expect(t[0]!.end - t[0]!.start).toBeGreaterThan(t[1]!.end - t[1]!.start); // გამარჯობა > მე
    expect(t.every((w, i) => i === 0 || w.start >= t[i - 1]!.end - 1e-9)).toBe(true);
  });

  it('aligns Chirp words onto the script spelling, fills a missed word between neighbours', () => {
    const heard = [
      { word: 'გამარჯობა', start: 0.2, end: 0.9 },
      { word: 'მე', start: 1.0, end: 1.1 },
      // „ვარ" missed by the recognizer
      { word: 'თქვენი', start: 1.5, end: 1.9 },
      { word: 'წამყვან', start: 2.0, end: 2.6 }, // a dropped letter still matches
    ];
    const t = alignTimings(words, heard, 3);
    expect(t.map((w) => w.word)).toEqual(words);
    expect(t[0]).toMatchObject({ start: 0.2, end: 0.9, measured: true });
    expect(t[2]!.measured).toBe(false);
    expect(t[2]!.start).toBeGreaterThanOrEqual(1.1);
    expect(t[2]!.end).toBeLessThanOrEqual(1.5);
    expect(t[4]).toMatchObject({ start: 2, measured: true });
  });

  it('times Live transcript chunks by their arrival', () => {
    const t = fromChunks([{ text: 'გამარჯობა, მე', atSec: 0.4 }, { text: 'ვარ თქვენი წამყვანი.', atSec: 1.6 }], 3.2);
    expect(t).toHaveLength(5);
    expect(t[0]!.start).toBe(0.4);
    expect(t[1]!.end).toBeCloseTo(1.6, 3);
    expect(t[4]!.end).toBe(3.2);
  });

  it('finds the lit word by binary search', () => {
    const t: WordTiming[] = [
      { word: 'a', start: 0, end: 1, measured: true },
      { word: 'b', start: 1.2, end: 2, measured: true },
      { word: 'c', start: 2, end: 3, measured: true },
    ];
    expect(activeWordAt(t, -0.1)).toBe(-1);
    expect(activeWordAt(t, 0.5)).toBe(0);
    expect(activeWordAt(t, 1.1)).toBe(0); // a short pause keeps the last word lit
    expect(activeWordAt(t, 2.5)).toBe(2);
    expect(activeWordAt(t, 4)).toBe(-1);
  });

  it('moves a dubbed line onto the mouth by the dub plan (lip-sync timing)', () => {
    const line: WordTiming[] = [
      { word: 'one', start: 0, end: 1, measured: true },
      { word: 'two', start: 1.5, end: 2.5, measured: true },
    ];
    // phrase 1 of the line plays at 0.5 s at normal speed; phrase 2 plays at 2.0 s twice as fast.
    const out = shiftByDub(line, [{ from: 0, to: 1, at: 0.5, tempo: 1 }, { from: 1.5, to: 2.5, at: 2, tempo: 2 }]);
    expect(out[0]).toMatchObject({ start: 0.5, end: 1.5 });
    expect(out[1]).toMatchObject({ start: 2, end: 2.5 });
  });

  it('lays scenes end to end and writes SRT cues of ≤ 42 chars', () => {
    const a = estimateWordTimings(scriptWords(KA_10S), 0, 10);
    const tl = presentationTimeline([{ timings: a, durationSec: 10.2 }, { timings: a, durationSec: 10 }]);
    const second = tl.find((w) => w.scene === 1)!;
    expect(second.start).toBeCloseTo(10.2, 3);
    const cues = toCues(tl);
    for (const c of cues) {
      expect(c.text.length).toBeLessThanOrEqual(42 + 20); // a single long word may exceed, never two
      expect(c.end - c.start).toBeLessThanOrEqual(6.01);
    }
    const srt = toSrt(cues);
    expect(srt.startsWith('1\n00:00:00,000 --> ')).toBe(true);
    expect(srt).toContain('00:00:1');
  });

  it('checks that the take was said verbatim', () => {
    expect(wordErrorRate('გამარჯობა მე ვარ', 'გამარჯობა მე ვარ')).toBe(0);
    expect(checkTake(KA_10S, KA_10S)).toEqual({ ok: true, wer: 0 });
    expect(checkTake(KA_10S, 'გამარჯობა, დიდი მადლობა.')).toMatchObject({ ok: false, reason: 'not_verbatim' });
    expect(checkTake(KA_10S, '')).toMatchObject({ ok: false, reason: 'silent' });
  });
});

describe('prices — the 65 % rule (credits ≥ ⌈cost × 104.38⌉)', () => {
  const floor = (usd: number) => Math.ceil(usd * CREDITS_PER_USD - 1e-9);

  it('Live presenter: 30 s ✦27, never under the margin floor from 1 to 40 s', () => {
    expect(liveSceneCredits(30)).toBe(27);
    expect(liveSceneCredits(10)).toBe(12);
    expect(liveSceneCredits(40)).toBe(35);
    for (let s = 1; s <= 40; s++) expect(liveSceneCredits(s)).toBeGreaterThanOrEqual(floor(liveSceneCostUsd(s)));
  });

  it('Omni turns, karaoke and dub all clear the floor', () => {
    for (const res of ['720p', '1080p'] as const) {
      for (const t of [4, 6, 8, 10] as const) expect(V8_OMNI_TURN[res][t]).toBeGreaterThanOrEqual(floor(omniTurnCostUsd(t, res)));
    }
    for (let s = 1; s <= 40; s++) {
      expect(sttCredits(s)).toBeGreaterThanOrEqual(floor(sttCostUsd(s)));
      expect(dubCredits(s)).toBeGreaterThanOrEqual(floor(dubCostUsd(s)));
    }
  });

  it('headline prices for a 30 s scene', () => {
    expect(price30s('live', 'v8')).toBe(27);
    expect(price30s('omni', 'v8', '720p')).toBe(250);
    expect(price30s('omni', 'v8', '1080p')).toBe(367);
    expect(quoteScene({ engine: 'omni', sec: 30, turnSecs: [10, 10, 10], dub: true }, 'v8').credits).toBe(252);
    expect(price30s('omni', 'today', '720p')).toBe(3 * 47 + 1);
  });

  it('the margin gate may only raise a v8 price', () => {
    const raise = (c: number, usd: number) => ({ credits: Math.max(c, Math.ceil(usd * 200)), raised: true });
    expect(quoteScene({ engine: 'live', sec: 30 }, 'v8', raise).credits).toBe(52);
    expect(quoteScene({ engine: 'live', sec: 30 }, 'today', raise).credits).toBe(27);
  });
});

describe('prompts', () => {
  it('Live reads the script verbatim, in the script language, with the chosen tone', () => {
    const s = liveSystemInstruction({ tone: 'serious', pace: 'slower', lang: 'ka' });
    expect(s).toContain('Georgian');
    expect(s).toContain('EXACTLY as written');
    expect(s).toContain('serious');
    expect(s).toContain('slower');
    expect(liveScriptTurn('  გამარჯობა ')).toBe('SCRIPT:\nგამარჯობა\nEND OF SCRIPT');
  });

  it('Omni quotes the line once, directs acting, and keys on a flat green when asked', () => {
    const p = omniTurnPrompt({ presenter: OMNI_PRESENTERS[0]!, line: 'გამარჯობა', lang: 'ka', tone: 'excited', pace: 'natural', background: { kind: 'green' }, format: '16:9', turn: 0 });
    expect(p.match(/გამარჯობა/g)).toHaveLength(1);
    expect(p).toContain('says, once, in Georgian');
    expect(p).toContain('lively hand gestures');
    expect(p).toContain('#00B140');
    expect(p).toContain('No music');
    const next = omniTurnPrompt({ presenter: OMNI_PRESENTERS[0]!, line: 'x', lang: 'en', tone: 'calm', pace: 'faster', background: { kind: 'studio' }, format: '9:16', turn: 1 });
    expect(next).toContain('Continue the same shot');
  });
});

describe('stitching (mocked scenes)', () => {
  const scenes = [
    { index: 1, source: '/tmp/work/s1.mp4', durationSec: 29.5 },
    { index: 0, source: '/tmp/work/s0.mp4', durationSec: 30.2 },
    { index: 2, source: '/tmp/work/s2.mp4', durationSec: 31 },
  ];

  it('orders scenes, marks chapters and hands a valid input to the Director stitcher', () => {
    const r = studioStitchInput(scenes, { workDir: '/tmp/work' });
    if (!r.ok) throw new Error(r.detail);
    expect(r.input.clips.map((c) => c.source)).toEqual(['/tmp/work/s0.mp4', '/tmp/work/s1.mp4', '/tmp/work/s2.mp4']);
    expect(r.chapters.map((c) => c.start)).toEqual([0, 30.2, 59.7]);
    expect(r.totalSec).toBe(90.7);
    const plan = buildStitchPlan(r.input);
    if (!plan.ok) throw new Error(plan.detail);
    expect(plan.plan.totalDurationSec).toBeCloseTo(90.7, 1);
    expect(plan.plan.outPath).toBe('/tmp/work/presentation.mp4');
  });

  it('refuses a presentation with a missing or unsafe scene', () => {
    expect(studioStitchInput([], { workDir: '/w' })).toMatchObject({ ok: false, reason: 'no_scenes' });
    expect(studioStitchInput([{ index: 0, source: null, durationSec: null }, scenes[0]!], { workDir: '/w' })).toMatchObject({ ok: false, reason: 'scene_missing', missing: [0] });
    expect(studioStitchInput([{ index: 0, source: '-i evil', durationSec: 3 }], { workDir: '/w' })).toMatchObject({ ok: false, reason: 'unsafe_source' });
  });

  it('composes a portrait Live take onto a 16:9 frame (key or pillar)', () => {
    const key = composeWideArgs({ foreground: '/w/take.mp4', background: '/w/bg.jpg', outPath: '/w/wide.mp4', mode: 'key' });
    if (!key.ok) throw new Error(key.detail);
    const graph = key.argv[key.argv.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('chromakey=0x00B140');
    expect(graph).toContain('scale=1920:1080');
    expect(graph).toContain('overlay=x=W-w-115');
    expect(key.argv).toContain('0:a?');
    const pillar = composeWideArgs({ foreground: '/w/take.mp4', background: '/w/bg.jpg', outPath: '/w/wide.mp4', mode: 'pillar' });
    if (!pillar.ok) throw new Error(pillar.detail);
    expect(pillar.argv.join(' ')).not.toContain('chromakey');
    expect(pillar.argv.join(' ')).toContain('boxblur');
    expect(composeWideArgs({ foreground: '../x', background: '/w/bg.jpg', outPath: '/w/o.mp4', mode: 'key' })).toMatchObject({ ok: false });
  });
});

describe('buildStudioPlan', () => {
  it('Live presenter: one take per scene, Algieba by default for Ben, priced before anything runs', () => {
    const r = buildStudioPlan({ script: twoMinutes(), presenterId: 'live-ben', tone: 'calm' }, { book: 'v8' });
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.voice?.id).toBe('Algieba');
    expect(r.plan.dub).toBe(false);
    expect(r.plan.scenes.every((s) => s.turns.length === 1)).toBe(true);
    expect(r.plan.quote.total).toBe(r.plan.scenes.reduce((s, x) => s + liveSceneCredits(x.estSec), 0));
    expect(r.plan.quote.total).toBeLessThan(150);
  });

  it('Live in 16:9 is pillared, or keyed on the green screen', () => {
    const pillar = buildStudioPlan({ script: KA_10S, presenterId: 'live-kira', format: '16:9' }, { book: 'v8' });
    const key = buildStudioPlan({ script: KA_10S, presenterId: 'live-kira', format: '16:9', background: { kind: 'green' } }, { book: 'v8' });
    expect(pillar.ok && pillar.plan.compose).toBe('pillar');
    expect(key.ok && key.plan.compose).toBe('key');
  });

  it('Omni with a named voice is a labelled dub; turns stay ≤ 4 per scene', () => {
    const omni = OMNI_PRESENTERS[0]!;
    const r = buildStudioPlan({ script: twoMinutes(), presenterId: omni.id, voiceId: 'Algieba', resolution: '1080p', background: { kind: 'generate', prompt: 'a bright modern office' } }, { book: 'v8' });
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.dub).toBe(true);
    expect(r.plan.warnings).toContain('studio_voice_lips_approximate');
    expect(r.plan.background).toEqual({ kind: 'image', description: 'a bright modern office' });
    expect(r.plan.scenes.every((s) => s.turns.length >= 1 && s.turns.length <= 4)).toBe(true);
    expect(r.plan.quote.background).toBe(0); // described in the prompt, no image made
    const live = buildStudioPlan({ script: KA_10S, presenterId: 'live-ben', background: { kind: 'generate', prompt: 'an office' } }, { book: 'v8' });
    expect(live.ok && live.plan.quote.background).toBe(8);
    expect(buildStudioPlan({ script: KA_10S, presenterId: omni.id, background: { kind: 'upload', path: 'avatar-studio/u/uploads/a.png' } }, { book: 'v8' })).toMatchObject({ ok: false, reason: 'bad_background' });
  });

  it('refuses unknown presenters and voices, and empty backgrounds, before any charge', () => {
    expect(buildStudioPlan({ script: KA_10S, presenterId: 'my-own-face' }, { book: 'v8' })).toMatchObject({ ok: false, reason: 'unknown_presenter' });
    expect(buildStudioPlan({ script: KA_10S, presenterId: 'live-leo', voiceId: 'Nobody' }, { book: 'v8' })).toMatchObject({ ok: false, reason: 'unknown_voice' });
    expect(buildStudioPlan({ script: KA_10S, presenterId: 'live-leo', background: { kind: 'generate', prompt: ' ' } }, { book: 'v8' })).toMatchObject({ ok: false, reason: 'bad_background' });
    expect(buildStudioPlan({ script: '', presenterId: 'live-leo' }, { book: 'v8' })).toMatchObject({ ok: false, reason: 'empty' });
  });
});
