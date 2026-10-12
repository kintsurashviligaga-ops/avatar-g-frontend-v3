/** @jest-environment node */
/**
 * Video Core v1.0 — §4.2 the two music clocks. „სიმღერა 0:59-დან" is a SOURCE OFFSET into the track (where the song
 * is picked up), never a length and never where on the result's timeline it starts (that is always 0 today). The owner's
 * sentence „სიმღერა დაიწყე მისი 0:58 პოზიციიდან" named no start on 30be5a2 (reproduced 2026-10-12): the song would have
 * come in from 0:00 without a word.
 */
import { mineMusicStartSec, mineParams, mineTotalDurationSec } from './params';

describe('music source offset, with a noun between the clock and „-დან" / "mark" / «позиции»', () => {
  test.each<[string, number]>([
    ['სიმღერა დაიწყე მისი 0:58 პოზიციიდან', 58],
    ['მუსიკა 0:58 პოზიციიდან დაიწყე', 58],
    ['მუსიკა 1:05 ნიშნულიდან', 65],
    ['მუსიკა 0:58 მომენტიდან დაიწყოს', 58],
    ['ტრეკი 0:05-დან დაიწყე', 5],
    ['მუსიკა 0:58-ზე დაიწყე', 58],
    ['სიმღერა 0.58 პოზიციიდან', 58],
    ['start the music from the 0:58 mark', 58],
    ['music starting from position 0:58', 58],
    ['the song from the 1:05 point', 65],
    ['музыка с позиции 0:58', 58],
    ['трек с отметки 1:05', 65],
    ['музыка с 0:58', 58],
  ])('%s → %s s into the song', (text, sec) => {
    expect(mineMusicStartSec(text)).toBe(sec);
  });

  test('the offset is taken out before the length is read: 70 s long, song from 0:58', () => {
    const t = 'ვიდეო 70 წამი იყოს. სიმღერა დაიწყე მისი 0:58 პოზიციიდან.';
    expect(mineTotalDurationSec(t)).toBe(70);
    expect(mineParams(t)).toEqual({ durationSec: 70, musicStartSec: 58 });
  });

  test('no music word: a clock with a noun is not a music start', () => {
    expect(mineMusicStartSec('ვიდეო 0:58 პოზიციიდან')).toBeUndefined();
  });
});
