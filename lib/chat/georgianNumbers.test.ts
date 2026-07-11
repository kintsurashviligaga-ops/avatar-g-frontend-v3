import { spellGeorgianNumber, numbersToGeorgianWords, containsGeorgian, normalizeGeorgianNumbersForSpeech } from './georgianNumbers';

describe('spellGeorgianNumber — Georgian vigesimal cardinals', () => {
  test('units + teens (0–19)', () => {
    expect(spellGeorgianNumber(0)).toBe('ნული');
    expect(spellGeorgianNumber(1)).toBe('ერთი');
    expect(spellGeorgianNumber(9)).toBe('ცხრა');
    expect(spellGeorgianNumber(10)).toBe('ათი');
    expect(spellGeorgianNumber(11)).toBe('თერთმეტი');
    expect(spellGeorgianNumber(19)).toBe('ცხრამეტი');
  });

  test('vigesimal tens — pure + combining', () => {
    expect(spellGeorgianNumber(20)).toBe('ოცი');
    expect(spellGeorgianNumber(21)).toBe('ოცდაერთი');
    expect(spellGeorgianNumber(30)).toBe('ოცდაათი'); // 20-and-10
    expect(spellGeorgianNumber(40)).toBe('ორმოცი');
    expect(spellGeorgianNumber(50)).toBe('ორმოცდაათი');
    expect(spellGeorgianNumber(60)).toBe('სამოცი');
    expect(spellGeorgianNumber(80)).toBe('ოთხმოცი');
    expect(spellGeorgianNumber(90)).toBe('ოთხმოცდაათი'); // four-twenties-and-ten
    expect(spellGeorgianNumber(99)).toBe('ოთხმოცდაცხრამეტი');
  });

  test('hundreds — pure + with remainder', () => {
    expect(spellGeorgianNumber(100)).toBe('ასი');
    expect(spellGeorgianNumber(101)).toBe('ას ერთი');
    expect(spellGeorgianNumber(190)).toBe('ას ოთხმოცდაათი'); // ← the canonical example
    expect(spellGeorgianNumber(200)).toBe('ორასი');
    expect(spellGeorgianNumber(999)).toBe('ცხრაას ოთხმოცდაცხრამეტი');
  });

  test('thousands + the year example', () => {
    expect(spellGeorgianNumber(1000)).toBe('ათასი');
    expect(spellGeorgianNumber(2000)).toBe('ორი ათასი');
    expect(spellGeorgianNumber(2026)).toBe('ორი ათას ოცდაექვსი'); // ← the canonical year example
    expect(spellGeorgianNumber(9999)).toBe('ცხრა ათას ცხრაას ოთხმოცდაცხრამეტი');
  });

  test('out of range / non-integer → null (caller keeps the digits)', () => {
    expect(spellGeorgianNumber(-1)).toBeNull();
    expect(spellGeorgianNumber(10000)).toBeNull();
    expect(spellGeorgianNumber(3.5)).toBeNull();
    expect(spellGeorgianNumber(NaN)).toBeNull();
  });
});

describe('numbersToGeorgianWords — in-text replacement', () => {
  test('replaces standalone integers, leaves non-digits + big numbers', () => {
    expect(numbersToGeorgianWords('შენ გაქვს 38 კრედიტი')).toBe('შენ გაქვს ოცდათვრამეტი კრედიტი');
    expect(numbersToGeorgianWords('წელი 2026')).toBe('წელი ორი ათას ოცდაექვსი');
    expect(numbersToGeorgianWords('ფასი 190')).toBe('ფასი ას ოთხმოცდაათი');
    expect(numbersToGeorgianWords('კოდი 100000')).toBe('კოდი 100000'); // ≥10000 left as-is
  });

  test('no digits → unchanged', () => {
    expect(numbersToGeorgianWords('გამარჯობა, როგორ ხარ?')).toBe('გამარჯობა, როგორ ხარ?');
  });
});

describe('containsGeorgian + normalizeGeorgianNumbersForSpeech — the locale gate', () => {
  test('detects Georgian letters', () => {
    expect(containsGeorgian('გამარჯობა 190')).toBe(true);
    expect(containsGeorgian('hello 190')).toBe(false);
  });

  test('converts ONLY on Georgian text (en/ru untouched)', () => {
    expect(normalizeGeorgianNumbersForSpeech('ფასი 190')).toBe('ფასი ას ოთხმოცდაათი');
    expect(normalizeGeorgianNumbersForSpeech('price is 190')).toBe('price is 190'); // English → provider handles it
  });
});
