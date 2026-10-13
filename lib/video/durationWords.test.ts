/** @jest-environment node */
/**
 * Video Core v1.0 — AC-04 (the exact duration engine, §4.1): every way a length is said in ka · en · ru reads as the same
 * number of seconds, through the ONE reader the chat and the server share (lib/chat/studioIntent mineDurationSec →
 * lib/agent/params mineTotalDurationSec / mineParams). Written against the defects reproduced on 30be5a2 (2026-10-12):
 * „ერთწუთიანი" → undefined, „ოთხწუთიანი" → undefined, "2 min 30 s" → 30.
 */
import { mineDurationWords, readNumber } from './durationWords';
import { mineDurationSec } from '@/lib/chat/studioIntent';
import { mineParams, mineTotalDurationSec } from '@/lib/agent/params';

describe('AC-04: the length as typed → seconds (ka · en · ru)', () => {
  test.each<[string, number]>([
    // the owner's eight forms (§4.1)
    ['24-წამიანი კლიპი გამიკეთე', 24],
    ['ერთი წუთი', 60],
    ['ერთწუთიანი ვიდეო გამიკეთე ზღვაზე', 60],
    ['60 წამი', 60],
    ['ოთხწუთიანი ფილმი გამიკეთე თბილისზე', 240],
    ['4 წუთი', 240],
    ['240 წამი', 240],
    ['29.7 წამი', 29.7],
    ['29,7 წამი', 29.7],
    ['29.7-წამიანი კლიპი', 29.7],
    // more Georgian
    ['ოცდაათი წამი', 30],
    ['სამოცი წამი', 60],
    ['ნახევარწუთიანი კლიპი', 30],
    ['ნახევარი წუთი', 30],
    ['წუთნახევარი ვიდეო', 90],
    ['ერთი და ნახევარი წუთი', 90],
    ['წუთიანი ვიდეო', 60],
    ['2 წუთი და 30 წამი', 150],
    ['1 წთ 30 წმ', 90],
    ['ხანგრძლივობა 1:30', 90],
    ['ვიდეო 70 წამი იყოს', 70],
    // English
    ['one minute video', 60],
    ['a one-minute clip', 60],
    ['a four-minute film', 240],
    ['a minute-long video', 60],
    ['a minute and a half', 90],
    ['half a minute', 30],
    ['60 seconds', 60],
    ['29.7 seconds', 29.7],
    ['2 min 30 s', 150],
    ['2 minutes and 30 seconds', 150],
    ['sixty seconds', 60],
    ['thirty-second spot', 30],
    ['1:30 long', 90],
    ['a video 2:00 in length', 120],
    // Russian
    ['одноминутное видео', 60],
    ['четырёхминутный ролик', 240],
    ['четырехминутный ролик', 240],
    ['одна минута', 60],
    ['60 секунд', 60],
    ['29,7 секунды', 29.7],
    ['4 минуты', 240],
    ['2 минуты 30 секунд', 150],
    ['полминуты', 30],
    ['полутораминутный клип', 90],
    ['минутное видео', 60],
    ['длиной 1:30', 90],
    ['тридцать секунд', 30],
  ])('%s → %s s', (text, sec) => {
    expect(mineDurationSec(text)).toBe(sec);
    expect(mineTotalDurationSec(text)).toBe(sec);
  });

  test('a music start is an OFFSET into the song, never the length (§4.2)', () => {
    const t = 'ამ ხუთი ვიდეოდან გააკეთე 29.7-წამიანი კლიპი, მუსიკა დაიწყე 0:59-დან, გამოიყენე 9:16 ფორმატი და ბოლოს დაამატე ჩემი ლოგო.';
    expect(mineParams(t)).toMatchObject({ durationSec: 29.7, musicStartSec: 59, aspect: '9:16' });
    const u = 'ვიდეო 70 წამი იყოს. სიმღერა დაიწყე მისი 0:58 პოზიციიდან.';
    expect(mineParams(u)).toMatchObject({ durationSec: 70, musicStartSec: 58 });
    // „0.58" typed on a phone keyboard is the clock 0:58 (lib/agent/params); a one-digit fraction stays seconds.
    expect(mineParams('მუსიკა 0.58 წამიდან, ვიდეო 30 წამი').musicStartSec).toBe(58);
    expect(mineParams('მუსიკა 1.5 წამიდან, ვიდეო 30 წამი').musicStartSec).toBe(1.5);
  });

  test('a bare clock with no length word is NOT a length (it is a place in the song)', () => {
    expect(mineDurationSec('სიმღერა 0:59-დან დაიწყე')).toBeUndefined();
    expect(mineDurationSec('start the song at 1:30')).toBeUndefined();
  });

  test('no number, no unit: nothing is read', () => {
    expect(mineDurationSec('შვიდი კლიპიდან გამოიყენე მხოლოდ ბოლო ხუთი')).toBeUndefined();
    expect(mineDurationSec('make it cinematic')).toBeUndefined();
    expect(mineDurationSec('give it a second look')).toBeUndefined();
    expect(mineDurationWords('')).toBeUndefined();
  });

  test('a number is read whole, and the longest word wins', () => {
    expect(mineDurationSec('7.5 seconds')).toBe(7.5);
    expect(mineDurationSec('0.4 წამიანი')).toBe(0.4);
    expect(readNumber('ოცდაათი')).toBe(30);
    expect(readNumber('ათი')).toBe(10);
    expect(readNumber('fifteen')).toBe(15);
    expect(readNumber('четырёх')).toBe(4);
    expect(readNumber('29,7')).toBe(29.7);
    expect(Number.isNaN(readNumber('cat'))).toBe(true);
  });

  test('capped at an hour; a per-shot length and a window are not the length (lib/agent/params)', () => {
    expect(mineDurationSec('9999 წამი')).toBe(3600);
    expect(mineTotalDurationSec('თითო კადრი 2 წამი')).toBeUndefined();
    expect(mineTotalDurationSec('ბოლო 5 წამში დაწერე myavatar.ge')).toBeUndefined();
  });
});

describe('review 2026-10-13 (finding D): what the head of PR #58 misread, each as it read it there', () => {
  test.each<[string, number | undefined, string]>([
    // a frame shape or a song position is never the length
    ['a 30 second long 9:16 video', 30, 'read 556 (9:16 as 9 min 16 s)'],
    ['make it 30 seconds long, music from 0:45', 30, 'read 45 (the song start)'],
    // tens and ones in words
    ['twenty five seconds', 25, 'read 5'],
    ['twenty-five-second spot', 25, 'read 5'],
    ['двадцать пять секунд', 25, 'read 5'],
    ['ოცდახუთი წამი', 25, 'read nothing'],
    ['ოცდახუთწამიანი კლიპი', 25, 'read nothing'],
    ['ორმოცდათხუთმეტი წამი', 55, 'read nothing'],
    ['seventeen seconds', 17, 'read nothing'],
    ['восемнадцать секунд', 18, 'read nothing'],
    ['ცამეტი წამი', 13, 'read nothing'],
    // a half said after the unit
    ['ერთი წუთი და ნახევარი', 90, 'read 60'],
    ['одна минута с половиной', 90, 'read 60'],
    ['минута с половиной', 90, 'read nothing'],
    ['წუთი და ნახევარი', 90, 'read nothing'],
    ['ხუთი წამი და ნახევარი', 5.5, 'read 5'],
    // a word that only starts like a unit names no length
    ['2 წამყვანი ილაპარაკებს', undefined, 'read 2 (two hosts)'],
    ['5 minimalist shots', undefined, 'read 300'],
    ['20 secret tips', undefined, 'read 20'],
    ['5 секретов успеха', undefined, 'read 5'],
    ['3 минималистичных кадра', undefined, 'read 180'],
  ])('%s → %s s (the PR head %s)', (text, sec) => {
    expect(mineDurationSec(text)).toBe(sec);
  });

  test('the unit forms people do type still read', () => {
    for (const [text, sec] of [['ვიდეო 30 წამია', 30], ['5 min', 300], ['5 мин.', 300], ['10 сек', 10], ['30s', 30], ['2 წთ', 120], ['duration: 1:30', 90]] as const) {
      expect({ text, sec: mineDurationSec(text) }).toEqual({ text, sec });
    }
    // the song start in the same message is still read as the song start
    expect(mineParams('make it 30 seconds long, music from 0:45')).toMatchObject({ durationSec: 30, musicStartSec: 45 });
    expect(readNumber('twenty-five')).toBe(25);
    expect(readNumber('двадцать пять')).toBe(25);
    expect(readNumber('five twenty')).toBeNaN();
  });
});
