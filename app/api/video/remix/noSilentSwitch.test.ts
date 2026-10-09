/** @jest-environment node */
/**
 * NO SILENT SWITCH in the remix keyframe ops (the owner, 2026-10-09: "აკრძალული პროვაიდერის ჩუმი fallback არ დაუშვა").
 *
 *  · A character swap WITH a photo is roop (the same video, face replaced, motion kept). Its miss used to fall through to
 *    NanoBanana + Kling — two other outside engines making a fresh 5-second clip from one frame — for the same price.
 *  · A restyle / background swap / character change whose image edit missed used to send the UNCHANGED frame to Kling
 *    and bill a "reanimated" clip of the original.
 * Both now refund. Structural, like fallbackRefund.test.ts: the handler sits behind a dozen provider imports.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');

it('a roop miss refunds instead of re-rendering on NanoBanana + Kling', () => {
  const at = src.indexOf('const swapped = await roopFaceSwapVideo(videoUrl, swapPhoto);');
  expect(at).toBeGreaterThan(-1);
  const block = src.slice(at, src.indexOf('}', at + 200) + 1);
  expect(block).toMatch(/if \(swapped\) return await finishOk\(swapped, \{ method: 'faceswap' \}\);\s*return failRefund\(/);
});

it('a missed image edit refunds; the original frame is never animated as the edit', () => {
  expect(src).not.toMatch(/styled\?\.url \|\| frame/);
  expect(src).toMatch(/if \(!styled\?\.url\) return failRefund\(/);
  expect(src).toMatch(/const startImage = styled\.url;/);
});
