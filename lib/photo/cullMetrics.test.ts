/** @jest-environment node */
/**
 * The culling assistant's measurements, on synthetic frames whose answer is known: a checkerboard is as sharp as a
 * picture gets and its box blur is not; a white frame is all highlight; a 1 px shift is the same scene and a
 * different seed is not.
 */
import {
  ANALYSIS_LONG_EDGE, SHARPNESS_FLAG_BELOW, analyzePixels, dHash, exposureStats, fitWithin, groupBursts, hamming,
  laplacianSharpness, lumaOf, verdict, type BurstInput, type PhotoMetrics,
} from './cullMetrics';

type Frame = { data: Uint8ClampedArray; w: number; h: number };

function gray(w: number, h: number, f: (x: number, y: number) => number): Frame {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      const p = (y * w + x) * 4;
      data[p] = v; data[p + 1] = v; data[p + 2] = v; data[p + 3] = 255;
    }
  }
  return { data, w, h };
}

const checker = (w: number, h: number, sq = 8) => gray(w, h, (x, y) => ((Math.floor(x / sq) + Math.floor(y / sq)) % 2 ? 255 : 0));

/** Separable box blur over a `win`-pixel window (edges clamp). */
function boxBlur({ data, w, h }: Frame, win: number): Frame {
  const r = Math.floor(win / 2);
  const src = lumaOf(data, w, h);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[y * w + Math.min(w - 1, Math.max(0, x + k))]!;
      tmp[y * w + x] = s / (2 * r + 1);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]!;
      out[y * w + x] = s / (2 * r + 1);
    }
  }
  return gray(w, h, (x, y) => out[y * w + x]!);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A "photo": soft light and dark blobs on a gradient, from a seed; `dx` shifts the whole scene sideways. */
function scene(seed: number, dx = 0, w = 320, h = 240): Frame {
  const rnd = mulberry32(seed);
  const blobs = Array.from({ length: 9 }, () => ({ x: rnd() * w, y: rnd() * h, r: 20 + rnd() * 60, a: (rnd() - 0.5) * 220 }));
  const tilt = (rnd() - 0.5) * 0.6;
  return gray(w, h, (x0, y) => {
    const x = x0 - dx;
    let v = 128 + tilt * (x - w / 2);
    for (const b of blobs) v += b.a * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.r * b.r));
    return v;
  });
}

const hashOf = ({ data, w, h }: Frame) => dHash(lumaOf(data, w, h), w, h);

describe('sharpness — tiled Laplacian variance', () => {
  it('a checkerboard scores more than 10× its own 5 px blur', () => {
    const sharp = checker(128, 128);
    const soft = boxBlur(sharp, 5);
    const a = laplacianSharpness(lumaOf(sharp.data, 128, 128), 128, 128).score;
    const b = laplacianSharpness(lumaOf(soft.data, 128, 128), 128, 128).score;
    expect(b).toBeGreaterThan(0);
    expect(a / b).toBeGreaterThan(10);
  });

  it('a frame that is sharp in ONE corner is still sharp (the bokeh portrait); its global variance is not the score', () => {
    const w = 240;
    const h = 240;
    // Detail only in the top-left tile, flat grey elsewhere.
    const f = gray(w, h, (x, y) => (x < 40 && y < 40 ? ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 255 : 0) : 128));
    const s = laplacianSharpness(lumaOf(f.data, w, h), w, h);
    expect(s.score).toBeGreaterThan(s.global * 5);
    expect(s.score).toBeGreaterThan(SHARPNESS_FLAG_BELOW);
  });

  it('a flat frame and a frame too small to have a Laplacian score 0', () => {
    expect(laplacianSharpness(lumaOf(gray(64, 64, () => 90).data, 64, 64), 64, 64).score).toBe(0);
    expect(laplacianSharpness(new Float32Array(4), 2, 2).score).toBe(0);
  });
});

describe('exposure clipping', () => {
  it('an all-white frame is ~100 % clipped highlights and no crushed shadows', () => {
    const e = exposureStats(gray(64, 48, () => 255).data, 64, 48);
    expect(e.highlightClip).toBeCloseTo(1, 6);
    expect(e.shadowClip).toBe(0);
    expect(e.meanLuma).toBeCloseTo(1, 6);
  });

  it('an all-black frame is ~100 % crushed; mid-grey is neither', () => {
    expect(exposureStats(gray(32, 32, () => 0).data, 32, 32).shadowClip).toBeCloseTo(1, 6);
    const mid = exposureStats(gray(32, 32, () => 128).data, 32, 32);
    expect(mid.highlightClip).toBe(0);
    expect(mid.shadowClip).toBe(0);
  });

  it('one blown channel counts as clipped (a red sky has lost detail even when its luma looks fine)', () => {
    const data = new Uint8ClampedArray(16 * 4);
    for (let p = 0; p < data.length; p += 4) { data[p] = 255; data[p + 1] = 40; data[p + 2] = 40; data[p + 3] = 255; }
    expect(exposureStats(data, 4, 4).highlightClip).toBe(1);
  });
});

describe('dHash', () => {
  it('a 1 px shift is the same scene (≤ 4 bits); an unrelated scene is ≥ 20 bits away', () => {
    for (const seed of [1, 7, 42]) {
      const a = hashOf(scene(seed));
      expect(hamming(a, hashOf(scene(seed, 1)))).toBeLessThanOrEqual(4);
      expect(hamming(a, hashOf(scene(seed + 1000)))).toBeGreaterThanOrEqual(20);
    }
  });

  it('is 16 hex characters and survives a rescale', () => {
    const big = scene(3, 0, 640, 480);
    // The same frame at half size (2 × 2 box average) — what a thumbnail or a re-export would be.
    const bl = lumaOf(big.data, big.w, big.h);
    const small = gray(320, 240, (x, y) => (bl[2 * y * 640 + 2 * x]! + bl[2 * y * 640 + 2 * x + 1]! + bl[(2 * y + 1) * 640 + 2 * x]! + bl[(2 * y + 1) * 640 + 2 * x + 1]!) / 4);
    const a = hashOf(big);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hamming(a, hashOf(small))).toBeLessThanOrEqual(4);
  });

  it('hamming: identical → 0, anything that is not a dHash → 64', () => {
    expect(hamming('0123456789abcdef', '0123456789abcdef')).toBe(0);
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hamming('0000000000000000', '0000000000000001')).toBe(1);
    expect(hamming('nope', '0000000000000000')).toBe(64);
  });
});

describe('bursts', () => {
  const m = (seed: number, dx: number, sharpness: number, takenAt: number | null = null, id = `${seed}-${dx}`): BurstInput => ({
    id, hash: hashOf(scene(seed, dx)), sharpness, takenAt,
  });

  it('neighbouring frames of one scene form a burst; the sharpest is marked best; a new scene starts a new group', () => {
    const items = [m(5, 0, 300), m(5, 1, 900), m(5, 2, 500), m(77, 0, 400), m(78, 0, 400)];
    const g = groupBursts(items);
    const b = items.map((it) => g.get(it.id)!);
    expect(b.slice(0, 3).map((x) => x.burstId)).toEqual(['5-0', '5-0', '5-0']);
    expect(b.slice(0, 3).map((x) => x.size)).toEqual([3, 3, 3]);
    expect(b.slice(0, 3).map((x) => x.best)).toEqual([false, true, false]);
    expect(b[0]!.bestSharpness).toBe(900);
    expect(b[3]!.size).toBe(1);
    expect(b[3]!.best).toBe(false); // a single frame is not "the best of its burst"
    expect(b[4]!.burstId).toBe('78-0');
  });

  it('a long gap between capture times splits the same view into two visits', () => {
    const items = [m(5, 0, 300, 0, 'a'), m(5, 1, 300, 1_000, 'b'), m(5, 2, 300, 60_000, 'c')];
    const g = groupBursts(items);
    expect(g.get('a')!.burstId).toBe('a');
    expect(g.get('b')!.burstId).toBe('a');
    expect(g.get('c')!.burstId).toBe('c');
  });

  it('a frame not analysed yet (no hash) belongs to no burst and splits its neighbours', () => {
    const items: BurstInput[] = [m(5, 0, 300, null, 'a'), { id: 'x', hash: null, sharpness: null, takenAt: null }, m(5, 1, 300, null, 'b')];
    const g = groupBursts(items);
    expect(g.get('a')!.size).toBe(1);
    expect(g.get('x')!.size).toBe(1);
    expect(g.get('b')!.size).toBe(1);
  });
});

describe('verdict — flags, never rejects', () => {
  const metrics = (over: Partial<PhotoMetrics>): PhotoMetrics => ({
    sharpness: 500, sharpnessGlobal: 200, meanLuma: 0.45, highlightClip: 0, shadowClip: 0, hash: '0'.repeat(16), ...over,
  });

  it('a sharp, well-exposed frame is ok', () => {
    expect(verdict(metrics({}))).toEqual({ flags: [], advice: 'ok' });
  });

  it('the worst frame imaginable is flagged for review — and that is all the assistant says', () => {
    const v = verdict(metrics({ sharpness: 1, meanLuma: 0.01, shadowClip: 0.99 }));
    expect(v.flags).toEqual(['blurry', 'underexposed']);
    expect(v.advice).toBe('review');
    expect(JSON.stringify(v)).not.toMatch(/reject/i);
  });

  it('blown highlights and a burst frame much softer than its best are pointed out', () => {
    expect(verdict(metrics({ highlightClip: 0.4 })).flags).toEqual(['highlights']);
    const burst = { burstId: 'a', size: 3, index: 1, best: false, bestSharpness: 2000 };
    expect(verdict(metrics({ sharpness: 600 }), burst).flags).toEqual(['burst-softer']);
    expect(verdict(metrics({ sharpness: 1500 }), burst).flags).toEqual([]);
    expect(verdict(metrics({ sharpness: 600 }), { ...burst, best: true }).flags).toEqual([]);
  });

  it('analyzePixels measures a real frame end to end', () => {
    const f = checker(96, 64);
    const a = analyzePixels(f.data, f.w, f.h);
    expect(a.sharpness).toBeGreaterThan(SHARPNESS_FLAG_BELOW);
    expect(a.meanLuma).toBeGreaterThan(0.4);
    expect(a.highlightClip).toBeCloseTo(0.5, 1);
    expect(a.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(verdict(a).flags).toEqual(['highlights', 'underexposed']); // half white, half black — both ends clip
  });
});

describe('fitWithin', () => {
  it('scales the long edge down to the analysis size and never up', () => {
    expect(fitWithin(6000, 4000, ANALYSIS_LONG_EDGE)).toEqual({ w: 1024, h: 683 });
    expect(fitWithin(3000, 4500, ANALYSIS_LONG_EDGE)).toEqual({ w: 683, h: 1024 });
    expect(fitWithin(300, 200, ANALYSIS_LONG_EDGE)).toEqual({ w: 300, h: 200 });
    expect(fitWithin(0, 0, 100)).toEqual({ w: 1, h: 1 });
  });
});
