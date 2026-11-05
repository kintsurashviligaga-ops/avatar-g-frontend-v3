/**
 * assemblyWords / assemblyRoles: an intro + body + outro edit read from the words, with which of two videos is which.
 */
import { assemblyRoles, assemblyWords } from './assemblyAsk';

const GG = 'პირველი ვიდეო დაამონტაჟე, მეორე ვიდეოდან ინტრო და ბოლო ლოგოს სცენა ამოიღე და პირველი ვიდეო დაამონტაჟე სწორედ';

test("GG's sentence (2026-11-05 10:21Z): video 2 gives the intro and the outro, video 1 is the body", () => {
  expect(assemblyWords(GG, 2)).toEqual({ intro: true, outro: true, source: 1, body: 0 });
  expect(assemblyRoles(assemblyWords(GG, 2)!, [0, 1], [10, 12])).toEqual({ intro: 1, body: 0, outro: 1 });
});

test.each([
  ['take the intro and the outro from the second video and put the first video between them', { intro: true, outro: true, source: 1, body: 0 }],
  ['use the intro from video 1 and the main part of video 2', { intro: true, outro: false, source: 0, body: 1 }],
  ['возьми интро и концовку из второго видео, а первое смонтируй между ними', { intro: true, outro: true, source: 1, body: 0 }],
  ['პირველი ვიდეოს ინტრო დაუმატე მეორეს', { intro: true, outro: false, source: 0, body: 1 }],
  ['მეორე ვიდეოდან აუტრო ამოიღე და პირველს ბოლოში მიაბი', { intro: false, outro: true, source: 1, body: 0 }],
])('%s', (text, want) => {
  expect(assemblyWords(text, 2)).toEqual(want);
});

test('no number: roles from length (the shorter clip is the bumper)', () => {
  const w = assemblyWords('add the intro and the outro to my video', 2)!;
  expect(w).toEqual({ intro: true, outro: true });
  expect(assemblyRoles(w, [0, 1], [42, 6])).toEqual({ intro: 1, body: 0, outro: 1 });
  expect(assemblyRoles(w, [0, 1], [5, 30])).toEqual({ intro: 0, body: 1, outro: 0 });
});

test.each([
  ['დაამონტაჟე ეს ორი ვიდეო', 2],
  ['cut these to the music', 2],
  ['ლოგო დაადე ვიდეოს კუთხეში', 2],
  ['take the intro from the second video', 3],
  ['take the intro from the second video', 1],
])('not an intro/outro edit: %s (%i videos)', (text, n) => {
  expect(assemblyWords(text, n)).toBeNull();
});
