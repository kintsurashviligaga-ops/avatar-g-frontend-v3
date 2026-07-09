/** @jest-environment node */
import { parseMasterScript, masterDialogueTurns, parseTc, parseTcRange, sectionize } from './masterScript';

// Real excerpt from the deepseek „ის დილა" Master Production Script (the format the user actually pastes).
const SCRIPT = [
  '„ის დილა" / THAT MORNING',
  'Master Production Script v2.1',
  '',
  'PRODUCTION OVERVIEW',
  '-------------------',
  'Runtime:         30.000s (720 frames @ 24fps)',
  'Master Format:   9:16 · 1080×1920 · 24fps (Reels/TikTok/Shorts)',
  'Genre/Tone:      Historical epic drama · elegiac, heroic',
  'Character Anchor: "გიორგი" — 35yo Georgian man, direct-to-camera',
  '',
  'SCENE BREAKDOWN — MASTER TIMELINE',
  '==================================',
  '',
  'Scene 1: "უკანასკნელი მშვიდი დილა" (The Last Peaceful Morning)',
  'Frames: 0–144 · Duration: 0:00–0:06 · Clips: 2',
  '',
  'TC          Shot      Camera        Action',
  '00:00–00:02 S1.1      Drone aerial  Epic descent over old Tbilisi at dawn; Narikala silhouette against reddish sky',
  '00:02–00:04 S1.2      Crane descent Mist on narrow streets; tram crawling with sparks',
  '00:04–00:06 S1.3      Steadicam     Street-level: grandfather with tea; woman hanging laundry; children with football',
  '',
  'Visual: Golden hour (3200K), volumetric god-rays, warm amber.',
  '',
  'Scene 2: "ხმა, რომელმაც სამყარო გააჩერა" (The Voice That Stopped the World)',
  'Frames: 144–288 · Duration: 0:06–0:12 · Clips: 3',
  '',
  'TC          Shot      Camera        Action',
  '00:06–00:08 S2.1      Macro 100mm   ECU on Soviet bakelite radio; tube glowing red; Molotov voice in Russian',
  '00:09–00:10 S2.3      35mm wide     Cherry basket falls in SLOW MOTION; cherries scatter like blood',
  '',
  'Visual: Red tube glow → natural morning; warm→cold shift.',
  '',
  'VOICE CAST & DIALOGUE SHEET',
  '============================',
  'NARRATOR (V.O.) — 50–55, deep baritone',
  '#   TC              Line (Georgian)                                   Translation',
  'VO1 00:02.5–00:05.5 "იყო ერთი დილა, რომელიც მთელმა ქვეყანამ ამოისუნთქა." "There was a morning."',
  'VO2 00:08.5–00:11.5 "ცა იყო წყნარი. მაგრამ ერთმა ხმამ — გული გააჩერა."   "The sky was calm."',
  '',
  'DIALOGUE SPEAKERS (On-Camera)',
  'Speaker       TC          Line (Georgian)     Translation      Direction',
  'Woman         00:09       "ღმერთო ჩემო…"      "My God…"         barely audible whisper',
  'Grandmother   00:13       "ისევ ომი…"         "War again…"      broken, aged whisper',
  '',
  'MUSIC & SOUND DESIGN — FRAME-TIMED MATRIX',
  '===========================================',
  'SCORE ARCHITECTURE (stems for mixing)',
  'Frames      TC          Layer',
  '0–144       00:00–00:06 Duduk solo (A minor) + ambient drone',
  '144–192     00:06–00:08 SILENCE – score muted, only radio static. NON-NEGOTIABLE.',
  '192–288     00:08–00:12 Strings tremolo pp→mf (rising fear)',
  '',
  'SFX TRIGGER SHEET (frame-timed)',
  'Frames    TC          SFX                        Duration  Notes',
  '72–120    00:03–00:05 Tram click-clack           48f       diegetic, street',
  '192       00:08       Molotov radio (RU, low)    24f       diegetic from radio',
  '',
  'TITLE CARD TIMING',
  '=================',
  'Frame 720–744 (00:30–00:31):  BLACK (1s)',
  'Frame 744–768 (00:31–00:32):  "ის დილა / THAT MORNING" – Cinzel Decorative',
].join('\n');

describe('timecode helpers', () => {
  it('parseTc reads MM:SS and MM:SS.d', () => {
    expect(parseTc('00:02')).toBe(2);
    expect(parseTc('0:06')).toBe(6);
    expect(parseTc('00:30')).toBe(30);
    expect(parseTc('00:02.5')).toBe(2.5);
    expect(parseTc('nope')).toBeNull();
  });
  it('parseTcRange reads a range', () => {
    expect(parseTcRange('00:06–00:08')).toEqual({ startSec: 6, endSec: 8 });
    expect(parseTcRange('00:00-00:02')).toEqual({ startSec: 0, endSec: 2 });
    expect(parseTcRange('00:08')).toBeNull();
  });
});

describe('sectionize', () => {
  it('slices the known sections (score not truncated by the SCORE ARCHITECTURE synonym)', () => {
    const s = sectionize(SCRIPT);
    expect(Object.keys(s)).toEqual(expect.arrayContaining(['overview', 'scenes', 'voice', 'dialogue', 'score', 'sfx', 'title']));
    expect(s.score).toMatch(/SILENCE/); // the synonym header did not cut the section short
  });
});

describe('parseMasterScript', () => {
  const p = parseMasterScript(SCRIPT);

  it('is ok and reads the meta', () => {
    expect(p.ok).toBe(true);
    expect(p.meta.runtimeSec).toBe(30);
    expect(p.meta.genre).toMatch(/Historical epic drama/);
    expect(p.meta.characterAnchor).toMatch(/გიორგი/);
  });

  it('scenes: ACTION column drives the prompt (+ grade), with title + time window', () => {
    expect(p.scenes.length).toBe(2);
    expect(p.scenes[0]!.action.toLowerCase()).toMatch(/tbilisi|narikala|laundry/);
    expect(p.scenes[0]!.action).not.toMatch(/S1\.1|00:00/);
    expect(p.scenes[0]!.title).toMatch(/უკანასკნელი მშვიდი დილა/);
    expect(p.scenes[0]).toMatchObject({ startSec: 0, endSec: 6 });
    expect(p.scenes[1]!.action.toLowerCase()).toMatch(/radio|cherry/);
    expect(p.scenes[1]).toMatchObject({ startSec: 6, endSec: 12 });
  });

  it('narration: VO sheet → Georgian spoken lines + a sanitized narrationScript (no VO tags/timecodes)', () => {
    expect(p.narration.length).toBe(2);
    expect(p.narration[0]).toMatchObject({ id: 'VO1', startSec: 2.5, endSec: 5.5 });
    expect(p.narration[0]!.text).toMatch(/იყო ერთი დილა/);
    expect(p.narrationScript).toMatch(/იყო ერთი დილა/);
    expect(p.narrationScript).not.toMatch(/VO1|00:02|"/);
  });

  it('dialogue: per-speaker turns (enables multi-voice)', () => {
    expect(p.dialogue.map((d) => d.speaker)).toEqual(['Woman', 'Grandmother']);
    expect(p.dialogue[0]).toMatchObject({ startSec: 9 });
    expect(p.dialogue[0]!.text).toMatch(/ღმერთო ჩემო/);
    expect(p.dialogue[1]!.text).toMatch(/ისევ ომი/);
  });

  it('sfx: frame-timed cues', () => {
    expect(p.sfx.length).toBeGreaterThanOrEqual(2);
    const tram = p.sfx.find((c) => /tram/i.test(c.sfx));
    expect(tram).toMatchObject({ startSec: 3, endSec: 5 });
    expect(p.sfx.find((c) => /radio/i.test(c.sfx))?.startSec).toBe(8);
  });

  it('muteWindows: the SILENCE beat → the audio-mix mute window', () => {
    expect(p.muteWindows).toEqual([{ startSec: 6, endSec: 8 }]);
  });

  it('titleCards: burned overlay text + timing (not spoken)', () => {
    const card = p.titleCards.find((t) => /ის დილა/.test(t.text));
    expect(card).toBeTruthy();
    expect(card).toMatchObject({ startSec: 31, endSec: 32 });
  });

  it('is total + fail-open on junk', () => {
    expect(parseMasterScript(null).ok).toBe(false);
    expect(parseMasterScript('just a plain sentence about a man').ok).toBe(false);
  });
});

describe('masterDialogueTurns', () => {
  const p = parseMasterScript(SCRIPT);

  it('folds the VO narrator spine IN with dialogue, timecode-ordered', () => {
    const turns = masterDialogueTurns(p, 'male');
    // 2 VO lines (2.5, 8.5) + 2 dialogue (9, 13) → 4 turns, ordered by TC.
    expect(turns.map((t) => t.speaker)).toEqual(['NARRATOR', 'NARRATOR', 'Woman', 'Grandmother']);
    expect(turns[0]!.text).toMatch(/იყო ერთი დილა/);
    expect(turns[2]!.text).toMatch(/ღმერთო ჩემო/);
    // narrator gender steers the cast voice via the direction hint
    expect(turns[0]!.direction).toBe('male narrator');
  });

  it('honors female / unset narrator gender in the direction hint', () => {
    expect(masterDialogueTurns(p, 'female')[0]!.direction).toBe('female narrator');
    expect(masterDialogueTurns(p, null)[0]!.direction).toBe('narrator');
  });

  it('returns [] when there is no on-camera dialogue (→ caller uses the narration leg)', () => {
    const narrationOnly = parseMasterScript(
      ['VOICE CAST & DIALOGUE SHEET', '====', 'NARRATOR (V.O.)', 'VO1 00:02–00:05 "მხოლოდ ხმა." "Only a voice."'].join('\n'),
    );
    expect(narrationOnly.narration.length).toBe(1);
    expect(narrationOnly.dialogue.length).toBe(0);
    expect(masterDialogueTurns(narrationOnly, 'male')).toEqual([]);
  });

  it('is fail-open on a not-ok parse', () => {
    expect(masterDialogueTurns(parseMasterScript('nonsense'), null)).toEqual([]);
  });

  it('is total — never throws even on a malformed ParsedMasterScript (undefined arrays)', () => {
    // Not constructible via the public API (arrays are non-optional), but hardened for defensiveness.
    const malformed = { ok: true, dialogue: undefined, narration: undefined } as unknown as ReturnType<typeof parseMasterScript>;
    expect(() => masterDialogueTurns(malformed, 'male')).not.toThrow();
    expect(masterDialogueTurns(malformed, 'male')).toEqual([]);
  });
});
