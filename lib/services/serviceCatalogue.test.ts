/** @jest-environment node */
import {
  SERVICE_CATALOGUE,
  getService,
  liveServices,
  serviceHref,
  serviceName,
  serviceTagline,
  type ServiceId,
} from './serviceCatalogue';
import { SERVICE_TYPES } from '@/lib/services/billing/costModel';
import { TOOL_META, isToolId } from '@/lib/studio/tools';

describe('the ten official services', () => {
  it('is exactly ten, with unique ids', () => {
    expect(SERVICE_CATALOGUE).toHaveLength(10);
    expect(new Set(SERVICE_CATALOGUE.map((s) => s.id)).size).toBe(10);
  });

  it('uses the SAME ids as the billing cost model, so a tile can be priced without a mapping table', () => {
    const catalogue = [...SERVICE_CATALOGUE.map((s) => s.id)].sort();
    const billing = [...SERVICE_TYPES].sort();
    expect(catalogue).toEqual(billing);
  });

  it('is fully localized in all three locales', () => {
    for (const s of SERVICE_CATALOGUE) {
      for (const loc of ['ka', 'en', 'ru'] as const) {
        expect(s.name[loc].length).toBeGreaterThan(0);
        expect(s.tagline[loc].length).toBeGreaterThan(0);
      }
      expect(s.icon.length).toBeGreaterThan(0);
    }
  });

  it('has nine services live; 3D is off because its only engine (Replicate) is refused in production', () => {
    // A tile is only allowed to be live when its provider can genuinely run. model3d runs on Replicate TRELLIS,
    // which /api/v2/model3d/create refuses (503 google_only); GG chose to keep it off (2026-11-13).
    expect(SERVICE_CATALOGUE.filter((s) => !s.live).map((s) => s.id)).toEqual(['model3d']);
    expect(liveServices()).toHaveLength(9);
  });

  it('sends every live service to a surface that exists', () => {
    // Guards the class of bug the montage tile shipped with: live:true pointing at a hash that renders a
    // different service entirely. Hash targets must be one ServiceHub actually understands.
    const KNOWN_HASHES = ['', 'film', 'omni', 'lipsync', 'hub', 'agent'];
    for (const s of liveServices()) {
      if (s.target.kind === 'hash') expect(KNOWN_HASHES).toContain(s.target.hash);
      else expect(s.target.path.startsWith('/')).toBe(true);
    }
  });
});

describe('lookup + routing', () => {
  it('resolves by id, and null for anything else', () => {
    expect(getService('video')?.icon).toBe('🎬');
    expect(getService('nope' as ServiceId)).toBeNull();
    expect(getService(null)).toBeNull();
  });

  it('builds locale-prefixed hrefs, keeping hash targets on the workspace route', () => {
    expect(serviceHref(getService('video')!, 'ka')).toBe('/ka/dashboard#film');
    expect(serviceHref(getService('chat')!, 'en')).toBe('/en/dashboard');   // empty hash → bare route
    expect(serviceHref(getService('model3d')!, 'ru')).toBe('/ru/3d');
  });

  it('falls back to ka for an unknown locale — ka is this product default, not English', () => {
    expect(serviceHref(getService('video')!, 'xx')).toBe('/ka/dashboard#film');
    expect(serviceName(getService('video')!, 'xx')).toBe('ვიდეო');
    expect(serviceTagline(getService('music')!, 'xx')).toBe('Lyria 3');
  });

  it('localizes names', () => {
    expect(serviceName(getService('dubbing')!, 'en')).toBe('Dubbing');
    expect(serviceName(getService('dubbing')!, 'ru')).toBe('Дубляж');
    expect(serviceName(getService('dubbing')!, 'ka')).toBe('დუბლაჟი');
  });
});

describe('one name per tool', () => {
  it('names each studio tool exactly as the sidebar does (lib/studio/tools TOOL_META), in all three languages', () => {
    for (const s of SERVICE_CATALOGUE) {
      if (!isToolId(s.id)) continue;
      expect([s.id, s.name]).toEqual([s.id, TOOL_META[s.id].name]);
    }
  });
});
