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

  it('marks the three unbuilt services as not-live rather than linking to a dead surface', () => {
    // Honesty in the UI: dubbing's route answers 501, and 3D/slides do not exist at all. A tile that
    // silently links there is worse than one that says "coming soon".
    const notLive = SERVICE_CATALOGUE.filter((s) => !s.live).map((s) => s.id).sort();
    expect(notLive).toEqual(['dubbing', 'model3d', 'presentation']);
    expect(liveServices()).toHaveLength(7);
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
