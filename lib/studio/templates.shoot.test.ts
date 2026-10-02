/** @jest-environment node */
/**
 * The Interior designer's style cards and room types (lib/studio/templates.interior.ts) and the Photographer's shoot
 * presets and camera controls (lib/studio/templates.photoshoot.ts) — the same contract lib/studio/templates.test.ts
 * holds the other four galleries to: unique wire ids, three languages, an „Adds: …" line, a real thumbnail or none.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATE_ID_RX } from './templates';
import { INTERIOR_TEMPLATES, INTERIOR_PANEL_DEFAULTS, ROOM_TYPES, interiorAddsLine, interiorTemplate, roomOption } from './templates.interior';
import {
  ANGLE_OPTIONS, DOF_OPTIONS, LENS_OPTIONS, LIGHT_OPTIONS, PHOTOSHOOT_PANEL_DEFAULTS, PHOTOSHOOT_TEMPLATES,
  photoshootAddsLine, photoshootTemplate,
} from './templates.photoshoot';
import { ANGLE_IDS, DOF_IDS, LENS_IDS, LIGHT_IDS, ROOM_IDS } from './shootWire';
import { SHOOT_ASPECTS } from './shootQuote';
import { ALL_TOOLS } from './tools';

const LANGS = ['ka', 'en', 'ru'] as const;
const GALLERIES = [
  { tool: 'interior', list: INTERIOR_TEMPLATES, min: 10 },
  { tool: 'photoshoot', list: PHOTOSHOOT_TEMPLATES, min: 12 },
] as const;

describe.each(GALLERIES)('$tool templates', ({ tool, list, min }) => {
  test(`at least ${min} cards, unique ids, each a valid wire id (the server rejects anything else)`, () => {
    expect(list.length).toBeGreaterThanOrEqual(min);
    const ids = list.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of list) {
      expect(t.id).toMatch(TEMPLATE_ID_RX);
      expect(t.tool).toBe(tool);
    }
  });

  test('every card has a label, a hint and an „Adds" copy in ka, en and ru — and they differ per language', () => {
    for (const t of list) {
      for (const l of LANGS) {
        for (const field of ['label', 'hint', 'adds'] as const) {
          expect({ id: t.id, l, field, ok: t[field][l].trim().length > 0 }).toEqual({ id: t.id, l, field, ok: true });
        }
      }
      expect(t.label.ka).not.toBe(t.label.en);
      expect(t.label.ru).not.toBe(t.label.en);
      // Georgian is Mkhedruli and Russian is Cyrillic — never an English string pasted into a locale.
      expect(t.label.ka).toMatch(/[ა-ჿ]/);
      expect(t.hint.ka).toMatch(/[ა-ჿ]/);
      expect(t.adds.ka).toMatch(/[ა-ჿ]/);
      expect(t.label.ru).toMatch(/[Ѐ-ӿ]/);
      expect(t.hint.ru).toMatch(/[Ѐ-ӿ]/);
      expect(t.adds.ru).toMatch(/[Ѐ-ӿ]/);
    }
  });

  test('the „Adds: …" line is one short line starting with the language\'s own word', () => {
    const line = (t: (typeof list)[number], l: (typeof LANGS)[number]) =>
      tool === 'interior' ? interiorAddsLine(t as (typeof INTERIOR_TEMPLATES)[number], l) : photoshootAddsLine(t as (typeof PHOTOSHOOT_TEMPLATES)[number], l);
    for (const t of list) {
      for (const l of LANGS) {
        const s = line(t, l);
        expect(s).not.toMatch(/\n/);
        expect(s.length).toBeLessThanOrEqual(72);
      }
      expect(line(t, 'en')).toMatch(/^Adds: \S/);
      expect(line(t, 'ka')).toMatch(/^ამატებს: \S/);
      expect(line(t, 'ru')).toMatch(/^Добавляет: \S/);
    }
  });

  test('thumbnails are well-formed: null until the art exists, else /templates/<tool>/<id>.jpg and the file is there', () => {
    for (const t of list) {
      if (t.thumb === null) continue;
      expect(t.thumb).toBe(`/templates/${tool}/${t.id}.jpg`);
      expect(existsSync(join(process.cwd(), 'public', t.thumb))).toBe(true);
    }
  });

  test('every card has a two-colour palette tile (#RRGGBB) for the no-picture state', () => {
    for (const t of list) {
      expect(t.palette).toHaveLength(2);
      for (const c of t.palette) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  test('a card keeps `tool: …, id: …,` on one line and `thumb:` within a few lines — what scripts/templates/build-thumbs.mjs greps', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'studio', `templates.${tool === 'interior' ? 'interior' : 'photoshoot'}.ts`), 'utf8');
    const lines = src.split('\n');
    for (const t of list) {
      const head = lines.findIndex((l) => l.includes(`tool: '${tool}', id: '${t.id}',`));
      expect({ id: t.id, found: head >= 0 }).toEqual({ id: t.id, found: true });
      const thumb = lines.slice(head, head + 12).findIndex((l) => /^\s*(?:thumb: |.*\bthumb: )(?:null|'[^'\n]{0,200}')/.test(l));
      expect({ id: t.id, thumbNearby: thumb >= 0 }).toEqual({ id: t.id, thumbNearby: true });
    }
  });
});

describe('interior designer', () => {
  test('names the styles the owner asked for', () => {
    const ids = INTERIOR_TEMPLATES.map((t) => t.id);
    for (const id of ['scandinavian', 'modern', 'minimalist', 'japandi', 'loft', 'classic', 'art-deco', 'boho', 'mediterranean', 'georgian-traditional']) {
      expect(ids).toContain(id);
    }
  });
  test('room types: every wire id has a labelled chip, `auto` first, in three languages', () => {
    expect(ROOM_TYPES.map((r) => r.id)).toEqual([...ROOM_IDS]);
    expect(ROOM_TYPES[0]!.id).toBe('auto');
    for (const r of ROOM_TYPES) for (const l of LANGS) expect(r.label[l].trim().length).toBeGreaterThan(0);
    for (const id of ['living-room', 'bedroom', 'kitchen', 'bathroom', 'home-office', 'kids-room', 'dining-room']) expect(roomOption(id)).not.toBeNull();
    expect(roomOption('constructor')).toBeNull();
  });
  test('nothing is picked before the user picks it (a request names a style only once chosen)', () => {
    expect(INTERIOR_PANEL_DEFAULTS.template).toBeNull();
    expect(INTERIOR_PANEL_DEFAULTS.quality).toBe('high'); // 2K — no card defaults to 4K (owner decision 2026-10-01 c)
    expect(interiorTemplate('scandinavian')?.id).toBe('scandinavian');
    expect(interiorTemplate('constructor')).toBeNull();
    expect(interiorTemplate(null)).toBeNull();
  });
});

describe('photographer', () => {
  test('names the shoots the owner asked for', () => {
    const ids = PHOTOSHOOT_TEMPLATES.map((t) => t.id);
    for (const id of ['ecom-white', 'lifestyle', 'editorial-fashion', 'luxury-product', 'food', 'jewelry', 'cosmetics', 'headshot', 'real-estate-exterior', 'street', 'studio-portrait', 'film-noir']) {
      expect(ids).toContain(id);
    }
  });
  test('a preset suggests a ratio the image route accepts', () => {
    for (const t of PHOTOSHOOT_TEMPLATES) expect(SHOOT_ASPECTS as readonly string[]).toContain(t.aspect);
  });
  test('the camera controls are exactly the owner\'s: 24/35/50/85 mm · five lights · three angles · depth of field', () => {
    expect(LENS_OPTIONS.map((o) => o.id)).toEqual([...LENS_IDS]);
    expect(LIGHT_OPTIONS.map((o) => o.id)).toEqual([...LIGHT_IDS]);
    expect(ANGLE_OPTIONS.map((o) => o.id)).toEqual([...ANGLE_IDS]);
    expect(DOF_OPTIONS.map((o) => o.id)).toEqual([...DOF_IDS]);
    expect(LENS_IDS).toEqual(['24', '35', '50', '85']);
    for (const o of [...LENS_OPTIONS, ...LIGHT_OPTIONS, ...ANGLE_OPTIONS, ...DOF_OPTIONS]) for (const l of LANGS) expect(o.label[l].trim().length).toBeGreaterThan(0);
  });
  test('nothing is picked by default, and the camera starts on the preset\'s own look', () => {
    expect(PHOTOSHOOT_PANEL_DEFAULTS).toMatchObject({ template: null, lens: null, light: null, angle: null, dof: null, quality: 'high' });
    expect(photoshootTemplate('ecom-white')?.subject).toBe('product');
    expect(photoshootTemplate('headshot')?.subject).toBe('person');
    expect(photoshootTemplate('__proto__')).toBeNull();
  });
  test('is NOT the on-device culling tool: the photographer\'s id is `photoshoot`', () => {
    expect(ALL_TOOLS).toContain('photoshoot');
    expect(ALL_TOOLS).toContain('photo');
  });
});
