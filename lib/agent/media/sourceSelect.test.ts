import { cardinalOf, ordinalOf, parseSelection, resolveSelection, selectSources } from './sourceSelect';

const keepOf = (text: string, n: number) => {
  const s = selectSources(text, n);
  return s.mode === 'subset' ? s.keep : s.mode;
};

describe('numbers in three languages', () => {
  test('cardinals and ordinals', () => {
    expect(['შვიდი', 'შვიდს', 'შვიდით', '7', 'seven', 'семь'].map(cardinalOf)).toEqual([7, 7, 7, 7, 7, 7]);
    expect(['ორიც', 'ორი', 'два', 'two'].map(cardinalOf)).toEqual([2, 2, 2, 2]);
    expect(cardinalOf('ერთად')).toBeNull();
    expect(['მესამე', 'მესამის', 'მე-3', '3-ე', '3rd', 'third', 'третьего', 'третий'].map(ordinalOf)).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
    expect(ordinalOf('მუსიკა')).toBeNull();
  });
});

describe('the owner’s words (Media Studio v2.0 §C, §H)', () => {
  test('„მარტო ბოლო შვიდი" of nine keeps pictures 3–9 and excludes 1–2', () => {
    expect(selectSources('მარტო ბოლო შვიდი გამოიყენე', 9)).toEqual({ mode: 'subset', keep: [2, 3, 4, 5, 6, 7, 8], excluded: [0, 1], phrase: expect.any(String) });
    expect(keepOf('only the last 7 clips', 9)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(keepOf('только последние семь', 9)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(keepOf('ბოლო შვიდით გააკეთე', 9)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  test('first N, exclusions and lists', () => {
    expect(keepOf('მხოლოდ პირველი სამი ვიდეო', 5)).toEqual([0, 1, 2]);
    expect(keepOf('just the first three', 5)).toEqual([0, 1, 2]);
    expect(keepOf('მესამის გარდა ყველა', 5)).toEqual([0, 1, 3, 4]);
    expect(keepOf('გარდა მესამისა', 5)).toEqual([0, 1, 3, 4]);
    expect(keepOf('მეორე და მეხუთე ამოიღე', 5)).toEqual([0, 2, 3]);
    expect(keepOf('ბოლო ვიდეო არ გამოიყენო', 4)).toEqual([0, 1, 2]);
    expect(keepOf('except clip 3', 5)).toEqual([0, 1, 3, 4]);
    expect(keepOf('drop the last two', 5)).toEqual([0, 1, 2]);
    expect(keepOf('кроме третьего', 5)).toEqual([0, 1, 3, 4]);
    expect(keepOf('без второго и четвёртого', 5)).toEqual([0, 2, 4]);
    expect(keepOf('მხოლოდ მე-2 და მე-5', 6)).toEqual([1, 4]);
    expect(keepOf('only clips 2 and 5', 6)).toEqual([1, 4]);
    expect(keepOf('только 2 и 5', 6)).toEqual([1, 4]);
  });

  test('words that are NOT a selection leave every picture in', () => {
    for (const text of [
      'ამ ცხრა ვიდეოს ეს ორიც დაუმატე, ჯამში 70 წამი გააკეთე, სიმღერა 58-ე წამიდან დაიწყე, ზედმეტი წარწერები მოაშორე',
      'სიმღერა 0:58-დან დაიწყე',
      'პირველი ვიდეოს ხმა მოხსენი',
      'მხოლოდ მუსიკა დატოვე',
      'მხოლოდ 30 წამი',
      'cut the last 5 seconds',
      'the first 3 seconds are too dark',
      'remove the captions',
      'დაამონტაჟე მუსიკაზე',
      '',
    ]) {
      expect([text, selectSources(text, 9)]).toEqual([text, { mode: 'all' }]);
    }
    expect(parseSelection(undefined)).toBeNull();
  });

  test('a selection that names a picture that is not there is refused, never trimmed to fit', () => {
    expect(selectSources('მარტო ბოლო შვიდი', 5)).toMatchObject({ mode: 'invalid', reason: 'out_of_range', asked: [7], pictures: 5 });
    expect(selectSources('only clips 2 and 9', 5)).toMatchObject({ mode: 'invalid', reason: 'out_of_range', asked: [2, 9] });
    expect(selectSources('except the first', 1)).toMatchObject({ mode: 'invalid', reason: 'nothing_left' });
  });

  test('a selection of every picture is no selection', () => {
    expect(selectSources('ბოლო ხუთი', 5)).toEqual({ mode: 'all' });
    expect(resolveSelection(null, 4)).toEqual({ mode: 'all' });
  });
});
