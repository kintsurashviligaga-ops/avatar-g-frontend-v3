import {
  extractSceneDialogue,
  splitDialogueScriptLines,
  planSceneDialogue,
  MAX_SPOKEN_LINE_CHARS,
} from './sceneDialogue';
import { splitStructuredScriptScenes, planFilmGrid, planFilmScenes } from './filmPipeline';
import { parseMasterScript, masterDialogueTurns } from '@/lib/pipeline/script/masterScript';

// The owner's representative brief: "დროის წნეხი" — 4 scenes × 6s = 24s, three of them with a spoken
// line, one (the bound hands) deliberately silent.
const TIME_PRESSURE_SCRIPT = `დროის წნეხი — 24 წამი

🎬 სცენა 1 (0:00–0:06) — „ჩარჩენილი"
ვიზუალი: ფართო კადრი, ინდუსტრიული საწყობი, კაცი შეკრული ზის ხის ყუთზე, მტვრიანი სხივები.
დიალოგი: „ჩვენ დრო აღარ გვაქვს."
🔊 SFX: შორეული წვეთები

🎬 სცენა 2 (0:06–0:12) — „შიში"
ვიზუალი: ახლო კადრი ქალზე, თვალებში ცრემლი და შიში.
დიალოგი: „მე ვიცი."

🎬 სცენა 3 (0:12–0:18) — „ბორკილები"
ვიზუალი: დეტალური კადრი შეკრულ ხელებზე, თითები იჭიმება, თოკი იჭიმება.

🎬 სცენა 4 (0:18–0:24) — „გათავისუფლება"
ვიზუალი: კაცი დგება, წყვეტს თოკებს და მიდის ქალისკენ.
დიალოგი: „სხვა გზა არ არის."
`;

describe('extractSceneDialogue — the line the character actually says', () => {
  it('pulls the explicit დიალოგი: field, verbatim in Georgian', () => {
    const line = extractSceneDialogue('ვიზუალი: ფართო კადრი.\nდიალოგი: „ჩვენ დრო აღარ გვაქვს."');
    expect(line?.text).toBe('ჩვენ დრო აღარ გვაქვს.');
  });

  it('reads an English "Dialogue:" field and a Russian "Реплика:" field', () => {
    expect(extractSceneDialogue('Visual: a warehouse.\nDialogue: "We are out of time."')?.text)
      .toBe('We are out of time.');
    expect(extractSceneDialogue('Визуал: склад.\nРеплика: «Времени больше нет.»')?.text)
      .toBe('Времени больше нет.');
  });

  it('reads an inline "…says: „…"" line', () => {
    const line = extractSceneDialogue('The man looks at the camera and says: „ჩვენ დრო აღარ გვაქვს."');
    expect(line?.text).toBe('ჩვენ დრო აღარ გვაქვს.');
  });

  it('reads a screenplay speaker cue and keeps the speaker', () => {
    const line = extractSceneDialogue('A close-up.\nANNA: "I know."');
    expect(line).toEqual({ text: 'I know.', speaker: 'ANNA' });
  });

  it('never mistakes the quoted SCENE TITLE for dialogue', () => {
    // The header carries a quoted title; only the title. Nobody speaks in this scene.
    const block = '🎬 სცენა 3 (0:12–0:18) — „ბორკილები"\nვიზუალი: დეტალური კადრი შეკრულ ხელებზე.';
    expect(extractSceneDialogue(block)).toBeNull();
  });

  it('never treats a metadata label (Visual/Camera/SFX) as a speaker', () => {
    expect(extractSceneDialogue('Visual: "golden hour, anamorphic flares"')).toBeNull();
    expect(extractSceneDialogue('კამერა: „ნელი დოლი"')).toBeNull();
  });

  it('does not read a quoted PRODUCTION NOTE as dialogue (colour grade, title, location)', () => {
    // These labels are outside any allowlist and the value is quoted exactly like a line — the extra
    // guard is that real speech ends as an utterance, a note does not.
    expect(extractSceneDialogue('ვიზუალი: ფართო კადრი.\nფერი: „თბილი ამბერი, ანამორფული"')).toBeNull();
    expect(extractSceneDialogue('ვიზუალი: ახლო კადრი.\nსათაური: „ბორკილები"')).toBeNull();
    expect(extractSceneDialogue('Visual: a warehouse.\nProps: "rope, crate, lantern"')).toBeNull();
    // …and a real cue in the same block still wins.
    expect(extractSceneDialogue('ფერი: „თბილი ამბერი"\nANNA: „სხვა გზა არ არის."')?.text).toBe('სხვა გზა არ არის.');
  });

  it('is total — junk, empty and non-string input never throw', () => {
    expect(extractSceneDialogue('')).toBeNull();
    expect(extractSceneDialogue(null)).toBeNull();
    expect(extractSceneDialogue(undefined)).toBeNull();
    expect(extractSceneDialogue('"".:::「」')).toBeNull();
  });

  it('returns fast on adversarial whitespace/quote runs (no catastrophic backtracking)', () => {
    const t0 = Date.now();
    extractSceneDialogue(`\n${' '.repeat(8000)}დიალოგი`); // marker present, never completed
    extractSceneDialogue(`says${' '.repeat(8000)}`); // inline cue, never completed
    extractSceneDialogue(`\n${'A'.repeat(8000)}:`); // speaker cue, never quoted
    extractSceneDialogue(`"${'x'.repeat(8000)}`); // unterminated quote
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe('splitStructuredScriptScenes — visuals + dialogue + timecode, not visuals alone', () => {
  const sheets = splitStructuredScriptScenes(TIME_PRESSURE_SCRIPT, 12)!;

  it('splits the owner\'s 24s script into 4 sheets', () => {
    expect(sheets).toHaveLength(4);
  });

  it('keeps the VISUAL description as the render prompt (dialogue/SFX metadata stripped)', () => {
    expect(sheets[0]!.prompt).toMatch(/ინდუსტრიული საწყობი/);
    expect(sheets[0]!.prompt).not.toMatch(/დიალოგი|SFX/);
  });

  it('carries each scene\'s spoken line and timecode window', () => {
    expect(sheets.map((s) => s.dialogue?.text ?? null)).toEqual([
      'ჩვენ დრო აღარ გვაქვს.',
      'მე ვიცი.',
      null, // the bound-hands beat is a deliberate pause
      'სხვა გზა არ არის.',
    ]);
    expect(sheets.map((s) => s.window)).toEqual([
      { startSec: 0, endSec: 6 },
      { startSec: 6, endSec: 12 },
      { startSec: 12, endSec: 18 },
      { startSec: 18, endSec: 24 },
    ]);
  });

  it('derives the 4 × 6s grid from those windows (not the pinned 3 × 8s)', () => {
    expect(planFilmGrid({ sceneCount: sheets.length, windows: sheets.map((s) => s.window) }))
      .toEqual({ sceneCount: 4, clipSec: 6, totalSec: 24 });
  });
});

describe('splitDialogueScriptLines', () => {
  it('splits per line and strips the speaker cue + quotes', () => {
    expect(splitDialogueScriptLines('ANNA: "I know."\nMARK: „ჩვენ დრო აღარ გვაქვს."')).toEqual([
      { text: 'I know.', speaker: 'ANNA' },
      { text: 'ჩვენ დრო აღარ გვაქვს.', speaker: 'MARK' },
    ]);
  });
  it('handles a bare line with no speaker', () => {
    expect(splitDialogueScriptLines('We are out of time.')).toEqual([{ text: 'We are out of time.', speaker: null }]);
  });
  it('is total on empty/null input', () => {
    expect(splitDialogueScriptLines('')).toEqual([]);
    expect(splitDialogueScriptLines(null)).toEqual([]);
  });
});

describe('planSceneDialogue — every line placed, or none delegated at all', () => {
  it('honours the per-scene sheets first', () => {
    const p = planSceneDialogue({
      sceneCount: 3,
      clipSec: 6,
      sheets: [{ text: 'one' }, null, { text: 'three' }],
    });
    expect(p.scenes.map((l) => l[0]?.text ?? null)).toEqual(['one', null, 'three']);
    expect(p).toMatchObject({ placed: 2, total: 2, complete: true });
  });

  it('places TIMECODED turns into the scene whose window contains them', () => {
    const p = planSceneDialogue({
      sceneCount: 4,
      clipSec: 6,
      turns: [
        { speaker: 'კაცი', text: 'ჩვენ დრო აღარ გვაქვს.', startSec: 2 },
        { speaker: 'ქალი', text: 'მე ვიცი.', startSec: 8 },
        { speaker: 'კაცი', text: 'სხვა გზა არ არის.', startSec: 20 },
      ],
    });
    expect(p.scenes.map((l) => l[0]?.text ?? null)).toEqual([
      'ჩვენ დრო აღარ გვაქვს.',
      'მე ვიცი.',
      null,
      'სხვა გზა არ არის.',
    ]);
    expect(p.scenes[0]![0]!.speaker).toBe('კაცი');
    expect(p.complete).toBe(true);
  });

  // THE regression: two turns inside ONE scene window. Keeping only the first while the caller drops the
  // whole ElevenLabs leg meant the second line was spoken by nobody, anywhere in the film.
  it('keeps BOTH turns when two land in the same scene window (a shot-reverse-shot exchange)', () => {
    const p = planSceneDialogue({
      sceneCount: 3,
      clipSec: 8,
      turns: [
        { speaker: 'ANNA', text: 'რას აკეთებ აქ?', startSec: 2 },
        { speaker: 'BEN', text: 'შენ დამპირდი.', startSec: 5 },
        { speaker: 'ANNA', text: 'აღარ მჯერა.', startSec: 10 },
        { speaker: 'BEN', text: 'მაშინ წავალ.', startSec: 18 },
      ],
    });
    expect(p.scenes[0]!.map((l) => l.text)).toEqual(['რას აკეთებ აქ?', 'შენ დამპირდი.']);
    expect(p.scenes[1]!.map((l) => l.text)).toEqual(['აღარ მჯერა.']);
    expect(p.scenes[2]!.map((l) => l.text)).toEqual(['მაშინ წავალ.']);
    expect(p).toMatchObject({ placed: 4, total: 4, complete: true });
  });

  it('refuses to delegate when a THIRD line crowds one scene (complete=false → ElevenLabs keeps all)', () => {
    const p = planSceneDialogue({
      sceneCount: 2,
      clipSec: 8,
      turns: [
        { text: 'one', startSec: 1 },
        { text: 'two', startSec: 2 },
        { text: 'three', startSec: 3 },
      ],
    });
    expect(p.total).toBe(3);
    expect(p.placed).toBe(2);
    expect(p.complete).toBe(false); // the caller must delegate NOTHING
  });

  it('refuses to delegate a turn that falls before the first scene window', () => {
    const p = planSceneDialogue({
      sceneCount: 2,
      clipSec: 6,
      windows: [{ startSec: 10, endSec: 16 }, { startSec: 16, endSec: 22 }],
      turns: [{ text: 'spoken over the title card', startSec: 2 }],
    });
    expect(p).toMatchObject({ placed: 0, total: 1, complete: false });
  });

  it('respects EXPLICIT windows over the uniform clipSec grid', () => {
    const p = planSceneDialogue({
      sceneCount: 2,
      clipSec: 8,
      windows: [{ startSec: 0, endSec: 4 }, { startSec: 4, endSec: 10 }],
      turns: [{ text: 'late line', startSec: 6 }],
    });
    expect(p.scenes.map((l) => l[0]?.text ?? null)).toEqual([null, 'late line']);
    expect(p.complete).toBe(true);
  });

  it('a sheet line WINS over a turn that lands in the same scene (no clobber, no double-count)', () => {
    // The caller is meant to pass these sources exclusively; if both arrive, the turns are counted but
    // NOT placed so `complete` goes false and nothing is delegated — the safe direction.
    const p = planSceneDialogue({
      sceneCount: 2,
      clipSec: 6,
      sheets: [{ text: 'from the sheet' }],
      turns: [{ text: 'from the turn', startSec: 1 }],
    });
    expect(p.scenes[0]![0]!.text).toBe('from the sheet');
    expect(p.complete).toBe(false);
  });

  it('maps a free-form dialogue script positionally when it FITS the scene count', () => {
    const p = planSceneDialogue({ sceneCount: 3, clipSec: 6, script: 'A: "one"\nB: "two"' });
    expect(p.scenes.map((l) => l[0]?.text ?? null)).toEqual(['one', 'two', null]);
    expect(p.complete).toBe(true);
  });

  it('refuses to delegate when the script has MORE lines than scenes (never guesses)', () => {
    const p = planSceneDialogue({ sceneCount: 2, clipSec: 6, script: 'one\ntwo\nthree\nfour\nfive' });
    expect(p.placed).toBe(2);
    expect(p.total).toBe(5);
    expect(p.complete).toBe(false);
  });

  // THE second regression: a separator / over-long line was silently dropped, which BOTH shifted every
  // later line one scene up AND lost the dropped line once the ElevenLabs leg was suppressed.
  it('refuses to delegate when a script line is unusable (a "…" separator no longer shifts the rest)', () => {
    const p = planSceneDialogue({ sceneCount: 4, clipSec: 6, script: 'A: first\n...\nC: third' });
    expect(p.total).toBe(3);
    expect(p.complete).toBe(false);
    // Position is preserved for what WAS parsed — line 3 stays scene 3, it never slides up to scene 2.
    expect(p.scenes.map((l) => l[0]?.text ?? null)).toEqual(['first', null, 'third', null]);
  });

  it('refuses to delegate a line too long for one shot to speak (it would be truncated in the prompt)', () => {
    // A 360-char "line" cannot be uttered in 4–8s. Placing it would truncate it at MAX_SPOKEN_LINE_CHARS
    // inside the prompt and the tail would be spoken by nobody — so it blocks delegation and the
    // ElevenLabs track (which can pace it across the film) keeps the whole script.
    const p = planSceneDialogue({ sceneCount: 2, clipSec: 6, script: `A: ${'x '.repeat(180)}\nB: short` });
    expect(p.total).toBe(2);
    expect(p.placed).toBe(1);
    expect(p.complete).toBe(false);
  });

  it('accepts a line right at the speakable ceiling and never emits one over it', () => {
    const atCeiling = 'ab '.repeat(66).trim(); // 197 chars
    expect(atCeiling.length).toBeLessThanOrEqual(MAX_SPOKEN_LINE_CHARS);
    const p = planSceneDialogue({ sceneCount: 1, clipSec: 8, script: `A: ${atCeiling}` });
    expect(p.complete).toBe(true);
    expect(p.scenes[0]![0]!.text.length).toBeLessThanOrEqual(MAX_SPOKEN_LINE_CHARS);
  });

  // A production script is full of `Label: "value"` rows that look exactly like dialogue. Speaking one
  // aloud on camera in a paid render is the visible failure; blocking delegation is the safe one.
  it('never turns a METADATA row into speech (and blocks delegation when it sees one)', () => {
    for (const row of ['SFX: distant thunder rolls', 'Camera: slow push in', 'Overlay: title card', 'ფერი: თბილი ამბერი']) {
      const p = planSceneDialogue({ sceneCount: 2, clipSec: 6, script: `${row}\nANNA: მე ვიცი.` });
      expect(p.scenes[0]).toEqual([]);          // the metadata row is never spoken
      expect(p.complete).toBe(false);           // …and nothing is delegated
      expect(p.scenes[1]?.[0]?.text).toBe('მე ვიცი.'); // position is still preserved
    }
  });

  it('never treats a bracketed timecode line as speech', () => {
    const p = planSceneDialogue({ sceneCount: 2, clipSec: 6, script: '[00:03] The city wakes.' });
    expect(p).toMatchObject({ placed: 0, total: 1, complete: false });
  });

  it('keeps the WHOLE sentence when a line merely contains a quoted word', () => {
    // Preferring the first quoted run turned this into just 'stop' — the rest of the line was lost while
    // the ElevenLabs leg was dropped as redundant.
    const p = planSceneDialogue({ sceneCount: 1, clipSec: 8, script: 'ANNA: I told him "stop" and walked out.' });
    expect(p.scenes[0]![0]!.text).toBe('I told him "stop" and walked out.');
  });

  it('still strips a wrapping quote and a trailing stage direction', () => {
    const p = planSceneDialogue({ sceneCount: 1, clipSec: 8, script: 'ANNA: „მე ვიცი." (ჩურჩულით)' });
    expect(p.scenes[0]![0]!.text).toBe('მე ვიცი.');
  });

  it('is total for a zero/invalid scene count', () => {
    expect(planSceneDialogue({ sceneCount: 0, clipSec: 6, script: 'x' })).toMatchObject({ scenes: [], complete: false });
    expect(planSceneDialogue({ sceneCount: Number.NaN, clipSec: 6 })).toMatchObject({ scenes: [], complete: false });
  });
});

// ─── END-TO-END: a pasted Master Production Script → in-clip spoken lines ─────
// The unit tests above cover each stage; this one runs the REAL chain the render uses for the format the
// owner actually pastes: parseMasterScript → masterDialogueTurns' source (`parsed.dialogue`) →
// planSceneDialogue → planFilmScenes, and asserts the Georgian line ends up in that scene's Veo prompt.

const MASTER_SCRIPT = [
  '„დროის წნეხი" / TIME PRESSURE',
  'Master Production Script v1',
  '',
  'PRODUCTION OVERVIEW',
  '-------------------',
  'Runtime:         24.000s (576 frames @ 24fps)',
  'Master Format:   16:9 · 1920×1080 · 24fps',
  '',
  'SCENE BREAKDOWN — MASTER TIMELINE',
  '==================================',
  '',
  'Scene 1: "ჩარჩენილი" (Trapped)',
  'Frames: 0–144 · Duration: 0:00–0:06 · Clips: 1',
  '',
  'TC          Shot      Camera        Action',
  '00:00–00:06 S1.1      Wide          Industrial warehouse; a bound man sits on a wooden crate; dusty light shafts',
  '',
  'Scene 2: "შიში" (Fear)',
  'Frames: 144–288 · Duration: 0:06–0:12 · Clips: 1',
  '',
  'TC          Shot      Camera        Action',
  '00:06–00:12 S2.1      Close-up      Close on the woman; tears welling, fear in her eyes',
  '',
  'Scene 3: "ბორკილები" (Bonds)',
  'Frames: 288–432 · Duration: 0:12–0:18 · Clips: 1',
  '',
  'TC          Shot      Camera        Action',
  '00:12–00:18 S3.1      Macro         Detail on his bound hands; fingers flex; the rope strains',
  '',
  'Scene 4: "გათავისუფლება" (Release)',
  'Frames: 432–576 · Duration: 0:18–0:24 · Clips: 1',
  '',
  'TC          Shot      Camera        Action',
  '00:18–00:24 S4.1      Steadicam     He stands, snaps the ropes and strides toward her',
  '',
  'DIALOGUE SPEAKERS (On-Camera)',
  'Speaker       TC          Line (Georgian)              Translation           Direction',
  'Man           00:02       "ჩვენ დრო აღარ გვაქვს."      "We are out of time."  low, urgent',
  'Woman         00:08       "მე ვიცი."                   "I know."              barely audible',
  'Man           00:20       "სხვა გზა არ არის."           "There is no other way." resolved',
  '',
].join('\n');

describe('END-TO-END: Master Production Script → Veo in-clip speech', () => {
  const parsed = parseMasterScript(MASTER_SCRIPT);

  it('parses 4 scene sheets with 6s windows and 3 timecoded on-camera lines', () => {
    expect(parsed.ok).toBe(true);
    expect(parsed.scenes).toHaveLength(4);
    expect(parsed.scenes.map((s) => [s.startSec, s.endSec])).toEqual([[0, 6], [6, 12], [12, 18], [18, 24]]);
    expect(parsed.dialogue.map((d) => d.text)).toEqual(['ჩვენ დრო აღარ გვაქვს.', 'მე ვიცი.', 'სხვა გზა არ არის.']);
  });

  it('renders 4 × 6s and puts each Georgian line in ITS OWN scene prompt, verbatim', () => {
    const windows = parsed.scenes.map((s) => ({ startSec: s.startSec, endSec: s.endSec }));
    const sceneScripts = parsed.scenes.map((s) => s.action);
    const grid = planFilmGrid({ sceneCount: sceneScripts.length, windows });
    expect(grid).toEqual({ sceneCount: 4, clipSec: 6, totalSec: 24 });

    const speech = planSceneDialogue({
      sceneCount: grid.sceneCount,
      clipSec: grid.clipSec,
      windows,
      turns: parsed.dialogue.map((d) => ({ speaker: d.speaker, text: d.text, startSec: d.startSec })),
    });
    // Every line placed → safe to delegate and drop the ElevenLabs dialogue leg.
    expect(speech).toMatchObject({ placed: 3, total: 3, complete: true });

    const plan = planFilmScenes('დროის წნეხი', {
      sceneScripts, totalSec: grid.totalSec, clipSec: grid.clipSec,
      nativeSpeech: true, sceneDialogue: speech.scenes,
    });
    expect(plan.scenes.map((s) => s.durationSec)).toEqual([6, 6, 6, 6]);
    expect(plan.scenes.map((s) => s.spokenLines)).toEqual([
      ['ჩვენ დრო აღარ გვაქვს.'],
      ['მე ვიცი.'],
      [], // 0:12–0:18 is a scripted pause — no line lands there
      ['სხვა გზა არ არის.'],
    ]);
    expect(plan.scenes[0]!.prompt).toContain('"ჩვენ დრო აღარ გვაქვს."');
    expect(plan.scenes[0]!.prompt).toMatch(/Man speaks aloud, in Georgian/);
    expect(plan.scenes[1]!.prompt).toMatch(/Woman speaks aloud, in Georgian/);
    // Still Veo-native: the story leads, the prompt stays bounded, no negations.
    for (const s of plan.scenes) {
      expect(s.prompt.length).toBeLessThan(1300);
      expect(s.prompt).not.toMatch(/\bNO neon\b/i);
    }
  });

  it('the VO NARRATOR spine is NOT delegated — only on-camera dialogue is', () => {
    // parseMasterScript keeps them apart (narration vs dialogue). Only `dialogue` is handed to Veo; the
    // narration spine keeps its ElevenLabs voice, because a narrator has no mouth in frame.
    expect(parsed.narration).toEqual([]);
    const turns = masterDialogueTurns(parsed, null);
    expect(turns.map((t) => t.speaker)).toEqual(['Man', 'Woman', 'Man']);
  });
});
