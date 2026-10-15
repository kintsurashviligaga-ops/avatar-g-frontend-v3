import {
  LOUDER_PEAK_LIMIT, MAX_EDIT_OUTPUT_SEC, audioFilters, canonicalJson, cleanCaption, displayDims, editNameFor, qcEdit,
  eraseVf, renderArgs, resolveEdits, validateEditRequest, videoFilters, type EditRequest,
} from './editPlan';
import type { BannerProbe } from '@/lib/video/probeBanner';

const SRC: BannerProbe = { durationSec: 30.004, hasVideo: true, hasAudio: true, width: 1920, height: 1080, rotation: 0, videoCodec: 'h264', audioCodec: 'aac' };
const PHONE: BannerProbe = { ...SRC, width: 1920, height: 1080, rotation: -90, videoCodec: 'hevc' };

function plan(asks: unknown[], src: BannerProbe = SRC) {
  const r = resolveEdits(asks, src);
  if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
  return r;
}

function request(asks: unknown[], src: BannerProbe = SRC): EditRequest {
  const r = plan(asks, src);
  return { v: 1, source: { ref: 'uploads/u1/clip.mp4' }, edits: r.edits, name: `clip-${r.plan.output === 'jpg' ? 'thumbnail' : 'edit'}.${r.plan.output}`, plan: r.plan };
}

describe('resolveEdits: the asks → the stored edits and what the result will be', () => {
  test('a trim range, then a speed: the result is the kept part at the new speed', () => {
    const r = plan([{ op: 'speed', factor: 2 }, { op: 'trim', fromSec: 5, toSec: 15 }]);
    expect(r.edits).toEqual([{ op: 'trim', fromSec: 5, toSec: 15 }, { op: 'speed', factor: 2 }]); // the one order
    expect(r.plan).toMatchObject({ output: 'mp4', durationSec: 5, hasAudio: true, width: 1920, height: 1080, copyVideo: false, sourceSec: 30 });
  });

  test('the four ways to ask for a trim', () => {
    expect(plan([{ op: 'trim', toSec: 10 }]).edits[0]).toEqual({ op: 'trim', fromSec: 0, toSec: 10 });
    expect(plan([{ op: 'trim', fromSec: 10 }]).edits[0]).toEqual({ op: 'trim', fromSec: 10, toSec: 30 });
    expect(plan([{ op: 'trim', lastSec: 5 }]).edits[0]).toEqual({ op: 'trim', fromSec: 25, toSec: 30 });
    expect(plan([{ op: 'trim', cutEndSec: 5 }]).edits[0]).toEqual({ op: 'trim', fromSec: 0, toSec: 25 });
  });

  test('a trim past the end, of nothing, of everything, or twice-specified is refused', () => {
    expect(resolveEdits([{ op: 'trim', fromSec: 40 }], SRC)).toMatchObject({ ok: false, error: 'out_of_range' });
    expect(resolveEdits([{ op: 'trim', toSec: 45 }], SRC)).toMatchObject({ ok: false, error: 'out_of_range' });
    expect(resolveEdits([{ op: 'trim', fromSec: 5, toSec: 5.2 }], SRC)).toMatchObject({ ok: false, error: 'too_short' });
    expect(resolveEdits([{ op: 'trim', fromSec: 0, toSec: 30 }], SRC)).toMatchObject({ ok: false, error: 'nothing_to_do' });
    expect(resolveEdits([{ op: 'trim', lastSec: 5, fromSec: 1 }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'trim', lastSec: 31 }], SRC)).toMatchObject({ ok: false, error: 'out_of_range' });
    // A rounded end a hair past the end ends at the end.
    expect(plan([{ op: 'trim', fromSec: 2, toSec: 30.2 }]).edits[0]).toEqual({ op: 'trim', fromSec: 2, toSec: 30 });
  });

  test('limits: speed 0.25–4, fades up to 10 s and not longer than the video, volume −30…+20 dB', () => {
    expect(resolveEdits([{ op: 'speed', factor: 5 }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'speed', factor: 1 }], SRC)).toMatchObject({ ok: false, error: 'nothing_to_do' });
    expect(resolveEdits([{ op: 'fade', inSec: 11 }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'trim', toSec: 2 }, { op: 'fade', inSec: 1.5, outSec: 1.5 }], SRC)).toMatchObject({ ok: false, error: 'conflict' });
    expect(resolveEdits([{ op: 'volume', db: 40 }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'volume', db: 0.2 }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
  });

  test('a result over the limit is refused (slowing a long clip down), with a way out', () => {
    const r = resolveEdits([{ op: 'speed', factor: 0.25 }], { ...SRC, durationSec: 100 });
    expect(r).toMatchObject({ ok: false, error: 'too_long' });
    expect(MAX_EDIT_OUTPUT_SEC).toBe(300);
    expect(plan([{ op: 'trim', toSec: 60 }, { op: 'speed', factor: 0.25 }], { ...SRC, durationSec: 600 }).plan.durationSec).toBe(240);
  });

  test('what goes together: a thumbnail is a still; mute and volume exclude each other; no sound to change', () => {
    expect(resolveEdits([{ op: 'thumbnail' }, { op: 'trim', toSec: 5 }], SRC)).toMatchObject({ ok: false, error: 'conflict' });
    expect(resolveEdits([{ op: 'mute' }, { op: 'volume', db: 6 }], SRC)).toMatchObject({ ok: false, error: 'conflict' });
    expect(resolveEdits([{ op: 'volume', db: 6 }], { ...SRC, hasAudio: false })).toMatchObject({ ok: false, error: 'conflict' });
    expect(resolveEdits([{ op: 'grade', style: 'noir' }, { op: 'grade', style: 'neon' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'blur' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([], SRC)).toMatchObject({ ok: false, error: 'nothing_to_do' });
    expect(resolveEdits([{ op: 'trim', toSec: 5 }], { ...SRC, hasVideo: false })).toMatchObject({ ok: false, error: 'no_video' });
  });

  test('a thumbnail: a JPEG of the frame at 1 s (or the asked time), framed and graded', () => {
    const r = plan([{ op: 'thumbnail' }, { op: 'aspect', to: '9:16' }, { op: 'grade', style: 'cinematic' }]);
    expect(r.edits).toEqual([{ op: 'aspect', to: '9:16', fit: 'crop' }, { op: 'grade', style: 'cinematic' }, { op: 'thumbnail', atSec: 1 }]);
    expect(r.plan).toMatchObject({ output: 'jpg', durationSec: 0, hasAudio: false, width: 1080, height: 1920 });
    expect(plan([{ op: 'thumbnail', atSec: 12.5 }]).edits[0]).toEqual({ op: 'thumbnail', atSec: 12.5 });
    expect(resolveEdits([{ op: 'thumbnail', atSec: 31 }], SRC)).toMatchObject({ ok: false, error: 'out_of_range' });
  });

  test('a phone clip (coded landscape, rotated −90°) is portrait; the frame is planned as it is shown', () => {
    expect(displayDims(PHONE)).toEqual({ width: 1080, height: 1920 });
    expect(plan([{ op: 'grade', style: 'noir' }], PHONE).plan).toMatchObject({ width: 1080, height: 1920, copyVideo: false });
    expect(plan([{ op: 'trim', toSec: 3 }], { ...SRC, width: 1081, height: 607 }).plan).toMatchObject({ width: 1080, height: 606 });
  });

  test('sound-only edits of an H.264 video keep its picture as it is (no re-encode)', () => {
    expect(plan([{ op: 'mute' }]).plan).toMatchObject({ copyVideo: true, hasAudio: false, durationSec: 30 });
    expect(plan([{ op: 'volume', db: -6 }]).plan).toMatchObject({ copyVideo: true, hasAudio: true });
    expect(plan([{ op: 'volume', db: -6 }], PHONE).plan.copyVideo).toBe(false); // HEVC: re-encoded to H.264 for every browser
  });

  test('a caption is one clean line', () => {
    expect(cleanCaption('  გამარჯობა\n‮world\u0007  ')).toBe('გამარჯობა world');
    expect(cleanCaption('x'.repeat(300))).toHaveLength(120);
    expect(resolveEdits([{ op: 'caption', text: ' \n ' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
  });
});

describe('validateEditRequest: the stored request passes the quote\'s own checks again', () => {
  test('a quoted request round-trips', () => {
    for (const asks of [
      [{ op: 'trim', fromSec: 1.234, toSec: 9.999 }, { op: 'fade', inSec: 0.5, outSec: 0.5 }],
      [{ op: 'thumbnail', atSec: 29.994 }],
      [{ op: 'mute' }],
      [{ op: 'aspect', to: '4:5', fit: 'pad' }, { op: 'caption', text: 'Hello' }, { op: 'volume', db: 3.33 }],
      [{ op: 'speed', factor: 0.333 }, { op: 'trim', toSec: 20 }],
    ]) {
      const req = request(asks);
      expect(validateEditRequest(JSON.parse(JSON.stringify(req)))).not.toBeNull();
    }
  });

  // DEFECT_REGISTER_FINAL row 39, found by the CI E2E on a real Supabase stack: the worker reads the request back from
  // generation_jobs.params (JSONB), which returns an object's keys shorter-first, and the old check compared the
  // edits as strings in the order written: every stored trim was refused as `invalid_request`, while 2× passed
  // (`{ op, factor }` keeps its order). JSON.parse(JSON.stringify()) above keeps the order, so it never showed here.
  test('a request read back from JSONB, keys in JSONB\'s own order, passes too', () => {
    // Postgres orders a jsonb object's keys by length, then bytewise (jsonb's uniqueifyJsonbObject).
    const jsonbOrder = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(jsonbOrder);
      if (!v || typeof v !== 'object') return v;
      const keys = Object.keys(v).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
      return Object.fromEntries(keys.map((k) => [k, jsonbOrder((v as Record<string, unknown>)[k])]));
    };
    const trim = jsonbOrder(JSON.parse(JSON.stringify(request([{ op: 'trim', fromSec: 1, toSec: 4 }])))) as EditRequest;
    expect(Object.keys(trim.edits[0]!)).toEqual(['op', 'toSec', 'fromSec']); // the premise: JSONB does reorder a trim
    expect(validateEditRequest(trim)).not.toBeNull();
    for (const asks of [
      [{ op: 'trim', fromSec: 1.234, toSec: 9.999 }, { op: 'fade', inSec: 0.5, outSec: 0.5 }],
      [{ op: 'speed', factor: 2 }],
      [{ op: 'thumbnail', atSec: 29.994 }],
      [{ op: 'aspect', to: '4:5', fit: 'pad' }, { op: 'caption', text: 'Hello' }, { op: 'volume', db: 3.33 }],
      [{ op: 'adjust', brightness: 25, warmth: 40 }],
      [{ op: 'motion', zoom: 'in', shake: true }],
      [{ op: 'overlay', look: 'grain' }, { op: 'grade', style: 'noir' }],
      [{ op: 'trim', fromSec: 2, toSec: 12 }, { op: 'erase', boxes: [{ at: 'bottom', lastSec: 4 }] }, { op: 'aspect', to: '1:1' }],
      [{ op: 'layers', add: [{ kind: 'text', role: 'cta', text: 'Order now', lastSec: 3 }] }],
    ]) {
      const stored = jsonbOrder(JSON.parse(JSON.stringify(request(asks)))) as EditRequest;
      expect({ asks, ok: validateEditRequest(stored) !== null }).toEqual({ asks, ok: true });
    }
    // Key order is all it forgives: a changed value is still refused.
    expect(validateEditRequest({ ...trim, edits: [{ op: 'trim', toSec: 5, fromSec: 1 }] } as unknown as EditRequest)).toBeNull();
  });

  test('canonicalJson: one string whatever the key order, arrays kept in theirs', () => {
    expect(canonicalJson({ op: 'trim', toSec: 4, fromSec: 1 })).toBe(canonicalJson({ fromSec: 1, op: 'trim', toSec: 4 }));
    expect(canonicalJson([{ b: 1, a: { d: 2, c: 3 } }])).toBe('[{"a":{"c":3,"d":2},"b":1}]');
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson(null)).toBe('null');
  });

  test('a changed edit, plan or name is refused', () => {
    const req = request([{ op: 'trim', fromSec: 5, toSec: 15 }]);
    expect(validateEditRequest({ ...req, edits: [{ op: 'trim', fromSec: 5, toSec: 25 }] })).toBeNull(); // length no longer matches
    expect(validateEditRequest({ ...req, plan: { ...req.plan, durationSec: 400 } })).toBeNull();
    expect(validateEditRequest({ ...req, name: '../x.mp4' })).toBeNull();
    expect(validateEditRequest({ ...req, name: 'x.jpg' })).toBeNull();
    expect(validateEditRequest({ ...req, source: { ref: '' } })).toBeNull();
    expect(validateEditRequest({ ...req, edits: [{ op: 'speed', factor: 1 }] })).toBeNull();
    expect(validateEditRequest({ ...req, v: 2 })).toBeNull();
    expect(validateEditRequest(null)).toBeNull();
  });
});

describe('the ffmpeg arguments', () => {
  test('trim + speed + aspect + grade + fade: input seek, one simple -vf chain, the sound sped up and faded', () => {
    const req = request([
      { op: 'trim', fromSec: 5, toSec: 15 }, { op: 'speed', factor: 2 }, { op: 'aspect', to: '9:16', fit: 'crop' },
      { op: 'grade', style: 'noir' }, { op: 'fade', inSec: 1, outSec: 1 },
    ]);
    const args = renderArgs(req, 'https://x/in.mp4', '/tmp/out.mp4');
    expect(args.slice(0, 8)).toEqual(['-hide_banner', '-y', '-ss', '5', '-t', '10', '-i', 'https://x/in.mp4']);
    expect(args).not.toContain('-filter_complex'); // a phone clip keeps its rotation
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toBe([
      'setpts=0.5000*PTS,fps=30',
      'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p',
      'hue=s=0,eq=contrast=1.25:brightness=-0.02,vignette=PI/4',
      'fade=t=in:st=0:d=1', 'fade=t=out:st=4:d=1', 'format=yuv420p',
    ].join(','));
    expect(args[args.indexOf('-af') + 1]).toBe('atempo=2.0000,afade=t=in:st=0:d=1,afade=t=out:st=4:d=1');
    expect(args).toEqual(expect.arrayContaining(['-map', '0:v:0', '0:a:0', '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', '-map_metadata', '-1']));
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });

  test('no frame change: the frame is only rounded to even; no sound edit: the sound is re-encoded as it is', () => {
    const req = request([{ op: 'grade', style: 'vintage' }]);
    expect(videoFilters(req)).toEqual(['scale=trunc(iw/2)*2:trunc(ih/2)*2', 'curves=vintage', 'format=yuv420p']);
    expect(audioFilters(req)).toEqual([]);
    expect(renderArgs(req, 'in', 'out')).not.toContain('-af');
  });

  test('mute copies the picture and drops the sound; volume copies the picture and changes the sound', () => {
    const mute = renderArgs(request([{ op: 'mute' }]), 'in', 'out');
    expect(mute).toEqual(expect.arrayContaining(['-c:v', 'copy', '-an']));
    expect(mute).not.toContain('-vf');
    expect(mute).not.toContain('0:a:0');
    const vol = renderArgs(request([{ op: 'volume', db: -6 }]), 'in', 'out');
    expect(vol).toEqual(expect.arrayContaining(['-c:v', 'copy', '-af', 'volume=-6dB', '-c:a', 'aac']));
  });

  test('louder holds the peak under full scale; quieter needs no limiter (Production 2026-10-13: +6 dB peaked at +2.4 dBFS)', () => {
    expect(audioFilters(request([{ op: 'volume', db: 6 }]))).toEqual(['volume=6dB', `alimiter=limit=${LOUDER_PEAK_LIMIT}:level=disabled`]);
    expect(audioFilters(request([{ op: 'volume', db: -6 }]))).toEqual(['volume=-6dB']);
    // 2 dB under full scale: the AAC encoder after the limiter overshoots by up to ~1.3 dB (CI 2026-10-13).
    expect(20 * Math.log10(LOUDER_PEAK_LIMIT)).toBeLessThanOrEqual(-2);
  });

  test('a silent source: no sound map, -an', () => {
    const args = renderArgs(request([{ op: 'speed', factor: 2 }], { ...SRC, hasAudio: false }), 'in', 'out');
    expect(args).toContain('-an');
    expect(args).not.toContain('-af');
    expect(args).not.toContain('0:a:0');
  });

  test('a thumbnail: one frame at the asked time as a JPEG; with a caption, a PNG first', () => {
    const plain = renderArgs(request([{ op: 'thumbnail', atSec: 3 }, { op: 'aspect', to: '1:1', fit: 'pad' }]), 'in', 'out.jpg');
    expect(plain.slice(0, 6)).toEqual(['-hide_banner', '-y', '-ss', '3', '-i', 'in']);
    expect(plain).toEqual(expect.arrayContaining(['-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2']));
    expect(plain[plain.indexOf('-vf') + 1]).toBe('scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1');
    const captioned = renderArgs(request([{ op: 'thumbnail' }, { op: 'caption', text: 'Hi' }]), 'in', 'mid.png');
    expect(captioned).toEqual(expect.arrayContaining(['-c:v', 'png']));
    expect(captioned).not.toContain('-vf'); // nothing to change in the frame itself
  });

  test('a caption is a second pass (./layerPass): the first pass is written finer, the layers go on it', () => {
    const first = renderArgs(request([{ op: 'caption', text: 'Hi' }]), 'in', 'mid.mp4');
    expect(first[first.indexOf('-crf') + 1]).toBe('18'); // finer: it is encoded once more
  });
});

describe('editNameFor', () => {
  test('the source\'s own name, never a path', () => {
    expect(editNameFor('uploads/u1/My Trip.MOV', 'mp4')).toBe('My Trip-edit.mp4');
    expect(editNameFor('https://x.supabase.co/storage/v1/object/sign/renders/films/a%20b.mp4?token=1', 'jpg')).toBe('a b-thumbnail.jpg');
    expect(editNameFor('../../etc/passwd', 'mp4')).toBe('passwd-edit.mp4');
    expect(editNameFor(null, 'mp4')).toBe('video-edit.mp4');
  });
});

describe('qcEdit', () => {
  const out = (p: Partial<BannerProbe>): BannerProbe => ({ ...SRC, durationSec: 5, width: 1080, height: 1920, ...p });
  const p = request([{ op: 'trim', fromSec: 5, toSec: 15 }, { op: 'speed', factor: 2 }, { op: 'aspect', to: '9:16', fit: 'crop' }]).plan;

  test('passes a result that matches the plan', () => {
    expect(qcEdit(out({}), p, 50_000)).toEqual({ ok: true, problems: [], durationSec: 5 });
    expect(qcEdit(out({ durationSec: 5.4 }), p, 50_000).ok).toBe(true);
  });

  test('refuses a wrong length, frame, codec, missing or extra sound, or an empty file', () => {
    expect(qcEdit(out({ durationSec: 6 }), p, 50_000).problems).toEqual(['length 6.00s, planned 5.00s']);
    expect(qcEdit(out({ width: 1920, height: 1080 }), p, 50_000).problems[0]).toMatch(/^frame 1920x1080/);
    expect(qcEdit(out({ videoCodec: 'hevc' }), p, 50_000).problems).toEqual(['picture codec hevc']);
    expect(qcEdit(out({ hasAudio: false }), p, 50_000).problems).toEqual(['the sound is missing']);
    expect(qcEdit(out({}), { ...p, hasAudio: false }, 50_000).problems).toEqual(['sound that should be gone']);
    expect(qcEdit(out({}), p, 10).problems).toEqual(['only 10 bytes']);
    expect(qcEdit(null, p, 50_000).ok).toBe(false);
  });

  test('a picture: one MJPEG frame of the planned size', () => {
    const still = request([{ op: 'thumbnail' }]).plan;
    expect(qcEdit({ ...SRC, durationSec: 0.04, hasAudio: false, videoCodec: 'mjpeg' }, still, 90_000).ok).toBe(true);
    expect(qcEdit({ ...SRC, durationSec: 0.04, hasAudio: false, videoCodec: 'png' }, still, 90_000).problems).toEqual(['picture codec png']);
  });
});

describe('the overlay edit', () => {
  test('light leaks by default, film grain when asked; it changes no length and re-encodes the picture', () => {
    expect(plan([{ op: 'overlay' }]).edits).toEqual([{ op: 'overlay', look: 'light-leak' }]);
    const r = plan([{ op: 'overlay', look: 'grain' }, { op: 'grade', style: 'noir' }]);
    expect(r.edits).toContainEqual({ op: 'overlay', look: 'grain' });
    expect(r.plan).toMatchObject({ output: 'mp4', durationSec: 30, copyVideo: false });
  });

  test('another look is refused by name', () => {
    expect(resolveEdits([{ op: 'overlay', look: 'sparkles' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
  });

  test('the stored request with an overlay passes its own checks again', () => {
    expect(validateEditRequest(JSON.parse(JSON.stringify(request([{ op: 'overlay' }]))))).not.toBeNull();
  });
});

describe('erase: what is in the picture itself, filled in from around its place (GG 2026-10-11 17:38Z)', () => {
  test('a named place takes its box; numbers are taken as they are; the plan keeps the source frame', () => {
    const r = plan([{ op: 'erase', boxes: [{ at: 'top-right' }, { x: 0.4, y: 0.4, w: 0.1, h: 0.05 }] }]);
    expect(r.edits).toEqual([{ op: 'erase', boxes: [{ x: 0.69, y: 0.01, w: 0.3, h: 0.14, at: 'top-right' }, { x: 0.4, y: 0.4, w: 0.1, h: 0.05 }] }]);
    expect(r.plan).toMatchObject({ output: 'mp4', durationSec: 30, width: 1920, height: 1080, frame: { width: 1920, height: 1080 }, copyVideo: false });
  });

  test('delogo in pixels of the frame as shown, before the frame changes, one pixel of picture kept around it', () => {
    const req = request([{ op: 'aspect', to: '9:16' }, { op: 'erase', at: 'bottom' }]);
    const vf = videoFilters(req);
    expect(vf[0]).toBe('delogo=x=58:y=864:w=1805:h=205');
    expect(vf[1]).toMatch(/^scale=|crop|pad/);
    // A phone clip: the shown frame is portrait, and the boxes are of it.
    const phone = request([{ op: 'erase', at: 'top-left' }], PHONE);
    expect(phone.plan.frame).toEqual({ width: 1080, height: 1920 });
    expect(videoFilters(phone)[0]).toBe('delogo=x=11:y=19:w=324:h=269');
    // At the very edge: x and y at least 1, the box inside by one pixel.
    expect(eraseVf([{ x: 0, y: 0, w: 1, h: 0.1 }], { width: 640, height: 360 })).toEqual(['delogo=x=1:y=1:w=638:h=36']);
  });

  test('a stretch of the result: firstSec, lastSec or a range, after a trim and a speed; the whole length is no stretch', () => {
    const r = plan([{ op: 'trim', fromSec: 0, toSec: 20 }, { op: 'speed', factor: 2 }, { op: 'erase', boxes: [{ at: 'top', firstSec: 3 }, { at: 'bottom', lastSec: 2 }, { at: 'center', fromSec: 0, toSec: 10 }] }]);
    const e = r.edits.find((x) => x.op === 'erase')!;
    expect(e).toEqual({ op: 'erase', boxes: [
      { x: 0.03, y: 0.01, w: 0.94, h: 0.17, at: 'top', fromSec: 0, toSec: 3 },
      { x: 0.03, y: 0.8, w: 0.94, h: 0.19, at: 'bottom', fromSec: 8, toSec: 10 },
      { x: 0.2, y: 0.38, w: 0.6, h: 0.24, at: 'center' },
    ] });
    const vf = videoFilters({ edits: r.edits, plan: r.plan });
    expect(vf[0]).toMatch(/^setpts=/);
    expect(vf[1]).toBe("delogo=x=58:y=11:w=1805:h=184:enable='between(t,0,3)'");
    expect(vf[3]).toBe('delogo=x=384:y=410:w=1152:h=259');
  });

  test('a picture and a thumbnail take it (no stretch on a picture)', () => {
    const PHOTO: BannerProbe = { durationSec: 0, hasVideo: true, hasAudio: false, width: 1200, height: 1600, rotation: 0, videoCodec: 'mjpeg', audioCodec: null };
    const p = plan([{ op: 'erase', at: 'bottom-right' }], PHOTO);
    expect(p.plan).toMatchObject({ output: 'jpg', still: true, frame: { width: 1200, height: 1600 } });
    expect(renderArgs({ edits: p.edits, plan: p.plan }, 'in.jpg', 'out.jpg').join(' ')).toContain('-vf delogo=x=828:y=1360:w=360:h=224');
    expect(resolveEdits([{ op: 'erase', boxes: [{ at: 'top', firstSec: 2 }] }], PHOTO)).toMatchObject({ ok: false, error: 'conflict' });
    const t = plan([{ op: 'thumbnail', atSec: 4 }, { op: 'erase', at: 'top-left' }]);
    expect(t.plan.output).toBe('jpg');
    expect(t.edits.map((x) => x.op)).toEqual(['erase', 'thumbnail']);
  });

  test('refusals: no place, a place outside, too large a place, too many places, a stretch outside the result', () => {
    expect(resolveEdits([{ op: 'erase', boxes: [] }], SRC)).toMatchObject({ ok: false, error: 'erase_where' });
    expect(resolveEdits([{ op: 'erase' }], SRC)).toMatchObject({ ok: false, error: 'erase_where' });
    expect(resolveEdits([{ op: 'erase', boxes: [{}] }], SRC)).toMatchObject({ ok: false, error: 'erase_where' });
    expect(resolveEdits([{ op: 'erase', at: 'middle' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'erase', boxes: [{ x: 0.9, y: 0.1, w: 0.2, h: 0.1 }] }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'erase', boxes: [{ x: 0.1, y: 0.1, w: 0.1 }] }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'erase', boxes: [{ x: 0, y: 0, w: 0.8, h: 0.8 }] }], SRC)).toMatchObject({ ok: false, error: 'erase_too_large' });
    expect(resolveEdits([{ op: 'erase', boxes: Array(5).fill({ at: 'top' }) }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'erase', boxes: [{ at: 'top', fromSec: 40, toSec: 50 }] }], SRC)).toMatchObject({ ok: false, error: 'out_of_range' });
  });

  test('the stored request passes its own check again, and a changed box or a lost frame does not', () => {
    const req = request([{ op: 'trim', fromSec: 2, toSec: 12 }, { op: 'erase', boxes: [{ at: 'bottom', lastSec: 4 }] }, { op: 'aspect', to: '1:1' }]);
    expect(validateEditRequest(req)).not.toBeNull();
    expect(validateEditRequest(JSON.parse(JSON.stringify(req)))).not.toBeNull();
    // (Another frame is the token's to refuse, and the worker's: ./editWorker checks the source's frame before delivery.)
    expect(validateEditRequest({ ...req, plan: { ...req.plan, frame: { width: 0, height: 360 } } })).toBeNull();
    expect(validateEditRequest({ ...req, plan: { ...req.plan, frame: undefined } })).toBeNull();
    const bad = JSON.parse(JSON.stringify(req)) as EditRequest;
    (bad.edits.find((e) => e.op === 'erase') as { boxes: Array<{ w: number }> }).boxes[0]!.w = 0.99;
    expect(validateEditRequest(bad)).toBeNull();
  });
});
