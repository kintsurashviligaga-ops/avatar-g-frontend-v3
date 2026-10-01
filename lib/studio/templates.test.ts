/** @jest-environment node */
import { existsSync } from 'fs';
import { join } from 'path';
import { IMAGE_PRESETS } from '@/lib/image/imagePresets';
import { VIDEO_PRESETS } from '@/lib/video/videoPresets';
import {
  AVATAR_TEMPLATES, IMAGE_PANEL_DEFAULTS, IMAGE_TEMPLATES, MUSIC_PANEL_DEFAULTS, MUSIC_TEMPLATES, TEMPLATES_BY_TOOL,
  TEMPLATE_ID_RX, VIDEO_PANEL_DEFAULTS, VIDEO_TEMPLATES, avatarTemplateValues, imageTemplateValues, matchAvatarTemplate,
  matchImageTemplate, matchMusicTemplate, matchVideoTemplate, musicTemplateValues, requestTemplateId, templateAddsLine,
  templateLang, videoTemplateValues,
} from './templates';

// The panels' own option lists (components/studio/OmniStudio.tsx). A template may only set values a control can show.
const VIDEO_STYLES = ['Cinematic', 'Documentary', 'Anime', 'Vintage', 'Neon', 'Nature', 'Cyberpunk', 'Noir', 'Fantasy', 'Aerial', 'Realistic', 'Georgian', 'Dramatic', 'Romantic', 'Action', 'Horror', 'Comedy'];
const IMG_STYLES = ['Auto', 'Photorealistic', 'Cinematic', 'Digital Art', 'Anime', '3D Render', 'Oil Painting', 'Watercolor', 'Cyberpunk', 'Fantasy', 'Minimalist', 'Line Art', 'Pixel Art'];
const IMG_ASPECTS = ['1:1', '16:9', '9:16', '4:5', '4:3', '3:4', '3:2', '2:3', '5:4', '21:9'];
const MUSIC_GENRES = ['folk', 'r&b', 'hip-hop', 'pop', 'electronic', 'jazz', 'rock', 'classical', 'trap', 'reggae', 'blues', 'metal', 'country', 'ambient', 'lo-fi', 'soul', 'funk', 'latin', 'k-pop'];

describe('every gallery', () => {
  test.each(Object.entries(TEMPLATES_BY_TOOL))('%s: unique ids, three languages, a real thumbnail or none', (_tool, list) => {
    const ids = list.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(list.length).toBeGreaterThanOrEqual(6);
    for (const t of list) {
      for (const l of ['ka', 'en', 'ru'] as const) {
        expect(t.label[l].trim().length).toBeGreaterThan(0);
        expect(t.hint[l].trim().length).toBeGreaterThan(0);
      }
      // A declared thumbnail must exist — a missing file would ship as a broken image and a 404.
      if (t.thumb) expect(existsSync(join(process.cwd(), 'public', t.thumb))).toBe(true);
      expect(t.palette).toHaveLength(2);
      for (const c of t.palette) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  test('templateLang falls back to Georgian', () => {
    expect(templateLang('en')).toBe('en');
    expect(templateLang('de')).toBe('ka');
  });

  test.each(Object.entries(TEMPLATES_BY_TOOL))('%s: every id is a valid wire id (the server rejects anything else)', (_tool, list) => {
    for (const t of list) expect(t.id).toMatch(TEMPLATE_ID_RX);
  });
});

describe('the „Adds: …" disclosure (owner decision 2026-10-01 a)', () => {
  test('every video, image and music card says what it adds, in all three languages, on one short line', () => {
    for (const t of [...VIDEO_TEMPLATES, ...IMAGE_TEMPLATES, ...MUSIC_TEMPLATES]) {
      for (const l of ['ka', 'en', 'ru'] as const) {
        const line = templateAddsLine(t, l);
        expect(line).not.toBeNull();
        expect(line!).not.toMatch(/\n/);
        expect(line!.length).toBeLessThanOrEqual(64); // it rides on a 3:4 card's meta row
      }
      expect(templateAddsLine(t, 'en')).toMatch(/^Adds: \S/);
      expect(templateAddsLine(t, 'ka')).toMatch(/^ამატებს: \S/);
      expect(templateAddsLine(t, 'ru')).toMatch(/^Добавляет: \S/);
    }
  });

  test('a presenter card adds nothing (decision A-f)', () => {
    for (const t of AVATAR_TEMPLATES) {
      expect(templateAddsLine(t, 'en')).toBeNull();
      expect(t).not.toHaveProperty('adds');
    }
  });

  test('the Georgian Folk card names the choir it adds', () => {
    const folk = MUSIC_TEMPLATES.find((t) => t.id === 'georgian-folk')!;
    expect(templateAddsLine(folk, 'en')).toBe('Adds: Georgian polyphonic choir and panduri');
  });
});

describe('video', () => {
  test('each card is selected by its own values and by nothing else (the highlight is derived, not stored)', () => {
    for (const t of VIDEO_TEMPLATES) {
      expect(matchVideoTemplate(t.values)).toBe(t.id);
      expect(videoTemplateValues(t.id)).toEqual(t.values);
      expect(VIDEO_STYLES).toContain(t.values.style);
      expect([8, 24, 48]).toContain(t.values.duration);
    }
    expect(matchVideoTemplate({ mode: 'documentary', duration: 24, orientation: 'square', style: 'Horror' })).toBeNull();
    expect(videoTemplateValues('nope')).toBeNull();
  });
  test('the reel, trailer and teaser presets are absorbed with their exact values', () => {
    for (const p of VIDEO_PRESETS) {
      const t = VIDEO_TEMPLATES.find((x) => x.id === p.id)!;
      expect(t.values).toEqual({ mode: p.mode, duration: p.duration, orientation: p.orientation, style: p.style });
    }
  });
  test('a music-video card is 9:16 (the panel locks music videos to vertical)', () => {
    for (const t of VIDEO_TEMPLATES.filter((x) => x.values.mode === 'musicvideo')) expect(t.values.orientation).toBe('vertical');
  });
});

describe('image', () => {
  test('selection is derived; values are ones the panel can show', () => {
    for (const t of IMAGE_TEMPLATES) {
      expect(matchImageTemplate(t.values)).toBe(t.id);
      expect(imageTemplateValues(t.id)).toEqual(t.values);
      expect(IMG_STYLES).toContain(t.values.style);
      expect(IMG_ASPECTS).toContain(t.values.aspect);
    }
  });
  test('every image preset is absorbed — same aspect and style; a 4K preset became a 2K card (decision c)', () => {
    for (const p of IMAGE_PRESETS) {
      const t = IMAGE_TEMPLATES.find((x) => x.id === p.id)!;
      expect(t).toBeDefined();
      expect(t.values).toEqual({ aspect: p.aspect, quality: p.quality === 'ultra' ? 'high' : p.quality, style: p.style });
    }
  });
  test('no card defaults to 4K (owner decision 2026-10-01 c): Product, Poster and Wallpaper start at 2K', () => {
    for (const t of IMAGE_TEMPLATES) expect(t.values.quality).not.toBe('ultra');
    for (const id of ['product', 'poster', 'wallpaper']) expect(imageTemplateValues(id)!.quality).toBe('high');
    // …and no hint still promises 4K by default (a 2K card that says "at 4K" would describe a render it does not make).
    for (const t of IMAGE_TEMPLATES) expect(t.hint.en).not.toMatch(/\bat 4K\b/);
  });
  test('choosing Ultra by hand is still possible — the card just stops being lit', () => {
    const v = imageTemplateValues('product')!;
    expect(matchImageTemplate({ ...v, quality: 'ultra' })).toBeNull();
  });
});

describe('music', () => {
  test('selection is derived; genres are the score engine’s', () => {
    for (const t of MUSIC_TEMPLATES) {
      expect(matchMusicTemplate(t.values)).toBe(t.id);
      expect(musicTemplateValues(t.id)).toEqual(t.values);
      expect(MUSIC_GENRES).toContain(t.values.genre);
    }
  });
  test('an instrumental card stays selected whatever the (hidden) vocal says', () => {
    const bed = MUSIC_TEMPLATES.find((t) => t.values.instrumental)!;
    expect(matchMusicTemplate({ ...bed.values, voiceType: 'duet' })).toBe(bed.id);
  });
});

describe('avatar', () => {
  test('each presenter is a real preset face, with its voice and a format the panel offers', () => {
    for (const t of AVATAR_TEMPLATES) {
      expect(existsSync(join(process.cwd(), 'public', t.values.preset))).toBe(true);
      expect(t.thumb).toBe(t.values.preset); // the face IS the presenter
      expect(['9:16', '16:9', '1:1']).toContain(t.values.format);
      expect(matchAvatarTemplate({ preset: t.values.preset, format: t.values.format })).toBe(t.id);
      expect(avatarTemplateValues(t.id)).toEqual(t.values);
    }
    expect(matchAvatarTemplate({ preset: null, format: '9:16' })).toBeNull();
  });
});

describe('a request names a card only when it was PICKED and still matches (requestTemplateId)', () => {
  test('a lit card that nobody picked sends nothing — the defaults light the Reel, Photorealistic lights Product', () => {
    expect(requestTemplateId(null, matchVideoTemplate(VIDEO_PANEL_DEFAULTS))).toBeNull();
    expect(requestTemplateId(null, matchImageTemplate({ ...IMAGE_PANEL_DEFAULTS, style: 'Photorealistic' }))).toBeNull();
    expect(requestTemplateId(undefined, matchMusicTemplate({ ...MUSIC_PANEL_DEFAULTS, instrumental: true }))).toBeNull();
  });
  test('a picked card is sent only while the live values still select it', () => {
    expect(requestTemplateId('product', 'product')).toBe('product');
    expect(requestTemplateId('product', null)).toBeNull();
    expect(requestTemplateId('product', 'social')).toBeNull();
  });
  test('a malformed pick is never sent, even if it "matches"', () => {
    expect(requestTemplateId('Product', 'Product')).toBeNull();
    expect(requestTemplateId('', '')).toBeNull();
  });
});
