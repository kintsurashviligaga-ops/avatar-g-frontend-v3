/**
 * @jest-environment jsdom
 *
 * A LIT template card is not a PICKED one (hooks/usePickedTemplate, lib/studio/templates `requestTemplateId`).
 *
 * ⚠️ WHAT THIS PINS. The studio sent the id of whichever card the panel's values happened to light. Decision (c) moved
 * the Product card to exactly the image panel's default aspect and quality, so tapping only the Photorealistic chip lit
 * Product and every such image (img2img edits included) got the catalogue-studio suffix. The video panel's defaults ARE
 * the Reel card, so every default film got the Reel's look and director note. Nobody had picked a card.
 *
 * Driven from the panels' real starting values (OmniStudio initialises its state from `*_PANEL_DEFAULTS`), through the
 * same `match*Template` the gallery highlight uses, into the hook OmniStudio reads every request's `templateId` from.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { usePickedTemplate } from './usePickedTemplate';
import {
  IMAGE_PANEL_DEFAULTS, MUSIC_PANEL_DEFAULTS, VIDEO_PANEL_DEFAULTS, imageTemplateValues, matchImageTemplate,
  matchMusicTemplate, matchVideoTemplate, videoTemplateValues,
} from '@/lib/studio/templates';

/** The hook as a panel uses it: the lit id is re-derived from whatever values the panel holds now. */
function panel<V>(initial: V, match: (v: V) => string | null) {
  const hook = renderHook(({ values }: { values: V }) => usePickedTemplate(match(values)), { initialProps: { values: initial } });
  return {
    set: (values: V) => hook.rerender({ values }),
    pick: (id: string) => act(() => hook.result.current.pick(id)),
    get templateId() { return hook.result.current.templateId; },
  };
}

describe('a card that is merely lit sends nothing', () => {
  test('image: the default panel lights nothing and sends nothing', () => {
    expect(matchImageTemplate(IMAGE_PANEL_DEFAULTS)).toBeNull();
    expect(panel({ ...IMAGE_PANEL_DEFAULTS }, matchImageTemplate).templateId).toBeNull();
  });

  test('image: tapping only the Photorealistic chip lights Product, but the request carries no templateId', () => {
    const values = { ...IMAGE_PANEL_DEFAULTS, style: 'Photorealistic' };
    expect(matchImageTemplate(values)).toBe('product'); // 1:1 · high · Photorealistic — the card IS lit…
    const p = panel({ ...IMAGE_PANEL_DEFAULTS }, matchImageTemplate);
    p.set(values);
    expect(p.templateId).toBeNull(); // …and adds nothing, because nobody picked it.
  });

  test('video: the default panel IS the Reel card, and a default film carries no templateId', () => {
    expect(matchVideoTemplate(VIDEO_PANEL_DEFAULTS)).toBe('reel');
    expect(panel({ ...VIDEO_PANEL_DEFAULTS }, matchVideoTemplate).templateId).toBeNull();
  });

  test('music: switching the default panel to Instrumental lights R&B Beat, and sends nothing', () => {
    const values = { ...MUSIC_PANEL_DEFAULTS, instrumental: true };
    expect(matchMusicTemplate(values)).toBe('rnb-beat');
    const p = panel<typeof values>({ ...MUSIC_PANEL_DEFAULTS }, matchMusicTemplate);
    p.set(values);
    expect(p.templateId).toBeNull();
  });
});

describe('a picked card is sent while it still matches, and the first edit away forgets it', () => {
  test('image: pick Product → sent; edit the style → not sent; edit it back → still not sent; pick again → sent', () => {
    const product = { ...imageTemplateValues('product')! };
    const p = panel({ ...IMAGE_PANEL_DEFAULTS } as { aspect: string; quality: string; style: string }, matchImageTemplate);
    p.set(product);
    p.pick('product');
    expect(p.templateId).toBe('product');

    p.set({ ...product, style: 'Cinematic' });
    expect(p.templateId).toBeNull();

    p.set(product); // the card lights again…
    expect(matchImageTemplate(product)).toBe('product');
    expect(p.templateId).toBeNull(); // …but its context needs a deliberate pick to come back.

    p.pick('product');
    expect(p.templateId).toBe('product');
  });

  test('video: picking the Reel card on the default panel is a choice, and sends it', () => {
    const p = panel({ ...VIDEO_PANEL_DEFAULTS } as { mode: 'documentary' | 'musicvideo'; duration: 8 | 24 | 48; orientation: 'landscape' | 'vertical' | 'square' | 'portrait'; style: string }, matchVideoTemplate);
    p.pick('reel');
    expect(p.templateId).toBe('reel');
    // The Teaser shares the Reel's style and mode; shortening the film is an edit away from the Reel.
    p.set({ ...videoTemplateValues('reel')!, duration: 8 });
    expect(p.templateId).toBeNull();
  });

  test('a pick that the values do not select (a race, or a bad id) sends nothing', () => {
    const p = panel({ ...IMAGE_PANEL_DEFAULTS }, matchImageTemplate);
    p.pick('product'); // the values are still the defaults: Product is not lit
    expect(p.templateId).toBeNull();
  });
});

describe('the studio reads every request\'s templateId from the PICKED id, never the lit one', () => {
  // Compact assertions on purpose: a failing `expect(src).toContain(…)` would print all ~9 000 lines of the component.
  const src = readFileSync(join(__dirname, '..', 'components', 'studio', 'OmniStudio.tsx'), 'utf8');
  const absent = (needles: string[]) => needles.filter((n) => !src.includes(n));
  const found = (re: RegExp) => src.match(re)?.[0] ?? null;

  test('each panel derives its pick from its lit id', () => {
    expect(absent(['activeImagePreset', 'activeVideoPreset', 'activeMusicPreset'].map((lit) => `usePickedTemplate(${lit})`))).toEqual([]);
  });

  test('no request body, render snapshot or re-roll spec is built from a lit id or a fresh match', () => {
    expect(found(/templateId:\s*active(?:Image|Video|Music)Preset/i)).toBeNull();
    expect(found(/templateId:\s*match(?:Image|Video|Music)Template\(/)).toBeNull();
    expect(found(/function imageTemplateField/)).toBeNull();
  });

  test('every panel initialises from the shared defaults this file tests', () => {
    expect(absent([
      'useState<ImgAspect>(IMAGE_PANEL_DEFAULTS.aspect)',
      'useState<ImgQuality>(IMAGE_PANEL_DEFAULTS.quality)',
      'useState<string>(IMAGE_PANEL_DEFAULTS.style)',
      'useState<string>(VIDEO_PANEL_DEFAULTS.style)',
      'useState<8 | 24 | 48>(VIDEO_PANEL_DEFAULTS.duration)',
      "useState<'musicvideo' | 'documentary'>(VIDEO_PANEL_DEFAULTS.mode)",
      "useState<'landscape' | 'vertical' | 'square' | 'portrait'>(VIDEO_PANEL_DEFAULTS.orientation)",
      // Music styles are a list now (up to three, lib/ai/musicControls); the default panel holds the one default genre.
      'useState<string[]>([MUSIC_PANEL_DEFAULTS.genre])',
      'useState<boolean>(MUSIC_PANEL_DEFAULTS.instrumental)',
      'useState<VocalGender>(MUSIC_PANEL_DEFAULTS.voiceType)',
    ])).toEqual([]);
  });
});
