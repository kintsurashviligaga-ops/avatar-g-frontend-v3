import { offeredPrompt } from './offeredPrompt';
import { isAffirmation } from './focusGate';

// GG's Production reply (2026-10-16), shortened only in the middle.
const LEOPARD = 'აი, სურათის აღწერა: "ლეოპარდი, რომელიც მთელი ძალით მისდევს ირემს, ირემი გარბის კადრიდან. კამერა ქვემოდან არის დამაგრებული, 90 გრადუსიანი კუთხით. ფონზე ველური ბუნებაა, მკვეთრი განათებით." რას იტყვი, დავიწყოთ გენერაცია?';

describe('offeredPrompt — a yes to Agent G\'s own quoted prompt opens the tool', () => {
  it('reads the Production leopard offer as an image prompt', () => {
    const o = offeredPrompt(LEOPARD);
    expect(o?.mode).toBe('image');
    expect(o?.prompt.startsWith('ლეოპარდი, რომელიც')).toBe(true);
    expect(o?.prompt.endsWith('მკვეთრი განათებით.')).toBe(true);
  });

  it('GG\'s answer counts as a yes', () => {
    expect(isAffirmation('კარგია, დავწერე.')).toBe(true);
    expect(isAffirmation('კარგია')).toBe(true);
    expect(isAffirmation('დავიწყოთ')).toBe(true);
  });

  it('uses the tool the user is in when the reply names no medium', () => {
    const r = 'Prompt: "a red paper boat on a rainy street at dusk" — shall we generate it?';
    expect(offeredPrompt(r)).toBeNull();
    expect(offeredPrompt(r, 'image')).toEqual({ mode: 'image', prompt: 'a red paper boat on a rainy street at dusk' });
  });

  it('knows video and music offers (en · ru)', () => {
    expect(offeredPrompt('Here is a video prompt: "a drone shot over Tbilisi old town at sunrise". Shall I start?')?.mode).toBe('video');
    expect(offeredPrompt('Вот промпт для песни: «спокойная джазовая мелодия под дождь вечером». Начнём?')?.mode).toBe('music');
  });

  it('offers nothing when the reply does not end by asking to start', () => {
    expect(offeredPrompt('სურათისთვის ასეთი აღწერა გამოდგება: "ლეოპარდი მისდევს ირემს ველურ ბუნებაში".')).toBeNull();
    expect(offeredPrompt('რომელი სტილი გირჩევნია, ფოტორეალისტური თუ ილუსტრაცია?')).toBeNull();
    expect(offeredPrompt('დავიწყოთ სურათის გენერაცია?')).toBeNull(); // no quoted prompt
  });
});

describe('offeredPrompt — the offers a yes now starts (GG, Production 2026-10-16 18:21Z)', () => {
  // The reply GG got to „კი შექმენი სურათი 9:16 ფორმატის" (shortened in the middle): a quoted prompt and its price, no question.
  const GG_REPLY = 'სურათის შესაქმნელად გახსენი ხელსაწყო „სურათი“, მიამაგრე ეს ფოტო და აირჩიე 9:16.\n\nპრომპტის ველში ჩასვი:\n\n„Vertical 9:16 professional portrait maintaining the exact face and features of the man in the reference image, solid matte black background, studio lighting“\n\n(ფასი: 2 კრედიტი / 0.20 ₾).';

  it('a quoted prompt with its price after it is an offer, and carries that price', () => {
    const o = offeredPrompt(GG_REPLY);
    expect(o?.mode).toBe('image');
    expect(o?.prompt.startsWith('Vertical 9:16 professional portrait')).toBe(true);
    expect(o?.credits).toBe(2);
  });

  it('„დავიწყო?" — the question the chat prompt asks for — ends an offer, and a price before the prompt still counts', () => {
    const o = offeredPrompt('სურათი 9:16 ფორმატში, ფასი 2 კრედიტი: „a man in a tailored black suit, studio light, photorealistic“ დავიწყო?');
    expect(o).toEqual({ mode: 'image', prompt: 'a man in a tailored black suit, studio light, photorealistic', credits: 2 });
    expect(offeredPrompt('Song offer: "warm acoustic ballad about the sea at night" — 3 credits. Shall I start?')?.mode).toBe('music');
    expect(offeredPrompt('Фильм: «дрон пролетает над старым Тбилиси на рассвете». Запускаю?')?.mode).toBe('video');
  });

  it('„do you want it?" endings are offers too', () => {
    expect(offeredPrompt('ასეთ სურათს გავაკეთებ: „a red fox in deep snow at dawn, photorealistic“. გინდა?')?.mode).toBe('image');
  });

  it('a price inside the prompt is not the offer\'s price', () => {
    expect(offeredPrompt('Poster text: "Sale — 50 credits off every lamp this week". What colours do you like?')).toBeNull();
  });
});
