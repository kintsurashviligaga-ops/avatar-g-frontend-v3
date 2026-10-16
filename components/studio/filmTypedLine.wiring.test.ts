/** @jest-environment node */
/**
 * An old ad line ("come on check the site myavatar.ge") came back as a caption and a sung lyric in a later music video
 * (Production 2026-10-16): the typed line and dialogue stayed in the panel after their film and rode into the next one.
 * OmniStudio is ~12k lines, so this pins the wiring in the source.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');

test('the typed line and the dialogue are cleared as soon as their film starts rendering', () => {
  const clear = src.indexOf("setVideoSpeech(''); setVideoDialogue('');");
  const drive = src.indexOf('const res = await driveFilmStudio({');
  expect(clear).toBeGreaterThan(0);
  expect(drive).toBeGreaterThan(clear);
  expect(drive - clear).toBeLessThan(400); // right before the render call, inside the same function
});
