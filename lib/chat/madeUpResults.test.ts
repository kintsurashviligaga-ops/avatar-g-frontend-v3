/**
 * lib/chat/madeUpResults — a chat reply never shows a result the studio did not make (GG 2026-10-26 15:40Z: „75 კრედიტი"
 * and a made-up "[generated video: …]" link after „კი").
 */
import { withoutMadeUpResults } from './madeUpResults';

const FAKE = '[generated video: https://x.supabase.co/storage/v1/object/sign/renders/video-clip/d43f29e2/omni.mp4?token=abc]';

test('a result marker the model wrote is replaced by one plain line saying nothing was made or charged', () => {
  expect(withoutMadeUpResults(`აი შენი ვიდეო:\n\n${FAKE}`, 'ka')).toBe('აი შენი ვიდეო:\n\n⚠️ ჩატი თვითონ ვერაფერს ქმნის: ეს ბმული მოგონილი იყო, არაფერი შექმნილა და თანხა არ ჩამოგეჭრა.');
  expect(withoutMadeUpResults(`${FAKE} ${FAKE.replace('video', 'image')}`, 'en')).toBe('⚠️ The chat cannot make anything itself: that link was made up. Nothing was made and nothing was charged. ');
  expect(withoutMadeUpResults(FAKE, 'ru')).toMatch(/^⚠️ Чат сам ничего не создаёт/);
});

test('a marker still streaming in is hidden until it closes; ordinary brackets and links stay', () => {
  expect(withoutMadeUpResults('Here it is: [generated video: https://x.supabase.co/sto', 'en')).toBe('Here it is: ');
  expect(withoutMadeUpResults('Here it is: [gen', 'en')).toBe('Here it is: ');
  for (const t of ['See [the docs](https://ai.google.dev) [1].', 'Array [a, b]', 'no brackets', '']) expect(withoutMadeUpResults(t, 'en')).toBe(t);
});
