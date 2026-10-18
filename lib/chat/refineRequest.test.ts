/** @jest-environment node */
/**
 * „უკეთესად გააკეთე" after a delivered film started a brand-new, unrelated film (GG, Production 2026-10-17 07:39Z): the
 * two words were planned as a brief of their own. A short request to improve is recognised, and the same brief is
 * re-planned with it.
 */
import { isConsentToStart } from './chatConsent';
import { improvedBrief, refineChange } from './refineRequest';

describe('refineChange', () => {
  it('GG’s words, and the same ask in en · ru', () => {
    expect(refineChange('უკეთესად გააკეთე')).toEqual({ change: '' });
    expect(refineChange('უკეთესად გააკეთეთ')).toEqual({ change: '' });
    expect(refineChange('გააუმჯობესე')).toEqual({ change: '' });
    expect(refineChange('ეს ვიდეო უკეთესად გამიკეთე')).toEqual({ change: '' });
    expect(refineChange('make it better')).toEqual({ change: '' });
    expect(refineChange('Improve it please')).toEqual({ change: '' });
    expect(refineChange('сделай лучше')).toEqual({ change: '' });
    expect(refineChange('улучши это видео')).toEqual({ change: '' });
  });

  it('keeps what the user wants changed', () => {
    expect(refineChange('უკეთესად გააკეთე, უფრო ნათელი იყოს')).toEqual({ change: 'ნათელი იყოს' });
    expect(refineChange('make it better, slower camera')).toEqual({ change: 'slower camera' });
    expect(refineChange('сделай лучше, больше света')).toEqual({ change: 'больше света' });
  });

  it('a new thing, a question about improving, a long brief, or no improve-word is not a refine', () => {
    expect(refineChange('ახალი ვიდეო გააკეთე')).toBeNull();
    expect(refineChange('სხვა ვიდეო უკეთესად გააკეთე')).toBeNull();
    expect(refineChange('make a new one, better')).toBeNull();
    expect(refineChange('сделай другое видео получше')).toBeNull();
    expect(refineChange('როგორ გავაუმჯობესო?')).toBeNull();
    expect(refineChange('how can I make it better?')).toBeNull();
    expect(refineChange('გააკეთე')).toBeNull();
    // Praise is not an order: „this is better", „much better, thanks".
    expect(refineChange('ეს უკეთესია')).toBeNull();
    expect(refineChange('much better, thanks')).toBeNull();
    expect(refineChange('стало лучше')).toBeNull();
    expect(refineChange('კი')).toBeNull();
    expect(refineChange(`უკეთესად გააკეთე: ${'ზღვის პირას მზის ჩასვლა, ტალღები და თოლიები, '.repeat(5)}`)).toBeNull();
  });

  it('a refine is never read as the yes that starts a pending offer', () => {
    for (const s of ['უკეთესად გააკეთე', 'make it better', 'сделай лучше', 'გააუმჯობესე']) expect(isConsentToStart(s)).toBe(false);
  });
});

describe('improvedBrief', () => {
  it('keeps the brief word for word and asks for the improvement in the brief’s language', () => {
    const b = improvedBrief('4 წამიანი ვიდეო: კატა ზღვის პირას', '', 'ka');
    expect(b.startsWith('4 წამიანი ვიდეო: კატა ზღვის პირას')).toBe(true);
    expect(b).toContain('იგივე სიუჟეტი');
    const e = improvedBrief('A cat on a beach', 'slower camera', 'ka');
    expect(e.startsWith('A cat on a beach')).toBe(true);
    expect(e).toContain('the same story');
    expect(e).toContain('The user asked: slower camera.');
    expect(improvedBrief('Кот на пляже', '', 'en')).toContain('тот же сюжет');
  });
});
