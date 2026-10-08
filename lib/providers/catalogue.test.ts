/** @jest-environment node */
/**
 * The model catalogue is what every picker shows and what the routes check a pick against. Pinned here: every row is
 * named in three languages with a short "best for", its capabilities are the wrapped module's own facts, the default per
 * service is a model its route always ran, nothing in it is a price, and the availability rules keep an unverified or
 * unenabled Higgsfield model off. MyAvatar v32 (lib/providers/policy): only permitted providers' rows are offered at all;
 * the retired rows survive only as legacy definitions (old jobs stay readable) and are never available.
 */
import { isProviderPermitted } from './policy';
import { capsFor, DEFAULT_MODEL_IDS } from '@/lib/veo/capabilities';
import { IMG_ASPECTS, IMAGE_MAX_REFERENCES } from '@/lib/studio/imageCreate';
import { MUSIC_ENGINE_CHAIN } from '@/lib/studio/musicEngines';
import {
  CATALOGUE, CATALOGUE_SERVICES, DEFAULT_MODEL, availabilityOf, catalogueEntry, catalogueFor, imageEndpointFor, imageQualitiesOf,
  isCatalogueService, legacyCatalogueDefinition, tierForVideoModel, videoModelForTier, type CatalogueEntry, type DeploymentProbe,
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

  test('MyAvatar v32: every row offered is a permitted provider; a retired row is a legacy definition only', () => {
    for (const e of CATALOGUE) expect(isProviderPermitted(e.provider, e.service === 'motion' ? 'video' : e.service)).toBe(true);
    expect(CATALOGUE.map((e) => e.provider)).not.toEqual(expect.arrayContaining(['higgsfield']));
    expect(catalogueEntry('music/udio')).toBeNull(); // the music chain itself is Lyria-only now
    for (const id of ['hf/soul-2', 'hf/kling-3-std-t2v', 'hf/kling-3-motion-std']) {
      expect(catalogueEntry(id)).toBeNull();
      expect(legacyCatalogueDefinition(id)?.id).toBe(id);
    }
  });
});

describe('the defaults are what each route always ran', () => {
  test('one per service, a model of that service, never a flag-gated one', () => {
    for (const s of CATALOGUE_SERVICES.filter((x) => x !== 'motion')) {
      const d = catalogueEntry(DEFAULT_MODEL[s])!;
      expect(d.service).toBe(s);
      expect(catalogueFor(s)).toContain(d);
    }
    // Motion transfer ran only on Higgsfield, which v32 retired: nothing is offered and its old default resolves to nothing.
    expect(catalogueFor('motion')).toEqual([]);
    expect(catalogueEntry(DEFAULT_MODEL.motion)).toBeNull();
    expect(legacyCatalogueDefinition(DEFAULT_MODEL.motion)?.provider).toBe('higgsfield');
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

  test('Veo: per tier, lib/veo/capabilities (references, native aspects, the longest clip); the tier IS the model', () => {
    for (const tier of ['lite', 'fast', 'standard'] as const) {
      const e = videoModelForTier(tier);
      const c = capsFor(DEFAULT_MODEL_IDS.gemini[tier]);
      expect(e.caps.references).toBe(c.maxReferenceImages);
      expect([...e.caps.aspectRatios]).toEqual([...c.aspects]);
      expect(e.caps.maxDurationSec).toBe(8);
      expect(tierForVideoModel(e.id)).toBe(tier);
    }
    expect(videoModelForTier('lite').caps.references).toBe(0); // Lite takes no reference images
    expect(tierForVideoModel('hf/kling-3-std-t2v')).toBeNull();
    expect(tierForVideoModel('nope')).toBeNull();
  });

  test('music: exactly the route\'s chain, behind Auto', () => {
    expect(catalogueFor('music').map((e) => e.id)).toEqual(['music/auto', ...MUSIC_ENGINE_CHAIN.map((id) => `music/${id}`)]);
  });
});

describe('the image route\'s wire', () => {
  const e = (id: string) => catalogueEntry(id)!;
  test('Auto is the route\'s old size map exactly — a request without `model` renders what it always did', () => {
    expect(['standard', 'high', 'ultra'].map((q) => imageEndpointFor(e('nb/auto'), q))).toEqual(['v2-1k', 'v2-2k', 'pro-4k']);
    expect(imageEndpointFor(e('nb/auto'), 'bogus')).toBe('v2-2k'); // the route's old fallback for an unknown quality
  });
  test('every image model renders Imagen at its one native size (1K); the old endpoint map still resolves a legacy size', () => {
    for (const id of ['nb/auto', 'nb/v2', 'nb/pro']) expect(imageQualitiesOf(e(id))).toEqual(['standard']);
    expect(imageEndpointFor(e('nb/pro'), 'standard')).toBe('pro-1k2k');
    expect(imageEndpointFor(e('nb/v2'), 'ultra')).toBe('v2-4k');
  });
  test('a model of another runner has no image endpoint', () => {
    expect(imageEndpointFor(legacyCatalogueDefinition('hf/soul-2')!, 'high')).toBeNull();
    expect(imageQualitiesOf(e('google/veo-3.1'))).toEqual([]);
  });
});

describe('availability: an unverified or unenabled model never runs', () => {
  const probe = (over: Partial<DeploymentProbe> = {}): DeploymentProbe => ({
    higgsfield: true, studioV2: true, hfEnabled: () => true, film: true, music: null, ...over,
  });
  const kling = legacyCatalogueDefinition('hf/kling-3-std-t2v')!;
  const NOT_ENABLED = { available: false, reason: 'not_enabled' };

  test('a Higgsfield row is never available under v32 — not even with the list, the studio flag and the keys all set', () => {
    expect(availabilityOf(kling, probe())).toEqual(NOT_ENABLED);
    expect(availabilityOf(kling, probe({ hfEnabled: () => false, studioV2: false, higgsfield: false }))).toEqual(NOT_ENABLED);
    expect(availabilityOf(kling, probe({ studioV2: false, higgsfield: false }))).toEqual(NOT_ENABLED);
    expect(availabilityOf(kling, probe({ higgsfield: false }))).toEqual(NOT_ENABLED);
  });

  test('the provider policy is checked before "coming soon": an unverified Higgsfield schema is not enabled, named or not', () => {
    const unread: CatalogueEntry = { ...kling, id: 'hf/unread-model', verified: 'unverified' };
    expect(availabilityOf(unread, probe({ hfEnabled: () => false }))).toEqual(NOT_ENABLED);
    expect(availabilityOf(unread, probe({ hfEnabled: (id) => id === 'hf/unread-model' }))).toEqual(NOT_ENABLED);
  });

  test('the film route: a renderer or nothing; the image route: Imagen configured or nothing (no reseller cascade behind it)', () => {
    expect(availabilityOf(videoModelForTier('fast'), probe({ film: false }))).toEqual({ available: false, reason: 'not_configured' });
    expect(availabilityOf(videoModelForTier('fast'), probe({ film: true }))).toEqual({ available: true, reason: null });
    const pro = catalogueEntry('nb/pro')!;
    expect(availabilityOf(pro, probe({ image: true, higgsfield: false, studioV2: false, film: false }))).toEqual({ available: true, reason: null });
    expect(availabilityOf(pro, probe({ image: false }))).toEqual({ available: false, reason: 'not_configured' });
    expect(availabilityOf(pro, probe())).toEqual({ available: false, reason: 'not_configured' }); // not read → unavailable
  });

  test('music: Lyria without a key is unavailable, a tripped breaker is busy; Auto follows Lyria, and an unread status fails closed', () => {
    const lyria = catalogueEntry('music/lyria')!;
    const auto = catalogueEntry('music/auto')!;
    expect(availabilityOf(lyria, probe({ music: { lyria: { configured: false, busy: false } } })).reason).toBe('not_configured');
    expect(availabilityOf(lyria, probe({ music: { lyria: { configured: true, busy: true } } })).reason).toBe('busy');
    expect(availabilityOf(lyria, probe({ music: { lyria: { configured: true, busy: false } } }))).toEqual({ available: true, reason: null });
    expect(availabilityOf(auto, probe({ music: { lyria: { configured: true, busy: false } } }))).toEqual({ available: true, reason: null });
    expect(availabilityOf(lyria, probe({ music: null }))).toEqual({ available: false, reason: 'not_configured' });
    expect(availabilityOf(auto, probe({ music: {} }))).toEqual({ available: false, reason: 'not_configured' });
  });
});
