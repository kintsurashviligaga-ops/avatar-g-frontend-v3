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
