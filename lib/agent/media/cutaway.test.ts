/**
 * Cutaways (GG 2026-11-05 14:32Z): the words, the speaker's lines, the stock pick, the placement and the request check.
 */
import { cutawayWords } from './cutawayAsk';
import { parseCutaways } from './cutawaySpot';
import { beatMontageAsk } from './montageChat';
import { pickPexelsFile, type PexelsVideo } from '@/lib/services/stock/pexels';
import { planInserts } from '@/lib/services/montage/insertPlan';
import { coerceInserts } from '@/lib/services/montage/montagePlan';
import { buildInsertArgs, enableExpr } from '@/lib/services/montage/insertCompose';

test.each([
  'ეკრანი გაყავი და რეალური კადრები მოძებნე და ჩასვი',
  'მონტაჟის დროს ეკრანის გაყოფა და რეალური კადრების ჩასმა',
  'ამ ვიდეოს b-roll დაუმატე',
  'split screen with real footage of what he says',
  'add stock footage over the talking parts',
  'добавь перебивки по тексту',
])('a cutaway ask: %s', (t) => expect(cutawayWords(t)).toBe(true));

test.each(['დაამონტაჟე ეს ორი ვიდეო', 'cut these to the music', 'ლოგო დაადე კუთხეში', 'ტექსტი ჩასვი ქვემოთ'])('not one: %s', (t) => {
  expect(cutawayWords(t)).toBe(false);
});

test('one video and a cutaway ask go to the montage', () => {
  expect(beatMontageAsk('ეკრანი გაყავი და რეალური კადრები ჩასვი', ['video'])).toBe(true);
  expect(beatMontageAsk('ეკრანი გაყავი და რეალური კადრები ჩასვი', ['image'])).toBe(false);
});

test('the model lines: times inside the file, sorted, no visual without a query', () => {
  const raw = JSON.stringify({ lines: [
    { startSec: 4, endSec: 6, text: ' second ', visual: true, query: 'city at night!', prompt: 'p' },
    { startSec: 0.5, endSec: 3, text: 'first', visual: true, query: '', prompt: '' },
    { startSec: 20, endSec: 22, text: 'outside', visual: true, query: 'x', prompt: '' },
  ] });
  expect(parseCutaways(raw, 10)).toEqual([
    { startSec: 0.5, endSec: 3, text: 'first', visual: false, query: '', prompt: '' },
    { startSec: 4, endSec: 6, text: 'second', visual: true, query: 'city at night', prompt: 'p' },
  ]);
  expect(parseCutaways('not json', 10)).toBeNull();
});

test('the Pexels pick: long enough, the smallest MP4 that fills the half frame, not one already used', () => {
  const v = (id: number, duration: number, widths: number[]): PexelsVideo => ({
    id, url: `https://www.pexels.com/video/${id}/`, duration, width: 1920, height: 1080, user: { name: `A${id}` },
    video_files: widths.map((w) => ({ link: `https://videos.pexels.com/video-files/${id}/${w}.mp4`, width: w, height: Math.round(w * 9 / 16), file_type: 'video/mp4' })),
  });
  const vids = [v(1, 1, [1280]), v(2, 10, [640, 1920, 1280, 3840]), v(3, 10, [1280])];
  expect(pickPexelsFile(vids, { minSec: 1.5, minWidth: 720 })).toMatchObject({ id: 2, width: 1280, author: 'A2', url: 'https://videos.pexels.com/video-files/2/1280.mp4' });
  expect(pickPexelsFile(vids, { minSec: 1.5, minWidth: 720, skip: new Set([2]) })?.id).toBe(3);
  expect(pickPexelsFile(vids, { minSec: 20, minWidth: 720 })).toBeNull();
});

test('placement: after the word, 1.2–3 s, inside the line, apart, never at the very start or end', () => {
  const ins = planInserts({
    masterSec: 12,
    lines: [
      { startSec: 0, endSec: 2.5, text: 'a', clip: 0 },
      { startSec: 2.6, endSec: 3.4, text: 'short', clip: 1 },
      { startSec: 3.5, endSec: 8, text: 'b', clip: 1 },
      { startSec: 8.1, endSec: 11.8, text: 'c' },
    ],
    clips: [{ durationSec: 6 }, { durationSec: 2 }],
  });
  expect(ins.map((x) => [x.startSec, x.endSec, x.clip, x.text])).toEqual([
    [1, 2.5, 0, 'a'],
    [3.667, 5.667, 1, 'b'],
    [8.267, 11, 0, 'c'],
  ]);
  expect(ins[0]!.clipStartSec).toBe(2.25);
  expect(planInserts({ masterSec: 2, lines: [{ startSec: 0, endSec: 2, text: 'x' }], clips: [{ durationSec: 5 }] })).toEqual([]);
});

test('the request takes cutaways only from Pexels or our storage, inside the edit, in order', () => {
  const ok = { url: 'https://videos.pexels.com/video-files/1/a.mp4', startSec: 1, endSec: 3, clipStartSec: 0, source: 'pexels' };
  expect(coerceInserts([ok], 10)).toEqual({ ok: true, value: [ok] });
  expect(coerceInserts([{ ...ok, url: 'https://evil.example/a.mp4' }], 10).ok).toBe(false);
  expect(coerceInserts([{ ...ok, url: 'http://videos.pexels.com/a.mp4' }], 10).ok).toBe(false);
  expect(coerceInserts([{ ...ok, endSec: 12 }], 10).ok).toBe(false);
  expect(coerceInserts([{ ...ok, startSec: 5, endSec: 7 }, ok], 10).ok).toBe(false);
  expect(coerceInserts(undefined, 10)).toEqual({ ok: true, value: [] });
});

test('the graph: footage top, speaker bottom, the line, the sound copied', () => {
  const args = buildInsertArgs('m.mp4', ['a.mp4'], [{ startSec: 1, endSec: 3, clip: 0, clipStartSec: 0.5, line: 0, text: '' }], 'o.mp4', { w: 720, h: 1280 });
  const g = args[args.indexOf('-filter_complex') + 1]!;
  expect(args.slice(0, 9)).toEqual(['-y', '-i', 'm.mp4', '-ss', '0.5', '-t', '2.1', '-i', 'a.mp4']);
  expect(g).toContain('crop=720:640:0:154');
  expect(g).toContain("overlay=0:640:enable='between(t,1,2.983)'");
  expect(g).toContain('scale=720:640:force_original_aspect_ratio=increase,crop=720:640');
  expect(g).toContain('drawbox=x=0:y=637');
  expect(args).toEqual(expect.arrayContaining(['-map', '0:a?', '-c:a', 'copy']));
  expect(enableExpr([])).toBe('');
});
