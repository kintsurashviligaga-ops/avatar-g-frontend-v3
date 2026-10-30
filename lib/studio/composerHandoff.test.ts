/**
 * lib/studio/composerHandoff — a language switch keeps the composer: the service, its quick settings and the unsent text.
 * Pinned: kept values come back once; older than a minute, from the future, malformed or an unknown tool comes back as
 * nothing; a group with an unknown value is dropped whole; a blocked sessionStorage never throws.
 */
import { COMPOSER_HANDOFF_MAX_AGE_MS, stashComposerHandoff, takeComposerHandoff, type ComposerHandoff } from './composerHandoff';

const T0 = 1_791_500_000_000;
beforeEach(() => window.sessionStorage.clear());

const FULL: ComposerHandoff = {
  tool: 'video',
  draft: 'ზღვა მზის ჩასვლისას',
  video: { mode: 'documentary', seconds: 8, orientation: 'landscape', tier: 'standard' },
  image: { aspect: '16:9', count: 4, style: 'Cinematic' },
  music: { instrumental: true, styles: ['jazz', 'lofi'], duration: 60 },
  avatar: { gender: 'female', format: '1:1' },
  product: { aspect: '16:9', duration: 24, preset: 'epic' },
};

it('gives back the service, every group and the draft, exactly once', () => {
  stashComposerHandoff(FULL, T0);
  expect(takeComposerHandoff(T0 + 1_500)).toEqual(FULL);
  expect(takeComposerHandoff(T0 + 1_600)).toBeNull();
});

it('expires after a minute, and refuses a time in the future', () => {
  stashComposerHandoff(FULL, T0);
  expect(takeComposerHandoff(T0 + COMPOSER_HANDOFF_MAX_AGE_MS + 1)).toBeNull();
  stashComposerHandoff(FULL, T0);
  expect(takeComposerHandoff(T0 - 1)).toBeNull();
  stashComposerHandoff(FULL, T0);
  expect(takeComposerHandoff(T0 + COMPOSER_HANDOFF_MAX_AGE_MS)?.tool).toBe('video');
});

it('refuses an unknown tool and malformed JSON', () => {
  window.sessionStorage.setItem('myavatar:composer-handoff', JSON.stringify({ ...FULL, tool: 'teleport', at: T0 }));
  expect(takeComposerHandoff(T0)).toBeNull();
  window.sessionStorage.setItem('myavatar:composer-handoff', '{not json');
  expect(takeComposerHandoff(T0)).toBeNull();
  expect(window.sessionStorage.getItem('myavatar:composer-handoff')).toBeNull();
});

it('drops a group whose values are not all known, and keeps the rest', () => {
  window.sessionStorage.setItem('myavatar:composer-handoff', JSON.stringify({
    ...FULL,
    at: T0,
    video: { ...FULL.video, tier: 'ultra' },
    image: { ...FULL.image, count: 3 },
    music: { ...FULL.music, styles: [] },
    avatar: { gender: 'female' },
    product: { ...FULL.product, duration: -1 },
  }));
  const h = takeComposerHandoff(T0);
  expect(h).toEqual({ tool: 'video', draft: FULL.draft });
});

it('caps the draft at 4000 characters', () => {
  stashComposerHandoff({ tool: 'chat', draft: 'x'.repeat(5000) }, T0);
  expect(takeComposerHandoff(T0)?.draft).toHaveLength(4000);
});

it('never throws when sessionStorage is blocked', () => {
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => stashComposerHandoff(FULL, T0)).not.toThrow();
  spy.mockRestore();
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(takeComposerHandoff(T0)).toBeNull();
  get.mockRestore();
});
