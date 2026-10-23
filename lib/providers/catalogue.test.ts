/** @jest-environment node */
/**
 * The model catalogue is what every picker shows and what the routes check a pick against. Pinned here: every row is
 * named in three languages with a short "best for", its capabilities are the wrapped module's own facts, the default per
 * service is a model its route always ran, nothing in it is a price, and the availability rules keep an unverified or
 * unenabled Higgsfield model off.
 */
import { capsFor, DEFAULT_MODEL_IDS } from '@/lib/veo/capabilities';
import { IMG_ASPECTS, IMAGE_MAX_REFERENCES } from '@/lib/studio/imageCreate';
import { MUSIC_ENGINE_CHAIN } from '@/lib/studio/musicEngines';
import {
  CATALOGUE, CATALOGUE_SERVICES, DEFAULT_MODEL, availabilityOf, catalogueEntry, catalogueFor, imageEndpointFor, imageQualitiesOf,
  isCatalogueService, tierForVideoModel, videoModelForTier, type CatalogueEntry, type DeploymentProbe,
} from './catalogue';

const GEORGIAN = /[Ⴀ-ჿ]/;
const CYRILLIC = /[Ѐ-ӿ]/;
/** A brand name ("Veo 3.1 Fast", "Nano Banana Pro", "Lyria 3") is written the same in every language; anything else is translated. */
const isBrand = (e: CatalogueEntry) => e.label.ka === e.label.en && e.label.en === e.label.ru;

describe('every row', () => {
  test.each(CATALOGUE.map((e) => [e.id, e] as const))('%s is named in ka / en / ru and says what it is for', (_id, e) => {
    for (const lang of ['ka', 'en', 'ru'] as const) {
      expect(e.label[lang].trim().length).toBeGreaterThan(1);
      expect(e.bestFor[lang].trim().length).toBeGreaterThan(5);
      expect(e.bestFor[lang].length).toBeLessThanOrEqual(120); // one line on a 375 px phone, wrapped at most once
    }
    // The "best for" line is always translated; a name is translated unless it is a brand.
    expect(e.bestFor.ka).toMatch(GEORGIAN);
    expect(e.bestFor.ru).toMatch(CYRILLIC);
    expect(e.bestFor.en).not.toMatch(GEORGIAN);
    if (!isBrand(e)) {
      expect(e.label.ka).toMatch(GEORGIAN);
      expect(e.label.ru).toMatch(CYRILLIC);
    }
    expect(CATALOGUE_SERVICES).toContain(e.service);
    expect(e.source.length).toBeGreaterThan(5);
  });

  test('ids are unique and never renamed into another service', () => {
    expect(new Set(CATALOGUE.map((e) => e.id)).size).toBe(CATALOGUE.length);
    for (const e of CATALOGUE) expect(catalogueEntry(e.id)).toBe(e);
    expect(catalogueEntry('nope')).toBeNull();
    expect(catalogueEntry(42)).toBeNull();
    expect(catalogueEntry('constructor')).toBeNull();
  });

  test('⚠️ nothing in it is a price — the price is the server quote for the id the request carries', () => {
    const json = JSON.stringify(CATALOGUE);
    expect(json).not.toMatch(/"(price|priceUsd|usd|gel|credits|cost)"/i);
    for (const e of CATALOGUE) expect(Object.keys(e)).not.toEqual(expect.arrayContaining(['price']));
  });

  test('Higgsfield rows run only through Studio β; Nano Banana is never a Higgsfield model (not in its catalogue)', () => {
    for (const e of CATALOGUE) {
      if (e.provider === 'higgsfield') expect(e.wire.runner).toBe('studio');
      if (e.wire.runner === 'studio') expect(e.provider).toBe('higgsfield');
      if (/nano|banana|seedream|gpt-image/i.test(`${e.id} ${e.label.en}`)) expect(e.provider).not.toBe('higgsfield');
    }
  });
});

describe('the defaults are what each route always ran', () => {
  test('one per service, a model of that service, never a flag-gated one', () => {
    for (const s of CATALOGUE_SERVICES) {
      const d = catalogueEntry(DEFAULT_MODEL[s])!;
      expect(d.service).toBe(s);
      expect(catalogueFor(s)).toContain(d);
    }
    expect(DEFAULT_MODEL.image).toBe('nb/auto');
    expect(DEFAULT_MODEL.video).toBe('google/veo-3.1-fast'); // OmniStudio's initialVeoPlan tier: 'fast'
    expect(DEFAULT_MODEL.music).toBe('music/auto');
    expect(isCatalogueService('video')).toBe(true);
    expect(isCatalogueService('avatar')).toBe(false); // nothing to choose — see the header
  });
});

describe('capabilities are the wrapped modules\' own facts', () => {
  test('Nano Banana: the image route\'s ten ratios and its ONE reference picture', () => {
    for (const e of catalogueFor('image').filter((x) => x.wire.runner === 'image')) {
      expect([...e.caps.aspectRatios]).toEqual([...IMG_ASPECTS]);
      expect(e.caps.references).toBe(IMAGE_MAX_REFERENCES);
      expect(e.caps.maxDurationSec).toBeNull();
    }
  });

  test('Veo: per tier, the Vertex row in lib/veo/capabilities (references, native aspects, the longest clip); the tier IS the model', () => {
    for (const tier of ['lite', 'fast', 'standard'] as const) {
      const e = videoModelForTier(tier);
      const c = capsFor(DEFAULT_MODEL_IDS.vertex[tier], 'vertex');
      expect(c.inferred).toBeUndefined();
      expect(e.caps.references).toBe(c.maxReferenceImages);
      expect([...e.caps.aspectRatios]).toEqual([...c.aspects]);
      expect(e.caps.maxDurationSec).toBe(8);
      expect(tierForVideoModel(e.id)).toBe(tier);
    }
    expect(videoModelForTier('lite').caps.references).toBe(0); // Lite takes no reference images
    expect(tierForVideoModel('hf/kling-3-std-t2v')).toBeNull();
    expect(tierForVideoModel('nope')).toBeNull();
  });

  test('music: exactly the route\'s chain, behind Auto — Google Lyria alone, no retired engine row (MASTER TASK v3.1)', () => {
    expect(catalogueFor('music').map((e) => e.id)).toEqual(['music/auto', ...MUSIC_ENGINE_CHAIN.map((id) => `music/${id}`)]);
    expect(catalogueFor('music').map((e) => e.id)).toEqual(['music/auto', 'music/lyria']);
    for (const e of catalogueFor('music')) expect(e).toMatchObject({ provider: 'google', vendor: 'Google' });
    for (const id of ['music/udio', 'music/elevenlabs-music', 'music/musicgen']) expect(catalogueEntry(id)).toBeNull();
  });
});

describe('the image route\'s wire', () => {
  const e = (id: string) => catalogueEntry(id)!;
  test('Auto is the route\'s old size map exactly — a request without `model` renders what it always did', () => {
    expect(['standard', 'high', 'ultra'].map((q) => imageEndpointFor(e('nb/auto'), q))).toEqual(['v2-1k', 'v2-2k', 'pro-4k']);
    expect(imageEndpointFor(e('nb/auto'), 'bogus')).toBe('v2-2k'); // the route's old fallback for an unknown quality
  });
  test('V2 pins the V2 family, Pro the Pro family; Pro has no 1K and renders a 1K request at its 2K', () => {
    expect(imageQualitiesOf(e('nb/v2'))).toEqual(['standard', 'high', 'ultra']);
    expect(imageQualitiesOf(e('nb/pro'))).toEqual(['high', 'ultra']);
    expect(imageEndpointFor(e('nb/pro'), 'standard')).toBe('pro-1k2k');
    expect(imageEndpointFor(e('nb/v2'), 'ultra')).toBe('v2-4k');
  });
  test('a model of another runner has no image endpoint', () => {
    expect(imageEndpointFor(e('hf/soul-2'), 'high')).toBeNull();
    expect(imageQualitiesOf(e('google/veo-3.1'))).toEqual([]);
  });
});

describe('availability: a refused vendor never runs, whatever the deployment says', () => {
  const probe = (over: Partial<DeploymentProbe> = {}): DeploymentProbe => ({ film: true, music: null, ...over });

  test('every Higgsfield row answers google_only — Higgsfield is a denied vendor (MASTER TASK v3.1), and its routes refuse first', () => {
    const studio = CATALOGUE.filter((e) => e.wire.runner === 'studio');
    expect(studio.length).toBeGreaterThan(0);
    for (const e of studio) expect(availabilityOf(e, probe())).toEqual({ available: false, reason: 'google_only' });
    // An unread schema is refused the same way: no env, flag or HF_ENABLED_MODELS opens it.
    const unread: CatalogueEntry = { ...studio[0], id: 'hf/unread-model', verified: 'unverified' };
    expect(availabilityOf(unread, probe())).toEqual({ available: false, reason: 'google_only' });
  });

  test('the probe carries no Higgsfield key, flag or enabled list any more', () => {
    expect(Object.keys(probe()).sort()).toEqual(['film', 'music']);
  });

  test('the film route: a renderer or nothing; the image route: always (its cascade refunds a miss)', () => {
    expect(availabilityOf(videoModelForTier('fast'), probe({ film: false }))).toEqual({ available: false, reason: 'not_configured' });
    expect(availabilityOf(catalogueEntry('nb/pro')!, probe({ film: false }))).toEqual({ available: true, reason: null });
  });

  test('music: an engine without a key is unavailable, a tripped breaker is busy; Auto and an unread status try', () => {
    const lyria = catalogueEntry('music/lyria')!;
    expect(availabilityOf(lyria, probe({ music: { lyria: { configured: false, busy: false } } })).reason).toBe('not_configured');
    expect(availabilityOf(lyria, probe({ music: { lyria: { configured: true, busy: true } } })).reason).toBe('busy');
    expect(availabilityOf(lyria, probe({ music: null })).available).toBe(true);
    expect(availabilityOf(catalogueEntry('music/auto')!, probe({ music: {} })).available).toBe(true);
  });
});
