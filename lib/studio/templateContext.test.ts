/** @jest-environment node */
/**
 * lib/studio/templateContext — a template card's context is resolved on the SERVER from its id, and only when the
 * request's own values still select that card (owner decision 2026-10-01 A-a; avatar cards add nothing, A-f).
 */
jest.mock('server-only', () => ({}));

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIRECTOR_NOTE_MAX, IMAGE_SUFFIX_MAX, MUSIC_DESCRIPTOR_MAX, TEMPLATE_CONTEXT_IDS, VIDEO_LOOK_MAX,
  resolveFilmTemplate, resolveTemplateContext,
} from './templateContext';
import { AVATAR_TEMPLATES, IMAGE_TEMPLATES, MUSIC_TEMPLATES, VIDEO_TEMPLATES, imageTemplateValues, musicTemplateValues } from './templates';
import { TEMPLATE_NOTE_MAX } from '@/lib/chat/promptAgent';
import { buildMusicBrief } from '@/lib/ai/musicBrief';

const img = (id: string) => imageTemplateValues(id)!;
const mus = (id: string) => musicTemplateValues(id)!;

describe('a card resolves its context only for the values that select it', () => {
  test('every image card resolves its own suffix from its own values', () => {
    for (const t of IMAGE_TEMPLATES) {
      const ctx = resolveTemplateContext('image', t.id, t.values);
      expect(ctx).not.toBeNull();
      expect(ctx!.id).toBe(t.id);
      expect(ctx!.suffix.length).toBeGreaterThan(20);
    }
  });

  test('every music card resolves its own descriptor from its own values', () => {
    for (const t of MUSIC_TEMPLATES) {
      expect(resolveTemplateContext('music', t.id, t.values)?.descriptor).toBeTruthy();
    }
  });

  test('every video card resolves its look + director note from its style and mode', () => {
    for (const t of VIDEO_TEMPLATES) {
      const ctx = resolveTemplateContext('video', t.id, { style: t.values.style, musicVideoMode: t.values.mode === 'musicvideo' });
      expect(ctx).not.toBeNull();
      expect(ctx!.look).toBeTruthy();
      expect(ctx!.directorNote).toBeTruthy();
    }
  });

  test('a MISMATCHED id resolves to null — `anime` sent with style Photorealistic adds nothing', () => {
    expect(resolveTemplateContext('image', 'anime', { ...img('anime'), style: 'Photorealistic' })).toBeNull();
    expect(resolveTemplateContext('video', 'anime', { style: 'Photorealistic', musicVideoMode: false })).toBeNull();
    // One field off is enough: the card is no longer lit, so it adds nothing.
    expect(resolveTemplateContext('image', 'product', { ...img('product'), aspect: '16:9' })).toBeNull();
    expect(resolveTemplateContext('image', 'product', { ...img('product'), quality: 'ultra' })).toBeNull();
    expect(resolveTemplateContext('music', 'georgian-folk', { ...mus('georgian-folk'), duration: 30 })).toBeNull();
    expect(resolveTemplateContext('music', 'georgian-folk', { ...mus('georgian-folk'), voiceType: 'male' })).toBeNull();
    expect(resolveTemplateContext('music', 'georgian-folk', { ...mus('georgian-folk'), instrumental: true })).toBeNull();
  });

  test('a card BORROWED from another card (or tool) adds nothing', () => {
    // poster's id with the wallpaper's values: both exist, but these values select wallpaper.
    expect(resolveTemplateContext('image', 'poster', img('wallpaper'))).toBeNull();
    // A music id sent to the image resolver, and a video id to the music one.
    expect(resolveTemplateContext('image', 'lofi-chill', img('product'))).toBeNull();
    expect(resolveTemplateContext('music', 'noir', mus('lofi-chill'))).toBeNull();
  });

  test('the music-video card needs music-video mode, and the documentary cards need its absence', () => {
    expect(resolveTemplateContext('video', 'music-video', { style: 'Neon', musicVideoMode: false })).toBeNull();
    expect(resolveTemplateContext('video', 'neon-nights', { style: 'Neon', musicVideoMode: true })).toBeNull();
    expect(resolveTemplateContext('video', 'music-video', { style: 'Neon', musicVideoMode: true })?.id).toBe('music-video');
  });

  test.each([
    ['unknown', 'not-a-template'],
    ['uppercase', 'PRODUCT'],
    ['padded', ' product'],
    ['too long', 'p'.repeat(41)],
    ['path-like', '../product'],
    ['an inherited key', 'constructor'],
    ['an inherited key', '__proto__'],
    ['an inherited key', 'tostring'],
    ['a number', 7],
    ['an object', { id: 'product' }],
    ['empty', ''],
    ['absent', undefined],
  ])('a tampered id (%s) resolves to null', (_label, id) => {
    expect(resolveTemplateContext('image', id, img('product'))).toBeNull();
    expect(resolveTemplateContext('music', id, mus('georgian-folk'))).toBeNull();
    expect(resolveTemplateContext('video', id, { style: 'Noir', musicVideoMode: false })).toBeNull();
  });

  test('a presenter card resolves nothing (decision A-f)', () => {
    for (const t of AVATAR_TEMPLATES) expect(resolveTemplateContext('avatar', t.id, t.values)).toBeNull();
  });

  test('wide request types work: the route reads quality and tempo as plain strings', () => {
    expect(resolveTemplateContext('image', 'social', { aspect: '4:5', quality: 'high', style: 'Photorealistic' })?.id).toBe('social');
    // An instrumental card ignores the vocal the route parsed (empty when none was sent).
    expect(resolveTemplateContext('music', 'lofi-chill', { genre: 'lo-fi', tempo: 'slow', duration: 60, instrumental: true, voiceType: '' })?.id).toBe('lofi-chill');
  });
});

describe('the caps hold', () => {
  test('every resolved string is one line and within its cap', () => {
    for (const t of IMAGE_TEMPLATES) {
      const s = resolveTemplateContext('image', t.id, t.values)!.suffix;
      expect(s.length).toBeLessThanOrEqual(IMAGE_SUFFIX_MAX);
      expect(s).not.toMatch(/[\r\n]/);
    }
    for (const t of MUSIC_TEMPLATES) {
      const d = resolveTemplateContext('music', t.id, t.values)!.descriptor;
      expect(d.length).toBeLessThanOrEqual(MUSIC_DESCRIPTOR_MAX);
      expect(d).not.toMatch(/[\r\n]/);
    }
    for (const t of VIDEO_TEMPLATES) {
      const v = resolveTemplateContext('video', t.id, { style: t.values.style, musicVideoMode: t.values.mode === 'musicvideo' })!;
      expect(v.look.length).toBeLessThanOrEqual(VIDEO_LOOK_MAX);
      expect(v.directorNote.length).toBeLessThanOrEqual(DIRECTOR_NOTE_MAX);
      expect(`${v.look}${v.directorNote}`).not.toMatch(/[\r\n]/);
    }
  });

  test('the caps are the plan\'s numbers, and the director agent enforces the same one', () => {
    expect([IMAGE_SUFFIX_MAX, MUSIC_DESCRIPTOR_MAX, VIDEO_LOOK_MAX, DIRECTOR_NOTE_MAX]).toEqual([200, 160, 160, 400]);
    expect(TEMPLATE_NOTE_MAX).toBe(DIRECTOR_NOTE_MAX);
  });

  test('a film look is affirmative prose (a video model reads "no X" as a request for X)', () => {
    for (const t of VIDEO_TEMPLATES) {
      const v = resolveTemplateContext('video', t.id, { style: t.values.style, musicVideoMode: t.values.mode === 'musicvideo' })!;
      expect(v.look).not.toMatch(/\b(?:no|not|never|without|avoid)\b/i);
    }
  });
});

describe('server and client agree on which cards add something', () => {
  test('a card shows „Adds: …" exactly when the server resolves a context for it', () => {
    expect([...TEMPLATE_CONTEXT_IDS.image].sort()).toEqual(IMAGE_TEMPLATES.map((t) => t.id).sort());
    expect([...TEMPLATE_CONTEXT_IDS.music].sort()).toEqual(MUSIC_TEMPLATES.map((t) => t.id).sort());
    expect([...TEMPLATE_CONTEXT_IDS.video].sort()).toEqual(VIDEO_TEMPLATES.map((t) => t.id).sort());
  });

  test('the context strings never reach client code: the module is server-only and only server code imports it', () => {
    const src = readFileSync(join(__dirname, 'templateContext.ts'), 'utf8');
    expect(src).toMatch(/^import 'server-only';$/m);
    // No component (and none of the client-safe studio modules) imports it.
    const imports = /(?:from|import)\s*\(?\s*['"][^'"]*templateContext['"]/;
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && imports.test(readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    walk(join(__dirname, '..', '..', 'components'));
    for (const f of ['templates.ts', 'musicRegen.ts', 'composeImagePrompt.ts']) {
      if (imports.test(readFileSync(join(__dirname, f), 'utf8'))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
    // The client-safe catalogue must not carry the context text (spot-check the most specific strings).
    const catalogue = readFileSync(join(__dirname, 'templates.ts'), 'utf8');
    expect(catalogue).not.toContain('chiaroscuro');
    expect(catalogue).not.toContain('three-part choral harmony');
  });
});

describe('the Georgian Folk brief', () => {
  test('carries the descriptor and still keeps the user\'s own prompt and lyrics', () => {
    const ctx = resolveTemplateContext('music', 'georgian-folk', mus('georgian-folk'))!;
    const userPrompt = 'a song for my grandmother\'s 90th birthday in Kakheti, warm and joyful';
    const brief = buildMusicBrief({
      prompt: userPrompt, style: 'folk', templateDescriptor: ctx.descriptor,
      vocalDescriptor: 'female vocals, female singer', lyrics: 'ბებია, ბებია, ჩვენი მზე', instrumental: false,
    });
    expect(brief.prompt).toContain(userPrompt);
    expect(brief.prompt).toContain('Georgian polyphonic folk');
    expect(brief.prompt).toContain('female vocals');
    expect(brief.lyrics).toBe('ბებია, ბებია, ჩვენი მზე');
    expect(brief.truncated).toEqual({ prompt: false, lyrics: false });
  });
});

describe('storyboard and render resolve the same look', () => {
  test('the storyboard body and the render metadata, as the studio sends them, give one look per card', () => {
    for (const t of VIDEO_TEMPLATES) {
      const musicVideo = t.values.mode === 'musicvideo';
      // The storyboard route: body.style (cleaned) + `body.musicVideoMode === true`.
      const board = resolveFilmTemplate({ templateId: t.id, style: t.values.style, musicVideoMode: musicVideo });
      // filmComposite: the metadata's style + `!!metadata.musicVideoMode` (orchestrate only forwards `true`).
      const metadata: Record<string, unknown> = { templateId: t.id, style: t.values.style, ...(musicVideo ? { musicVideoMode: true } : {}) };
      const render = resolveFilmTemplate({ templateId: metadata.templateId, style: metadata.style as string, musicVideoMode: !!metadata.musicVideoMode });
      expect(board).not.toBeNull();
      expect(render).toEqual(board);
    }
  });

  test('a render whose style changed after the board was approved drops the look on both sides alike', () => {
    expect(resolveFilmTemplate({ templateId: 'noir', style: 'Cinematic', musicVideoMode: false })).toBeNull();
  });
});
