import {
  DEFAULT_VAD_CONFIG,
  bargeConfig,
  createVadState,
  onsetThreshold,
  stepVad,
  shouldCommit,
  extForMime,
  type VadConfig,
  type VadState,
  type VadEvent,
} from './vad';

// Frozen floor (floorAttack:0) → the onset/barge thresholds are constant, so every timing
// below is exact. floor 0.01 → listening onset = max(0.015, 0.032) = 0.032; barge = 0.055 (bargeMult 5.5).
const CFG: VadConfig = { ...DEFAULT_VAD_CONFIG, floorAttack: 0 };
const LOUD = 0.5;
const QUIET = 0;

function run(
  start: VadState,
  samples: number[],
  opts: { assistantSpeaking?: boolean; graceUntilMs?: number; cfg?: VadConfig },
  cfgRun: { dt?: number; stopOnTerminal?: boolean } = {},
): { state: VadState; events: VadEvent[]; lastT: number } {
  const dt = cfgRun.dt ?? 50;
  const stop = cfgRun.stopOnTerminal ?? true;
  const full = { assistantSpeaking: false, graceUntilMs: 0, cfg: CFG, ...opts };
  let state = start;
  let t = 0;
  const events: VadEvent[] = [];
  for (const rms of samples) {
    const r = stepVad(state, rms, t, full);
    state = r.state;
    events.push(r.event);
    const terminal = r.event === 'endpoint' || r.event === 'max-utterance' || r.event === 'barge-onset';
    t += dt;
    if (stop && terminal) break;
  }
  return { state, events, lastT: t };
}

describe('stepVad — onset', () => {
  test('pure silence never triggers speech', () => {
    const { events, state } = run(createVadState(0.01), Array(20).fill(QUIET), {}, { stopOnTerminal: false });
    expect(events).toEqual(Array(20).fill('none'));
    expect(state.phase).toBe('idle');
  });

  test('onset fires only after onsetMs of sustained speech', () => {
    // 50ms cadence, onsetMs 140 → sustain crosses at the 4th sample (t=150 ≥ 140)
    const { events } = run(createVadState(0.01), Array(6).fill(LOUD), {}, { stopOnTerminal: false });
    expect(events.slice(0, 3)).toEqual(['none', 'none', 'none']);
    expect(events[3]).toBe('onset');
    expect(events.filter((e) => e === 'onset')).toHaveLength(1);
  });

  test('a sub-onsetMs blip (cough/click) never triggers', () => {
    // two loud frames (100ms < 140ms) then silence
    const { events } = run(createVadState(0.01), [LOUD, LOUD, QUIET, QUIET, QUIET], {}, { stopOnTerminal: false });
    expect(events).not.toContain('onset');
  });

  test('REGRESSION: a soft/normal speaker is not deafened by the adaptive floor (blocker)', () => {
    // Live cfg (floorAttack 0.08, NOT the frozen test cfg). A steady soft voice at rms 0.05 must
    // still cross onset — the floor must NOT chase it upward during the debounce window.
    const { events } = run(createVadState(0.008), Array(6).fill(0.05), { cfg: DEFAULT_VAD_CONFIG }, { stopOnTerminal: false });
    expect(events).toContain('onset');
  });
});

describe('stepVad — endpoint', () => {
  test('endpoint fires ~hangoverMs after speech stops, with voiced time accrued', () => {
    // 10 loud (onset + ~300ms voiced) then silence until the 850ms hangover elapses
    const samples = [...Array(10).fill(LOUD), ...Array(30).fill(QUIET)];
    const { events, state } = run(createVadState(0.01), samples, {});
    expect(events).toContain('onset');
    expect(events[events.length - 1]).toBe('endpoint');
    expect(events.indexOf('onset')).toBeLessThan(events.lastIndexOf('endpoint'));
    expect(state.voicedMs).toBeGreaterThanOrEqual(DEFAULT_VAD_CONFIG.minSpeechMs);
  });

  test('REGRESSION: a genuine short word (~400ms) clears the commit gate (high)', () => {
    // 8 loud frames (onset sustain credited + accrued voiced) then silence to endpoint.
    const samples = [...Array(8).fill(LOUD), ...Array(30).fill(QUIET)];
    const { events, state } = run(createVadState(0.01), samples, {});
    expect(events[events.length - 1]).toBe('endpoint');
    expect(shouldCommit(state.voicedMs, 5000, DEFAULT_VAD_CONFIG)).toBe(true);
  });

  test('a brief dip below onset does not end the utterance prematurely', () => {
    // onset, sustained speech, a single quiet frame (50ms << 850ms hangover), then more speech
    const samples = [...Array(6).fill(LOUD), QUIET, ...Array(6).fill(LOUD)];
    const { events } = run(createVadState(0.01), samples, {}, { stopOnTerminal: false });
    expect(events).not.toContain('endpoint');
  });

  test('maxUtterance force-endpoints a runaway (never-ending speech)', () => {
    const cfg: VadConfig = { ...CFG, maxUtteranceMs: 500 };
    const { events } = run(createVadState(0.01), Array(30).fill(LOUD), { cfg });
    expect(events[events.length - 1]).toBe('max-utterance');
  });
});

describe('stepVad — barge-in (assistant speaking)', () => {
  test('sustained overtalk above the barge threshold fires barge-onset', () => {
    const cfg = bargeConfig(CFG);
    const { events } = run(createVadState(0.01), Array(6).fill(LOUD), { assistantSpeaking: true, cfg });
    expect(events[events.length - 1]).toBe('barge-onset');
    expect(events.filter((e) => e === 'barge-onset')).toHaveLength(1);
  });

  test('the per-chunk grace window suppresses barge (assistant audio transient)', () => {
    const cfg = bargeConfig(CFG);
    // grace until 300ms: the first 6 frames (t=0..250) are suppressed
    const { events } = run(createVadState(0.01), Array(20).fill(LOUD), { assistantSpeaking: true, graceUntilMs: 300, cfg });
    expect(events.slice(0, 6)).toEqual(Array(6).fill('none'));
    expect(events).toContain('barge-onset');
  });

  test('barge threshold is strictly higher than the listening onset (state gate)', () => {
    // 0.038: above the 0.032 listening onset, below the 0.055 barge onset (bargeMult 5.5)
    const mid = 0.038;
    const listening = run(createVadState(0.01), Array(8).fill(mid), { assistantSpeaking: false }, { stopOnTerminal: false });
    expect(listening.events).toContain('onset');
    const speaking = run(createVadState(0.01), Array(8).fill(mid), { assistantSpeaking: true, cfg: bargeConfig(CFG) }, { stopOnTerminal: false });
    expect(speaking.events).not.toContain('barge-onset');
  });
});

describe('stepVad — adaptive floor gating', () => {
  test('floor does NOT adapt while the assistant is speaking', () => {
    const start = createVadState(0.01);
    const cfg = { ...DEFAULT_VAD_CONFIG }; // adaptation ON
    let s = start;
    for (let i = 0; i < 10; i++) s = stepVad(s, 0.03, i * 50, { assistantSpeaking: true, graceUntilMs: 0, cfg }).state;
    expect(s.floor).toBeCloseTo(0.01, 5);
  });

  test('floor does NOT adapt inside the grace window', () => {
    const start = createVadState(0.01);
    const cfg = { ...DEFAULT_VAD_CONFIG };
    let s = start;
    for (let i = 0; i < 10; i++) s = stepVad(s, 0.03, i * 50, { assistantSpeaking: false, graceUntilMs: 10_000, cfg }).state;
    expect(s.floor).toBeCloseTo(0.01, 5);
  });

  test('floor DOES adapt upward toward a steady ambient while idle', () => {
    const start = createVadState(0.01);
    const cfg = { ...DEFAULT_VAD_CONFIG };
    let s = start;
    for (let i = 0; i < 30; i++) s = stepVad(s, 0.03, i * 50, { assistantSpeaking: false, graceUntilMs: 0, cfg }).state;
    expect(s.floor).toBeGreaterThan(0.01);
    expect(s.floor).toBeLessThanOrEqual(cfg.floorMax);
  });
});

describe('stepVad — robustness', () => {
  test('non-finite / out-of-range rms is coerced (never throws, treated quiet/clamped)', () => {
    const start = createVadState(0.01);
    expect(() => run(start, [Number.NaN, Number.POSITIVE_INFINITY, -5, 0], {}, { stopOnTerminal: false })).not.toThrow();
  });

  test('ms-based timing is frame-rate independent (same events at 50ms and 150ms cadence)', () => {
    const samples = [...Array(10).fill(LOUD), ...Array(30).fill(QUIET)];
    const a = run(createVadState(0.01), samples, {}, { dt: 50 });
    const b = run(createVadState(0.01), samples, {}, { dt: 150 });
    const seq = (e: VadEvent[]) => e.filter((x) => x !== 'none');
    expect(seq(a.events)).toEqual(['onset', 'endpoint']);
    expect(seq(b.events)).toEqual(['onset', 'endpoint']);
  });
});

describe('helpers', () => {
  test('onsetThreshold respects the absolute floor', () => {
    expect(onsetThreshold(0, CFG)).toBe(CFG.absOnsetFloor);
    expect(onsetThreshold(0.02, CFG)).toBeCloseTo(0.064, 5); // 0.02 * 3.2
  });

  test('bargeConfig lifts onsetMult→bargeMult / onsetMs→bargeOnsetMs without mutating base', () => {
    const base = { ...DEFAULT_VAD_CONFIG };
    const b = bargeConfig(base);
    expect(b.onsetMult).toBe(base.bargeMult);
    expect(b.onsetMs).toBe(base.bargeOnsetMs);
    expect(base.onsetMult).toBe(DEFAULT_VAD_CONFIG.onsetMult); // untouched
  });

  test('createVadState returns an independent fresh state each call', () => {
    const a = createVadState();
    const b = createVadState();
    a.phase = 'speech';
    expect(b.phase).toBe('idle');
  });

  test('shouldCommit gates on both voiced time and byte length', () => {
    expect(shouldCommit(299, 5000, DEFAULT_VAD_CONFIG)).toBe(false); // too little speech
    expect(shouldCommit(400, 512, DEFAULT_VAD_CONFIG)).toBe(false); // blob at/under floor
    expect(shouldCommit(400, 5000, DEFAULT_VAD_CONFIG)).toBe(true);
  });

  test('extForMime maps every recorded container (iOS mp4 load-bearing)', () => {
    expect(extForMime('audio/webm')).toBe('webm');
    expect(extForMime('audio/mp4')).toBe('mp4');
    expect(extForMime('audio/aac')).toBe('m4a');
    expect(extForMime('audio/mpeg')).toBe('mp3');
    expect(extForMime('audio/wav')).toBe('wav');
    expect(extForMime('')).toBe('webm');
  });
});
