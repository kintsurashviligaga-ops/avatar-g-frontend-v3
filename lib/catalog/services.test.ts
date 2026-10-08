import {
  SERVICE_CATALOG, SERVICE_CATEGORIES, LEGACY_SLUG_TO_SERVICE,
  getService, usableServices, countServices, servicesInCategory, serviceHref, resolveService, toolsInCatalog,
} from './services';
import { ALL_TOOLS } from '@/lib/studio/tools';
import { quoteCredits, type QuoteTool } from '@/lib/credits/quote';

// Every key quoteCredits() prices. Kept as a list (not derived) so a new QuoteTool forces this file to be read.
const QUOTE_TOOLS: QuoteTool[] = ['image', 'video', 'music', 'avatar', 'remix', 'swap', 'motion', 'product', 'model3d', 'chat', 'interior', 'photoshoot'];

describe('service catalog — shape', () => {
  it('has unique ids, unique orders and known categories', () => {
    const ids = SERVICE_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const orders = SERVICE_CATALOG.map((s) => s.order);
    expect(new Set(orders).size).toBe(orders.length);
    const cats = new Set(SERVICE_CATEGORIES.map((c) => c.id));
    for (const s of SERVICE_CATALOG) {
      expect(cats.has(s.category)).toBe(true);
      for (const sc of s.shortcuts) {
        expect(cats.has(sc)).toBe(true);
        expect(sc).not.toBe(s.category);
      }
    }
  });

  it('labels and describes every service in ka, en and ru', () => {
    for (const s of SERVICE_CATALOG) {
      for (const t of [s.label, s.description, ...s.modes.map((m) => m.label)]) {
        expect(t.ka.trim()).not.toBe('');
        expect(t.en.trim()).not.toBe('');
        expect(t.ru.trim()).not.toBe('');
      }
      expect(s.aliases.length).toBeGreaterThan(0);
    }
  });

  it('maps every studio tool to a service — nothing in the studio is orphaned', () => {
    expect(toolsInCatalog()).toEqual([...ALL_TOOLS]);
  });

  it('never calls a service live without a runtime', () => {
    for (const s of SERVICE_CATALOG) {
      if (s.tool === null) expect(['coming-soon', 'hidden', 'deprecated']).toContain(s.status);
      if (s.status === 'coming-soon') {
        expect(s.agentCallable).toBe(false);
        expect(s.visibleInTools).toBe(false);
        expect(s.visibleInServices).toBe(false);
      }
    }
  });

  it('prices every paid service with a real quote key', () => {
    for (const s of SERVICE_CATALOG) {
      if (s.pricingKey === null) continue;
      expect(QUOTE_TOOLS).toContain(s.pricingKey);
      if (s.pricingKey !== 'chat') expect(quoteCredits({ tool: s.pricingKey })).toBeGreaterThan(0);
    }
  });

  it('names the provider on every boundary violation', () => {
    for (const s of SERVICE_CATALOG.filter((x) => x.boundary === 'violation')) {
      expect(s.boundaryNote ?? '').not.toBe('');
    }
  });

  it('has one canonical service per studio tool and mode — a shortcut never becomes a second runtime', () => {
    const seen = new Map<string, string>();
    for (const s of SERVICE_CATALOG) {
      if (!s.tool) continue;
      const modeKeys = new Set(s.modes.length ? s.modes.map((m) => JSON.stringify(m.query ?? {})) : ['{}']);
      for (const k of modeKeys) {
        const key = `${s.tool}|${k}`;
        // Chat-backed services share the chat runtime by design (writing, code, search are Agent G capabilities).
        if (s.tool === 'chat') continue;
        expect(seen.get(key)).toBeUndefined();
        seen.set(key, s.id);
      }
    }
  });
});

describe('service catalog — counts come from the catalog', () => {
  it('counts the usable services shown on /services', () => {
    const shown = usableServices().filter((s) => s.visibleInServices);
    expect(countServices()).toBe(shown.length);
    expect(shown.every((s) => s.status === 'live' || s.status === 'beta')).toBe(true);
  });

  it('lists a category\'s own services before the shortcuts it borrows', () => {
    const music = servicesInCategory('music');
    expect(music.map((x) => x.service.id)).toEqual(['music.generate', 'video.music-video']);
    expect(music[1].shortcut).toBe(true);
    // music.remix is coming-soon: it is not offered as a usable card.
    expect(music.some((x) => x.service.id === 'music.remix')).toBe(false);
  });
});

describe('serviceHref — one studio link per service', () => {
  it('opens the studio tool, with the mode query when the service has one', () => {
    expect(serviceHref('video.generate', 'ka')).toBe('/ka/dashboard?tool=video');
    expect(serviceHref('video.generate', 'en', 'documentary')).toBe('/en/dashboard?tool=video&mode=documentary');
    expect(serviceHref('video.music-video', 'ru')).toBe('/ru/dashboard?tool=video&mode=musicvideo');
    expect(serviceHref('voice.dubbing', 'ka')).toBe('/ka/dashboard?tool=dubbing');
  });

  it('gives a shortcut the same link as its canonical service', () => {
    for (const { service } of servicesInCategory('music').filter((x) => x.shortcut)) {
      expect(serviceHref(service.id, 'ka')).toBe(serviceHref(getService(service.id)!.id, 'ka'));
    }
  });

  it('has no link for a service without a runtime, or an unknown id', () => {
    expect(serviceHref('music.remix', 'ka')).toBeNull();
    expect(serviceHref('code.terminal', 'ka')).toBeNull();
    expect(serviceHref('nope', 'ka')).toBeNull();
  });
});

describe('resolveService — Agent G intent and search', () => {
  const cases: [string, string][] = [
    ['make a music video for my song', 'video.music-video'],
    ['მუსიკალური ვიდეო გამიკეთე', 'video.music-video'],
    ['ამ ვიდეოს ხმა ქართულად გადამითარგმნე', 'voice.dubbing'],
    ['переведи это видео, нужен дубляж', 'voice.dubbing'],
    ['მუსიკა დამირემიქსე', 'music.remix'],
    ['remix this video with captions', 'video.remix'],
    ['create a product ad for my sneakers', 'video.product-ad'],
    ['lip sync this photo to my voice', 'avatar.talking'],
    ['swap the character in this clip', 'video.character-swap'],
    ['write a podcast script about Tbilisi', 'text.write'],
    ['text to video about the sea', 'video.generate'],
    ['დახატე მთები', 'image.generate'],
    ['напиши песню', 'music.generate'],
    ['find the news about AI', 'research.web-search'],
    ['make me a presentation on climate', 'design.presentation'],
  ];
  it.each(cases)('%s → %s', (text, id) => {
    expect(resolveService(text)?.id).toBe(id);
  });

  it('does not let a short alias match inside a longer word', () => {
    // "ad" is the product-ad alias; "admin" must not resolve to it.
    expect(resolveService('admin panel')).toBeNull();
  });

  it('accepts inflected forms (Georgian case endings, English plurals)', () => {
    expect(resolveService('ვიდეოს გაკეთება მინდა')?.id).toBe('video.generate');
    expect(resolveService('two videos please')?.id).toBe('video.generate');
  });

  it('returns null for empty or unrelated text', () => {
    expect(resolveService('')).toBeNull();
    expect(resolveService('   ')).toBeNull();
    expect(resolveService('hello there')).toBeNull();
  });
});

describe('legacy service slugs', () => {
  it('point at a catalog service that has a studio link', () => {
    for (const [slug, id] of Object.entries(LEGACY_SLUG_TO_SERVICE)) {
      const s = getService(id);
      expect(s).toBeDefined();
      expect(serviceHref(id, 'ka')).not.toBeNull();
      expect(slug).toMatch(/^[a-z-]+$/);
    }
  });
});
