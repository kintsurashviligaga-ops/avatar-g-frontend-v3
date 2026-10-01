/** @jest-environment node */
/**
 * lib/studio/composeImagePrompt — the image route's prompt assembly, pure. The order is the contract:
 *   brief, style directive | quality boost [, template suffix] [. Do NOT include: …] [ learned directive]
 */
import { STYLE_SUFFIXES, UNSTYLED_BOOST, composeImagePrompt } from './composeImagePrompt';

const BRIEF = 'a ceramic mug on a wooden table';

test('no style: the un-styled quality boost, no provider style', () => {
  expect(composeImagePrompt({ promptEn: BRIEF, styleLabel: '' })).toEqual({ finalPrompt: `${BRIEF}, ${UNSTYLED_BOOST}`, knownStyle: '' });
});

test('a known label expands to its directive and is the provider style', () => {
  const r = composeImagePrompt({ promptEn: BRIEF, styleLabel: 'Photorealistic' });
  expect(r.finalPrompt).toBe(`${BRIEF}, ${STYLE_SUFFIXES.Photorealistic}`);
  expect(r.knownStyle).toBe('Photorealistic');
});

test('free text shapes the prompt but is never forwarded as the provider style', () => {
  const r = composeImagePrompt({ promptEn: BRIEF, styleLabel: 'vaporwave dusk' });
  expect(r.finalPrompt).toBe(`${BRIEF}, vaporwave dusk`);
  expect(r.knownStyle).toBe('');
});

test.each(['constructor', 'toString', '__proto__'])('an inherited key (%s) is not a known label', (k) => {
  const r = composeImagePrompt({ promptEn: BRIEF, styleLabel: k });
  expect(r.knownStyle).toBe('');
  expect(r.finalPrompt).toBe(`${BRIEF}, ${k}`);
});

test('a template suffix follows the style directive, before the exclusion clause and the learned directive', () => {
  const r = composeImagePrompt({
    promptEn: BRIEF,
    styleLabel: 'Photorealistic',
    templateSuffix: 'clean seamless studio backdrop',
    negativeEn: 'people',
    learnedDirective: 'Balanced exposure.',
  });
  expect(r.finalPrompt).toBe(`${BRIEF}, ${STYLE_SUFFIXES.Photorealistic}, clean seamless studio backdrop. Do NOT include: people. Balanced exposure.`);
  expect(r.knownStyle).toBe('Photorealistic');
});

test('no template (null, empty, blank) leaves the prompt exactly as before', () => {
  const plain = composeImagePrompt({ promptEn: BRIEF, styleLabel: 'Cinematic', negativeEn: 'text' }).finalPrompt;
  for (const templateSuffix of [null, undefined, '', '   ']) {
    expect(composeImagePrompt({ promptEn: BRIEF, styleLabel: 'Cinematic', templateSuffix, negativeEn: 'text' }).finalPrompt).toBe(plain);
  }
  expect(plain).toBe(`${BRIEF}, ${STYLE_SUFFIXES.Cinematic}. Do NOT include: text.`);
});

test('a suffix also rides on an un-styled prompt (after the quality boost)', () => {
  expect(composeImagePrompt({ promptEn: BRIEF, styleLabel: '', templateSuffix: 'warm gallery lighting' }).finalPrompt)
    .toBe(`${BRIEF}, ${UNSTYLED_BOOST}, warm gallery lighting`);
});
