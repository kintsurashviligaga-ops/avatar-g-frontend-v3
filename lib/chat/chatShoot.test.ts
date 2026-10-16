/** @jest-environment node */
/**
 * GG's rule (Production 2026-10-16 18:21Z): every service runs in the chat — Agent G clarifies, the user agrees,
 * generation starts. The Photographer and the Interior designer used to only open their panel from the chat.
 */
import { routeAgentIntent } from '@/lib/catalog/agentRoute';
import { shootKindForTool, shootOfferText, shootWire, productAdOfferText, productAdPhotoAsk, PRODUCT_PHOTO_WAIT_MS } from './chatShoot';

const kindOf = (text: string) => {
  const r = routeAgentIntent(text);
  return r?.kind === 'open' ? shootKindForTool(r.tool) : null;
};

describe('which chat orders are a shoot', () => {
  it.each([
    ['redesign my living room in scandinavian style', 'interior'],
    ['ოთახის დიზაინი გამიკეთე სკანდინავიურ სტილში', 'interior'],
    ['ამ ოთახის ინტერიერის დიზაინი გამიკეთე', 'interior'],
    ['сделай дизайн интерьера для кухни', 'interior'],
    ['ფოტოსესია გამიკეთე ამ ფოტოდან', 'photoshoot'],
    ['make me a photo shoot in a black suit', 'photoshoot'],
    ['сделай фотосессию в студии', 'photoshoot'],
  ])('„%s" → %s', (text, kind) => {
    expect(kindOf(text)).toBe(kind);
  });

  it.each(['რა ღირს ფოტოსესია?', 'how much is an interior design?', 'make a product ad for my sneakers'])('„%s" is not a shoot order', (text) => {
    expect(kindOf(text)).toBeNull();
  });

  it('only the two studio tools have a studio', () => {
    expect(shootKindForTool('interior')).toBe('interior');
    expect(shootKindForTool('photoshoot')).toBe('photoshoot');
    expect(shootKindForTool('product')).toBeNull();
    expect(shootKindForTool('image')).toBeNull();
    expect(shootWire('interior')).toEqual({ kind: 'interior' });
  });
});

describe('Agent G\'s words on the card', () => {
  it('names what it will make and from which photo, quotes the words, and asks „დავიწყო?"', () => {
    const t = shootOfferText({ kind: 'interior', prompt: 'ოთახის დიზაინი სკანდინავიურ სტილში', withPhoto: true, locale: 'ka' });
    expect(t).toBe('მზად ვარ, გავაკეთო ინტერიერის დიზაინი შენი ოთახის ფოტოდან:\n«ოთახის დიზაინი სკანდინავიურ სტილში»\nდავიწყო?');
  });

  it('with no photo it says so and how to give one; it still offers to start', () => {
    const t = shootOfferText({ kind: 'photoshoot', prompt: 'a photo shoot in a black suit', withPhoto: false, locale: 'en' });
    expect(t).toContain('I am ready to make a photo shoot picture:');
    expect(t).toContain('attach your photo');
    expect(t.endsWith('Shall I start?')).toBe(true);
    expect(shootOfferText({ kind: 'interior', prompt: 'кухня', withPhoto: false, locale: 'ru' })).toContain('прикрепите её фото');
  });

  it('a long brief is cut on the card, never in the render', () => {
    const long = 'x'.repeat(600);
    const t = shootOfferText({ kind: 'photoshoot', prompt: long, withPhoto: true, locale: 'ka' });
    expect(t).toContain(`${'x'.repeat(397)}…`);
    expect(t).not.toContain('x'.repeat(398));
  });
});

describe('the product ad ordered in the chat', () => {
  it.each(['make a product ad for my sneakers', 'პროდუქტის რეკლამა გამიკეთე', 'ამ პროდუქტის სარეკლამო ვიდეო გამიკეთე', 'сделай рекламу товара'])(
    '„%s" opens the product ad, which the chat now offers on its card', (text) => {
      const r = routeAgentIntent(text);
      expect(r?.kind === 'open' ? r.tool : null).toBe('product');
    });

  it('the card names the photo, the length, the frame and the style — not the order\'s words (the route takes none)', () => {
    expect(productAdOfferText({ seconds: 8, aspect: '9:16', style: 'luxury', locale: 'ka' }))
      .toBe('მზად ვარ, გავაკეთო პროდუქტის სარეკლამო ვიდეო შენი ფოტოდან: 8 წმ, 9:16, სტილი „ლუქსი".\nდავიწყო?');
    expect(productAdOfferText({ seconds: 24, aspect: '1:1', style: 'nature', locale: 'en' })).toContain('24 s, 1:1, style „Nature"');
    expect(productAdOfferText({ seconds: 8, aspect: '16:9', style: 'epic', locale: 'ru' }).endsWith('Начинать?')).toBe(true);
  });

  it('with no photo Agent G asks for one and promises the price first; it waits ten minutes for it', () => {
    expect(productAdPhotoAsk('ka')).toContain('ფოტო მჭირდება');
    expect(productAdPhotoAsk('en')).toContain('show the price before anything starts');
    expect(PRODUCT_PHOTO_WAIT_MS).toBe(600_000);
  });
});
