import { offersUnpreparedStart, UNPREPARED_START_NOTE } from './liveUnprepared';

describe('offersUnpreparedStart', () => {
  test.each([
    'შემოგთავაზებ სურათს: „A NASCAR race“. ფასი 5 კრედიტი. დავიწყო?',
    'ნასკარის რბოლის სურათი 5 კრედიტი ღირს. დავიწყოთ?',
    'გენერაციის ღილაკი მზად არის, დააჭირე.',
    'დააჭირე ღილაკს „შექმნა“ და დაიწყება.',
    'It costs 5 credits. Shall I start?',
    'The image is 5 credits — should I go ahead?',
    'Just press the generate button.',
    'Это стоит 5 кредитов. Запускаю?',
    'Нажмите кнопку «Создать».',
  ])('catches an offer to start or a button to press: %s', (said) => {
    expect(offersUnpreparedStart(said)).toBe(true);
  });

  test.each([
    '',
    'გამარჯობა, როგორ ხარ?',
    'სურათის ფასი 5 კრედიტია.',
    'An image costs 5 credits.',
    'The video started; I will tell you when it is ready.',
    'Картинка стоит 5 кредитов.',
  ])('leaves other answers alone: %s', (said) => {
    expect(offersUnpreparedStart(said)).toBe(false);
  });

  test('the note is an [App] note that names the function and lets a non-render answer pass', () => {
    expect(UNPREPARED_START_NOTE.startsWith('[App] ')).toBe(true);
    expect(UNPREPARED_START_NOTE).toContain('call prepare_generation now');
    expect(UNPREPARED_START_NOTE).toContain('If they did not, ignore this note');
  });
});
