/**
 * CapCut's effects in Agent G's edit (GG 2026-10-11 17:38Z: „ქაფქათს და სხვა ფუნქციებს რაც აკლია"): light and colour,
 * a mirror, a quarter turn, zoom / shake / glitch, steadying, a frame over the picture's own blur, noise out of the
 * sound, even loudness. The words (ka · en · ru) → the asks → the stored edits → the ffmpeg chains → the card's words.
 * Pure: nothing renders here (./effects.ffmpeg.test.ts renders them).
 */
import {
  ADJUST_KEYS, DENOISE_AF, LOUDNESS_AF, MAX_MOTION_SEC, MAX_STABILIZE_SEC, STABILIZE_VF, adjustVf, audioFilters, motionVf,
  renderArgs, resolveEdits, rotateVf, validateEditRequest, videoFilters, type EditRequest,
} from './editPlan';
import { mineEdits, type EditAsk } from './editWords';
import { askLine, editErrorText, editLine } from './editChat';
import { planChatTurn, type ChatSnapshot } from '../chatTurn';
import type { BannerProbe } from '@/lib/video/probeBanner';

const SRC: BannerProbe = { durationSec: 20, hasVideo: true, hasAudio: true, width: 1920, height: 1080, rotation: 0, videoCodec: 'h264', audioCodec: 'aac' };
const SILENT: BannerProbe = { ...SRC, hasAudio: false, audioCodec: null };
const PHOTO: BannerProbe = { ...SRC, durationSec: 0, hasAudio: false, audioCodec: null, videoCodec: 'mjpeg', width: 1200, height: 800 };

function plan(asks: unknown[], src: BannerProbe = SRC) {
  const r = resolveEdits(asks, src);
  if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
  return r;
}
function request(asks: unknown[], src: BannerProbe = SRC): EditRequest {
  const r = plan(asks, src);
  return { v: 1, source: { ref: 'uploads/u1/clip.mp4' }, edits: r.edits, name: `clip-edit.${r.plan.output}`, plan: r.plan };
}
const edits = (t: string) => mineEdits(t).edits;

describe('resolveEdits: the effects as stored edits', () => {
  test('light and colour: whole numbers in range, zeros dropped, all zero is nothing to do', () => {
    expect(plan([{ op: 'adjust', brightness: 25.4, contrast: 0, warmth: -40, vignette: 50 }]).edits).toEqual([{ op: 'adjust', brightness: 25, warmth: -40, vignette: 50 }]);
    expect(resolveEdits([{ op: 'adjust', brightness: 101 }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'adjust', sharpen: -10 }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'adjust', saturation: 'lots' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'adjust', contrast: 0 }], SRC)).toMatchObject({ ok: false, error: 'nothing_to_do' });
    expect(ADJUST_KEYS).toEqual(['brightness', 'contrast', 'saturation', 'warmth', 'sharpen', 'vignette']);
  });

  test('a turn is a quarter turn; 90° and 270° swap the frame, 180° does not; a whole turn is nothing to do', () => {
    expect(plan([{ op: 'rotate', deg: 90 }]).plan).toMatchObject({ width: 1080, height: 1920 });
    expect(plan([{ op: 'rotate', deg: -90 }]).edits).toEqual([{ op: 'rotate', deg: 270 }]);
    expect(plan([{ op: 'rotate', deg: 180 }]).plan).toMatchObject({ width: 1920, height: 1080 });
    expect(resolveEdits([{ op: 'rotate', deg: 45 }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'rotate', deg: 360 }], SRC)).toMatchObject({ ok: false, error: 'nothing_to_do' });
    // A turned clip then reframed: the frame is the turned picture's.
    expect(plan([{ op: 'aspect', to: '9:16', fit: 'pad' }, { op: 'rotate', deg: 90 }]).plan).toMatchObject({ width: 1080, height: 1920 });
  });

  test('a mirror is left to right unless asked upside down; the movement needs one of zoom, shake, glitch', () => {
    expect(plan([{ op: 'flip' }]).edits).toEqual([{ op: 'flip', axis: 'horizontal' }]);
    expect(plan([{ op: 'flip', axis: 'vertical' }]).edits).toEqual([{ op: 'flip', axis: 'vertical' }]);
    expect(resolveEdits([{ op: 'flip', axis: 'diagonal' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(plan([{ op: 'motion', zoom: 'out', glitch: true }]).edits).toEqual([{ op: 'motion', zoom: 'out', glitch: true }]);
    expect(resolveEdits([{ op: 'motion' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'motion', zoom: 'sideways' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
    expect(resolveEdits([{ op: 'motion', shake: 'yes' }], SRC)).toMatchObject({ ok: false, error: 'bad_edits' });
  });

  test('the one order: steadied, turned, mirrored, framed, moved, then light and colour, then the sound', () => {
    const r = plan([
      { op: 'loudness' }, { op: 'adjust', contrast: 25 }, { op: 'motion', shake: true }, { op: 'aspect', to: '9:16', fit: 'blur' },
      { op: 'flip' }, { op: 'rotate', deg: 180 }, { op: 'stabilize' },
    ]);
    expect(r.edits.map((e) => e.op)).toEqual(['stabilize', 'rotate', 'flip', 'aspect', 'motion', 'adjust', 'loudness']);
    expect(r.plan).toMatchObject({ width: 1080, height: 1920, copyVideo: false, hasAudio: true });
  });

  test('sound edits that contradict or have nothing to work on are refused by name', () => {
    expect(resolveEdits([{ op: 'mute' }, { op: 'denoise' }], SRC)).toMatchObject({ ok: false, error: 'conflict' });
    expect(resolveEdits([{ op: 'loudness' }, { op: 'volume', db: 6 }], SRC)).toMatchObject({ ok: false, error: 'conflict' });
    expect(resolveEdits([{ op: 'denoise' }], SILENT)).toMatchObject({ ok: false });
    expect(resolveEdits([{ op: 'loudness' }], SILENT)).toMatchObject({ ok: false });
    // Sound only: the picture is copied, not re-encoded.
    expect(plan([{ op: 'denoise' }, { op: 'loudness' }]).plan.copyVideo).toBe(true);
    expect(plan([{ op: 'flip' }]).plan.copyVideo).toBe(false);
  });

  test('the slow effects have their own limits, with a way out', () => {
    const long = { ...SRC, durationSec: MAX_MOTION_SEC + 30 };
    expect(resolveEdits([{ op: 'motion', zoom: 'in' }], long)).toMatchObject({ ok: false, error: 'too_long' });
    expect(plan([{ op: 'trim', toSec: 60 }, { op: 'motion', zoom: 'in' }], long).plan.durationSec).toBe(60);
    expect(resolveEdits([{ op: 'stabilize' }], { ...SRC, durationSec: MAX_STABILIZE_SEC + 1 })).toMatchObject({ ok: false, error: 'too_long' });
  });

  test('a picture takes a turn, a mirror, light and colour; not a movement or the sound', () => {
    const r = plan([{ op: 'rotate', deg: 90 }, { op: 'flip' }, { op: 'adjust', brightness: 20 }], PHOTO);
    expect(r.plan).toMatchObject({ output: 'jpg', width: 800, height: 1200 });
    expect(resolveEdits([{ op: 'motion', zoom: 'in' }], PHOTO)).toMatchObject({ ok: false });
    expect(resolveEdits([{ op: 'stabilize' }], PHOTO)).toMatchObject({ ok: false });
  });

  test('a stored request with effects is resolved again to the same edits (the worker trusts nothing it is handed)', () => {
    const req = request([{ op: 'adjust', warmth: 40, sharpen: 50 }, { op: 'rotate', deg: 270 }, { op: 'motion', zoom: 'in', shake: true }, { op: 'denoise' }]);
    expect(validateEditRequest(JSON.parse(JSON.stringify(req)))).toEqual(req);
    const forged = { ...req, edits: req.edits.map((e) => (e.op === 'adjust' ? { ...e, warmth: 900 } : e)) };
    expect(validateEditRequest(forged)).toBeNull();
  });
});

describe('the ffmpeg chains', () => {
  test('each effect is one plain -vf / -af step, in the plan\'s order', () => {
    const req = request([{ op: 'stabilize' }, { op: 'rotate', deg: 90 }, { op: 'flip' }, { op: 'motion', glitch: true }, { op: 'adjust', brightness: 20 }, { op: 'denoise' }, { op: 'loudness' }]);
    const vf = videoFilters(req);
    const at = (s: string) => vf.findIndex((f) => f.startsWith(s));
    expect(vf[0]).toBe(STABILIZE_VF);
    expect(at('transpose=clock')).toBeGreaterThan(at(STABILIZE_VF));
    expect(at('hflip')).toBeGreaterThan(at('transpose'));
    expect(at('rgbashift')).toBeGreaterThan(at('hflip'));
    expect(at('eq=')).toBeGreaterThan(at('rgbashift'));
    expect(vf[vf.length - 1]).toBe('format=yuv420p');
    expect(audioFilters(req)).toEqual([DENOISE_AF, LOUDNESS_AF]);
    // One input, one output: a simple graph, so a phone clip's rotation still applies.
    const args = renderArgs(req, 'in.mp4', 'out.mp4');
    expect(args).toContain('-vf');
    expect(args).not.toContain('-filter_complex');
  });

  test('the turn, the light and colour, and the movement in numbers', () => {
    expect(rotateVf(90)).toBe('transpose=clock');
    expect(rotateVf(270)).toBe('transpose=cclock');
    expect(rotateVf(180)).toBe('hflip,vflip');
    expect(adjustVf({ brightness: 100, contrast: -100, saturation: 50 })).toEqual(['eq=brightness=0.2500:contrast=0.5000:saturation=1.5000']);
    expect(adjustVf({ warmth: 40 })).toEqual(['colortemperature=temperature=5300:pl=1']);
    expect(adjustVf({ warmth: -40 })).toEqual(['colortemperature=temperature=7700:pl=1']);
    expect(adjustVf({ sharpen: 100, vignette: 50 })).toEqual(['unsharp=5:5:1.500:5:5:0', 'vignette=angle=0.5000']);
    const zoom = motionVf({ zoom: 'in' }, 1920, 1080, 10).join(',');
    expect(zoom).toContain('zoompan=');
    expect(zoom).toContain('s=1920x1080');
    const shake = motionVf({ shake: true }, 1920, 1080, 10).join(',');
    expect(shake).toMatch(/crop=1920:1080:/);
    expect(shake).toContain('sin(');
    expect(motionVf({ glitch: true }, 1920, 1080, 10).join(',')).toMatch(/rgbashift=.*enable='lt\(mod\(t,1\.6\),0\.2\)'/);
  });

  test('a frame over the picture\'s own blur: split, blur, overlay, inside the one -vf', () => {
    const vf = videoFilters(request([{ op: 'aspect', to: '9:16', fit: 'blur' }])).join(',');
    expect(vf).toContain('split=2[bg][fg]');
    expect(vf).toContain('boxblur=');
    expect(vf).toContain('overlay=(W-w)/2:(H-h)/2');
  });
});

describe('the words: ka · en · ru', () => {
  test.each<[string, EditAsk[]]>([
    ['გააკეთე უფრო ნათელი', [{ op: 'adjust', brightness: 25 }]],
    ['make it brighter', [{ op: 'adjust', brightness: 25 }]],
    ['сделай ярче', [{ op: 'adjust', brightness: 25 }]],
    ['ცოტა გაამუქე და კონტრასტი მოუმატე', [{ op: 'adjust', brightness: -25, contrast: 25 }]],
    ['warmer tones and a vignette', [{ op: 'adjust', warmth: 40, vignette: 50 }]],
    ['сделай холоднее', [{ op: 'adjust', warmth: -40 }]],
    ['გაამკვეთრე', [{ op: 'adjust', sharpen: 50 }]],
    ['brighter by 60%', [{ op: 'adjust', brightness: 60 }]],
    ['სარკისებურად ამოაბრუნე', [{ op: 'flip', axis: 'horizontal' }]],
    ['flip it upside down', [{ op: 'flip', axis: 'vertical' }]],
    ['отзеркаль видео', [{ op: 'flip', axis: 'horizontal' }]],
    ['მოატრიალე 90 გრადუსით მარჯვნივ', [{ op: 'rotate', deg: 90 }]],
    ['rotate it left', [{ op: 'rotate', deg: -90 }]],
    ['поверни на 180 градусов', [{ op: 'rotate', deg: 180 }]],
    ['ზუმი გაუკეთე', [{ op: 'motion', zoom: 'in' }]],
    ['zoom out slowly', [{ op: 'motion', zoom: 'out' }]],
    ['добавь глитч', [{ op: 'motion', glitch: true }]],
    ['add a camera shake effect', [{ op: 'motion', shake: true }]],
    ['კანკალი მოაშორე', [{ op: 'stabilize' }]],
    ['stabilize the video', [{ op: 'stabilize' }]],
    ['стабилизируй', [{ op: 'stabilize' }]],
    ['ფონური ხმაური მოაშორე', [{ op: 'denoise' }]],
    ['remove the background noise', [{ op: 'denoise' }]],
    ['убери шум', [{ op: 'denoise' }]],
    ['ხმა გაათანაბრე', [{ op: 'loudness' }]],
    ['normalize the audio', [{ op: 'loudness' }]],
    ['9:16 ბუნდოვანი ფონით', [{ op: 'aspect', to: '9:16', fit: 'blur' }]],
    ['make it 9:16 with a blurred background', [{ op: 'aspect', to: '9:16', fit: 'blur' }]],
  ])('%s → %j', (text, want) => {
    expect(edits(text)).toEqual(want);
  });

  test('words that only look like an effect are not one', () => {
    // „ხმაური" is noise, never „sound off"; Tbilisi is not warm; „approximately" is no zoom; „it is shaky" asks no shake.
    expect(edits('ხმაური მოაშორე').map((e) => e.op)).toEqual(['denoise']);
    expect(edits('ვიდეო თბილისში გადავიღე, 20 წამამდე მოჭერი').some((e) => e.op === 'adjust')).toBe(false);
    expect(edits('მიახლოებით 10 წამამდე მოჭერი').some((e) => e.op === 'motion')).toBe(false);
    expect(edits('приблизительно до 10 секунд обрежь').some((e) => e.op === 'motion')).toBe(false);
    expect(edits('the video is shaky, fix it').map((e) => e.op)).toEqual(['stabilize']);
    expect(edits('ვიდეო კანკალებს, გაასწორე').map((e) => e.op)).toEqual(['stabilize']);
    expect(edits('видео трясётся, исправь').map((e) => e.op)).toEqual(['stabilize']);
    expect(edits('the video is shaky').some((e) => e.op === 'motion')).toBe(false);
    // A zoom transition is the montage's, not a zoom of the whole video.
    expect(edits('cut to the music with zoom transitions').some((e) => e.op === 'motion')).toBe(false);
    // Upside down mirrored is the flip's axis, not a vertical frame.
    expect(edits('flip it vertically').map((e) => e)).toEqual([{ op: 'flip', axis: 'vertical' }]);
  });

  test('backwards is named as not available; „in reverse order" is no playback', () => {
    expect(mineEdits('play it backwards').unsupported).toContain('reverse');
    expect(mineEdits('ვიდეო უკუღმა გაუშვი').unsupported).toContain('reverse');
    expect(mineEdits('воспроизведи задом наперёд').unsupported).toContain('reverse');
    expect(mineEdits('put the clips in reverse order').unsupported).not.toContain('reverse');
  });

  test('light and colour asked with a look keeps the look; asked alone, no cinematic look is added', () => {
    expect(edits('make it brighter').some((e) => e.op === 'grade')).toBe(false);
    expect(edits('vintage look, a bit brighter').map((e) => e.op).sort()).toEqual(['adjust', 'grade']);
  });
});

describe('the card\'s words', () => {
  test('each effect in ka · en · ru', () => {
    const all: Parameters<typeof editLine>[0][] = [
      { op: 'adjust', brightness: 25, warmth: -40, sharpen: 50, vignette: 50 }, { op: 'flip', axis: 'horizontal' }, { op: 'flip', axis: 'vertical' },
      { op: 'rotate', deg: 90 }, { op: 'rotate', deg: 180 }, { op: 'rotate', deg: 270 }, { op: 'motion', zoom: 'in', shake: true, glitch: true },
      { op: 'stabilize' }, { op: 'denoise' }, { op: 'loudness' },
    ];
    for (const e of all) for (const l of ['ka', 'en', 'ru']) expect(editLine(e, l).length).toBeGreaterThan(4);
    expect(editLine({ op: 'adjust', brightness: 25, warmth: -40, vignette: 50 }, 'en')).toBe('light and colour: brightness +25, cooler +40, vignette 50');
    expect(editLine({ op: 'adjust', brightness: -25, warmth: 40 }, 'ka')).toBe('სინათლე და ფერი: სიკაშკაშე −25, თბილი ტონი +40');
    expect(editLine({ op: 'motion', zoom: 'in', glitch: true }, 'ka')).toBe('ეფექტი: ნელი ზუმი შიგნით + გლიჩი');
    expect(editLine({ op: 'rotate', deg: 270 }, 'en')).toBe('turned 90° anticlockwise');
    expect(askLine({ op: 'rotate', deg: -90 }, 'en')).toBe('turned 90° anticlockwise');
    expect(askLine({ op: 'aspect', to: '9:16', fit: 'blur' }, 'en')).toContain('blurred');
  });

  test('backwards, said plainly with what can be done instead', () => {
    for (const l of ['ka', 'en', 'ru']) expect(editErrorText('reverse', l).length).toBeGreaterThan(40);
    expect(editErrorText('reverse', 'en')).toMatch(/^I cannot play a video backwards yet/);
  });
});

describe('the chat: effects on the file attached, or on Agent G\'s last result', () => {
  const base = {
    mode: 'chat', locale: 'ka', attachments: [], cards: [], jobs: [], foreground: null, lastTruncated: false, lastRedoable: false,
    pendingMontageId: null, previous: null, montageOn: true, audioOn: true, editOn: true, runOn: true,
  } as ChatSnapshot;
  const turn = (text: string, over: Partial<ChatSnapshot>) => planChatTurn(text, { ...base, ...over });

  test('an attached video: Agent G\'s edit, with every other edit of the same words (the remix has no effects)', () => {
    expect(turn('ზუმი დაამატე და გააკეთე უფრო ნათელი', { attachments: ['video'] })).toMatchObject({
      kind: 'edit', source: 'file', file: 0, edits: [{ op: 'motion', zoom: 'in' }, { op: 'adjust', brightness: 25 }],
    });
    expect(turn('remove the background noise', { attachments: ['video'] })).toMatchObject({ kind: 'edit', edits: [{ op: 'denoise' }] });
    expect(turn('стабилизируй видео', { attachments: ['video'] })).toMatchObject({ kind: 'edit', edits: [{ op: 'stabilize' }] });
  });

  test('an attached picture takes a turn, a mirror, light and colour; a zoom on a photo is not an edit', () => {
    expect(turn('rotate it 90 degrees and make it warmer', { attachments: ['image'] })).toMatchObject({ kind: 'edit', source: 'file' });
    expect(turn('ზუმი გაუკეთე', { attachments: ['image'] }).kind).not.toBe('edit');
  });

  test('nothing attached: words naming the video or picture are about the last result; bare „warmer" is the chat\'s', () => {
    const V = { previous: { kind: 'video' as const } };
    expect(turn('ამ ვიდეოს ზუმი დაუმატე', V)).toMatchObject({ kind: 'edit', source: 'previous', edits: [{ op: 'motion', zoom: 'in' }] });
    expect(turn('сделай это видео ярче', V)).toMatchObject({ kind: 'edit', source: 'previous' });
    expect(turn('add a glitch effect to the video', V)).toMatchObject({ kind: 'edit', source: 'previous' });
    expect(turn('write me a warmer intro text', V).kind).toBe('pass');
    expect(turn('make the video brighter', { previous: null }).kind).not.toBe('edit');
  });

  test('backwards is said to be out, in the language asked', () => {
    const step = turn('play it backwards', { attachments: ['video'] });
    expect(step).toMatchObject({ kind: 'say' });
    if (step.kind === 'say') expect(step.text).toBe(editErrorText('reverse', 'en'));
  });

  test('effects off when the edit is off for this user', () => {
    expect(turn('make it brighter', { attachments: ['video'], editOn: false }).kind).not.toBe('edit');
  });
});
