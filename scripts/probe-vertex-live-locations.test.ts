/**
 * Pins the free Vertex Live location probe to the relay's own URL and model-resource builders, so a probe PASS means
 * the relay would connect at that location too.
 */
import { vertexLiveUrl, vertexModelResource } from '@/lib/voice/relay/session';
import { DEFAULT_LOCATIONS, DEFAULT_MODEL, liveUrl, setupFrame } from './probe-vertex-live-locations.mjs';
import { DEFAULT_LIVE_MODEL } from '@/lib/ai/google/models';

describe('probe-vertex-live-locations', () => {
  it.each([...DEFAULT_LOCATIONS, 'global'])('dials the same URL as the relay for %s', (loc) => {
    expect(liveUrl(loc)).toBe(vertexLiveUrl(loc));
  });

  it('sends the same model resource as the relay, and nothing but setup', () => {
    const f = setupFrame('my-project-1', 'eu', DEFAULT_MODEL);
    expect(f.setup.model).toBe(vertexModelResource({ project: 'my-project-1', location: 'eu' }, DEFAULT_MODEL));
    expect(Object.keys(f)).toEqual(['setup']);
  });

  it('probes the served Live default', () => {
    expect(DEFAULT_MODEL).toBe(DEFAULT_LIVE_MODEL.replace(/^models\//, ''));
  });
});
