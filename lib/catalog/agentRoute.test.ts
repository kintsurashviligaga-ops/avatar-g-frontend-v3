import { routeAgentIntent } from './agentRoute';

const open = (text: string) => {
  const r = routeAgentIntent(text);
  return r?.kind === 'open' ? [r.service.id, r.tool] : r;
};

describe('routeAgentIntent — chat requests for a panel tool open that tool', () => {
  it.each([
    ['swap the character in this video', 'video.character-swap', 'swap'],
    ['ამ ბიჭით იგივე ვიდეო გააკეთე', 'video.character-swap', 'swap'],
    ['add vfx explosion to my photo', 'video.vfx', 'vfx'],
    ['redesign my living room in scandinavian style', 'image.interior', 'interior'],
    ['ჩემი ოთახის ინტერიერი გადააკეთე', 'image.interior', 'interior'],
    ['сделай фотосессию из моих фото', 'image.photoshoot', 'photoshoot'],
  ])('%s → %s', (text, id, tool) => {
    expect(open(text)).toEqual([id, tool]);
  });
});

describe('routeAgentIntent — a service that is not there yet is said, never substituted', () => {
  it('a video remix request opens no panel: the remix left every menu (GG 2026-10-18)', () => {
    for (const t of ['remix this video with captions', 'ეს ვიდეო დამირემიქსე', 'сделай ремикс видео']) {
      const r = routeAgentIntent(t);
      expect(r?.kind === 'open' ? r.tool : null).not.toBe('remix');
    }
  });
  it('a product-ad request opens no panel: GG removed the product ad (2026-10-27)', () => {
    for (const t of ['make a product ad for my sneakers', 'გამიკეთე რეკლამა ჩემი პროდუქტისთვის', 'сделай рекламу товара']) {
      const r = routeAgentIntent(t);
      expect(r?.kind === 'open' ? r.tool : null).not.toBe('product');
    }
  });
  it('a motion-transfer request opens no panel: Motion is hidden (Phase 2 PR 7)', () => {
    for (const t of ['use motion transfer on my photo', 'მოძრაობის გადატანა გამიკეთე', 'сделай перенос движения']) {
      const r = routeAgentIntent(t);
      expect(r?.kind === 'open' ? r.tool : null).not.toBe('motion');
      expect(r?.service.id).not.toBe('video.motion');
    }
  });
  it('„მუსიკა დამირემიქსე" is an AUDIO remix: unavailable, offers music generation, never the video remix', () => {
    const r = routeAgentIntent('მუსიკა დამირემიქსე.');
    expect(r?.kind).toBe('unavailable');
    expect(r?.service.id).toBe('music.remix');
    expect(r?.kind === 'unavailable' && r.alternative?.id).toBe('music.generate');
  });

  it('remix this song → unavailable audio remix', () => {
    expect(routeAgentIntent('remix this song please')?.service.id).toBe('music.remix');
  });
});

describe('routeAgentIntent — leaves the other routers and the conversation alone', () => {
  it.each([
    // chat lanes: Agent G's card / the storyboard
    'დამიხატე კატა',
    'make a song about the sea',
    'გამიკეთე მუსიკალური ვიდეო',
    'make a video about Tbilisi',
    // studioIntent's tools
    'ამ ვიდეოს ხმა ქართულად გადამითარგმნე',
    'make me a 10-slide deck about AI',
    'make me a talking avatar',
    // chat-backed services
    'write a podcast script about AI',
    'გადათარგმნე ეს ტექსტი ინგლისურად',
    'write ad copy for my bakery',
  ])('%s → null', (text) => {
    expect(routeAgentIntent(text)).toBeNull();
  });

  it.each([
    'how much does a product ad cost?',
    'რა არის ინტერიერის დიზაინი?',
    'can you swap the character in a video?',
    'сколько стоит рекламный ролик',
  ])('a question opens nothing: %s', (text) => {
    expect(routeAgentIntent(text)).toBeNull();
  });

  it('a statement that only mentions a service is not a request', () => {
    expect(routeAgentIntent('product ads are expensive')).toBeNull();
    expect(routeAgentIntent('')).toBeNull();
    expect(routeAgentIntent(null)).toBeNull();
  });

  it('a slow-motion or portrait video is a video, not motion transfer or a photoshoot', () => {
    expect(routeAgentIntent('make a slow motion video of a waterfall')).toBeNull();
    expect(routeAgentIntent('make a video in portrait format')).toBeNull();
    expect(routeAgentIntent('make a video of my room')).toBeNull();
  });
});
