/**
 * The owner's thirteen sentences (Agent G Master Task §2), in ka · en · ru, with the files and the state they come with,
 * and the negatives that must never act: questions, talk, feedback, a focus tool's prompt that only looks like a command.
 */
import { classifyAgentIntent, controlOp, intentCanSpend, langOf, type IntentInput } from './intent';
import type { AgentIntent, AttachmentKind } from './contracts';

const V: AttachmentKind = 'video';
const A: AttachmentKind = 'audio';
const I: AttachmentKind = 'image';

const run = (text: string, extra: Partial<IntentInput> = {}): AgentIntent => classifyAgentIntent({ text, ...extra });
const act = (i: AgentIntent) => {
  if (i.kind !== 'act') throw new Error(`expected act, got ${JSON.stringify(i)}`);
  return i;
};

describe('the thirteen sentences (ka)', () => {
  test('1 „ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე." — clips + track: the montage; clips only: ask for the track; nothing: ask for both', () => {
    const s = 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.';
    expect(act(run(s, { attachments: [V, V, V, A] }))).toMatchObject({ capability: 'agent.montage', target: 'attachment', missing: [] });
    expect(act(run(s, { attachments: [V, V, V] }))).toMatchObject({ capability: 'agent.montage', missing: ['track'] });
    expect(act(run(s))).toMatchObject({ capability: 'agent.montage', missing: ['clips', 'track'] });
  });

  test('2 „ამ ვიდეოდან ამოიღე ხმა MP3-ად." — the attached file; with nothing attached, ask for the source', () => {
    const s = 'ამ ვიდეოდან ამოიღე ხმა MP3-ად.';
    expect(act(run(s, { attachments: [V] }))).toMatchObject({ capability: 'agent.audio-extract', target: 'attachment', missing: [] });
    expect(act(run(s))).toMatchObject({ capability: 'agent.audio-extract', missing: ['source'] });
  });

  test('3 „მუსიკა 5 წამიდან დაიწყე." — changes the plan on screen; with the files, the new plan starts there', () => {
    const s = 'მუსიკა 5 წამიდან დაიწყე.';
    expect(act(run(s, { pending: { capability: 'agent.montage' } }))).toMatchObject({
      capability: 'agent.montage', target: 'pending', params: { musicStartSec: 5 },
    });
    const withFiles = act(run(s, { attachments: [V, V, A] }));
    expect(withFiles).toMatchObject({ capability: 'agent.montage', target: 'attachment', params: { musicStartSec: 5 } });
    expect(withFiles.params.durationSec).toBeUndefined();
    expect(act(run(s, { previous: { kind: 'video' } }))).toMatchObject({ capability: 'media.edit', target: 'previous', params: { editOp: 'music_offset' } });
  });

  test('4 „ვიდეო 9:16-ზე გადაიყვანე." — a frame-shape edit of the video (no route yet: media.edit)', () => {
    const s = 'ვიდეო 9:16-ზე გადაიყვანე.';
    expect(act(run(s, { attachments: [V] }))).toMatchObject({ capability: 'media.edit', target: 'attachment', params: { aspect: '9:16', editOp: 'aspect' } });
    expect(act(run(s, { previous: { kind: 'video' } }))).toMatchObject({ target: 'previous' });
    expect(act(run(s))).toMatchObject({ missing: ['video'] });
  });

  test('5 „გააკეთე 20-წამიანი რეკლამა." — the product ad, 20 s, and it needs the product photo', () => {
    expect(act(run('გააკეთე 20-წამიანი რეკლამა.'))).toMatchObject({
      capability: 'video.product-ad', params: { durationSec: 20 }, missing: ['photo'],
    });
    expect(act(run('გააკეთე 20-წამიანი რეკლამა.', { attachments: [I] }))).toMatchObject({ target: 'attachment', missing: [] });
  });

  test('6 „ეს ფოტო გააცოცხლე." — image→video from the photo; no photo: ask for it', () => {
    expect(act(run('ეს ფოტო გააცოცხლე.', { attachments: [I] }))).toMatchObject({
      capability: 'video.generate', target: 'attachment', params: { fromImage: true, editOp: 'animate' }, missing: [],
    });
    expect(act(run('ეს ფოტო გააცოცხლე.'))).toMatchObject({ missing: ['photo'] });
    expect(act(run('ეს ფოტო გააცოცხლე.', { previous: { kind: 'image' } }))).toMatchObject({ target: 'previous', missing: [] });
  });

  test('7 „სუბტიტრები დაამატე." — captions on the attached or the last video', () => {
    expect(act(run('სუბტიტრები დაამატე.', { attachments: [V] }))).toMatchObject({ capability: 'video.remix', target: 'attachment', params: { editOp: 'captions' } });
    expect(act(run('სუბტიტრები დაამატე.', { previous: { kind: 'video' } }))).toMatchObject({ target: 'previous', missing: [] });
    expect(act(run('სუბტიტრები დაამატე.'))).toMatchObject({ missing: ['video'] });
  });

  test('8 „ეს ვიდეო რუსულად გაახმოვანე." — dubbing into Russian', () => {
    expect(act(run('ეს ვიდეო რუსულად გაახმოვანე.', { attachments: [V] }))).toMatchObject({
      capability: 'voice.dubbing', target: 'attachment', params: { targetLanguage: 'ru' },
    });
  });

  test('9 „წინა შედეგს ფერები შეუცვალე." — a colour edit OF the last result, never a new picture', () => {
    expect(act(run('წინა შედეგს ფერები შეუცვალე.', { previous: { kind: 'image' } }))).toMatchObject({
      capability: 'image.generate', target: 'previous', params: { editOp: 'color' },
    });
    expect(act(run('წინა შედეგს ფერები შეუცვალე.', { previous: { kind: 'video' } }))).toMatchObject({ capability: 'video.remix', target: 'previous' });
    expect(act(run('წინა შედეგს ფერები შეუცვალე.'))).toMatchObject({ capability: 'media.edit', missing: ['previous'] });
  });

  test('9b an edit the edit\'s own words read, of the last video, is an edit of it; never a new video', () => {
    const last = { previous: { kind: 'video' as const } };
    expect(act(run('წინა ვიდეო შავ-თეთრი გახადე.', last))).toMatchObject({ capability: 'media.edit', target: 'previous' });
    expect(act(run('Make the last video black and white.', last))).toMatchObject({ capability: 'media.edit', target: 'previous' });
    expect(act(run('Mute the previous video.', last))).toMatchObject({ capability: 'media.edit', target: 'previous' });
    expect(act(run('Delete from 5 to 10 seconds of the previous video.', last))).toMatchObject({ capability: 'media.edit', target: 'previous' });
    // Something new asked for, or no last video: not an edit of it.
    expect(run('Make a new video like the last video, black and white.', last)).not.toMatchObject({ capability: 'media.edit' });
    expect(run('Mute the previous video.')).not.toMatchObject({ capability: 'media.edit', target: 'previous' });
  });

  test('10 „იგივე პერსონაჟით შემდეგი სცენა გააკეთე." — the next scene with the last result\'s character', () => {
    expect(act(run('იგივე პერსონაჟით შემდეგი სცენა გააკეთე.', { previous: { kind: 'video' } }))).toMatchObject({
      capability: 'video.generate', target: 'previous', params: { sameCharacter: true }, missing: [],
    });
    expect(act(run('იგივე პერსონაჟით შემდეგი სცენა გააკეთე.'))).toMatchObject({ missing: ['previous'] });
  });

  test('11–13 stop · where are you · go on — in plain chat and with a focus tool open', () => {
    for (const mode of ['chat', 'image', 'video', 'music', 'lipsync']) {
      expect(run('სამუშაო შეწყვიტე.', { mode })).toMatchObject({ kind: 'control', op: 'stop' });
      expect(run('სადამდე მიხვედი?', { mode })).toMatchObject({ kind: 'control', op: 'status' });
      expect(run('შენი წინა ნაბიჯიდან გააგრძელე.', { mode })).toMatchObject({ kind: 'control', op: 'continue' });
    }
  });
});

describe('the same sentences in English and Russian', () => {
  const cases: Array<[string, Partial<IntentInput>, Partial<Extract<AgentIntent, { kind: 'act' }>> | Partial<AgentIntent>]> = [
    ['Make a music video from these three clips', { attachments: [V, V, V, A] }, { capability: 'agent.montage', target: 'attachment' }],
    ['Сделай музыкальный клип из этих трёх видео', { attachments: [V, V, V, A] }, { capability: 'agent.montage', target: 'attachment' }],
    ['Extract the audio from this video as MP3', { attachments: [V] }, { capability: 'agent.audio-extract' }],
    ['Извлеки звук из этого видео в MP3', { attachments: [V] }, { capability: 'agent.audio-extract' }],
    ['Start the music from 5 seconds', { pending: { capability: 'agent.montage' } }, { capability: 'agent.montage', target: 'pending', params: { musicStartSec: 5 } }],
    ['Начни музыку с 5 секунды', { pending: { capability: 'agent.montage' } }, { capability: 'agent.montage', target: 'pending', params: { musicStartSec: 5 } }],
    ['Convert this video to 9:16', { attachments: [V] }, { capability: 'media.edit', params: { aspect: '9:16', editOp: 'aspect' } }],
    ['Переведи это видео в 9:16', { attachments: [V] }, { capability: 'media.edit', params: { aspect: '9:16', editOp: 'aspect' } }],
    ['Make a 20-second ad', {}, { capability: 'video.product-ad', params: { durationSec: 20 } }],
    ['Сделай рекламу на 20 секунд', {}, { capability: 'video.product-ad', params: { durationSec: 20 } }],
    ['Animate this photo', { attachments: [I] }, { capability: 'video.generate', params: { fromImage: true, editOp: 'animate' } }],
    ['Оживи это фото', { attachments: [I] }, { capability: 'video.generate', params: { fromImage: true, editOp: 'animate' } }],
    ['Add subtitles', { attachments: [V] }, { capability: 'video.remix', params: { editOp: 'captions' } }],
    ['Добавь субтитры', { attachments: [V] }, { capability: 'video.remix', params: { editOp: 'captions' } }],
    ['Dub this video into Russian', { attachments: [V] }, { capability: 'voice.dubbing', params: { targetLanguage: 'ru' } }],
    ['Озвучь это видео на русском', { attachments: [V] }, { capability: 'voice.dubbing', params: { targetLanguage: 'ru' } }],
    ['Change the colors of the previous result', { previous: { kind: 'image' } }, { capability: 'image.generate', target: 'previous' }],
    ['Измени цвета предыдущего результата', { previous: { kind: 'image' } }, { capability: 'image.generate', target: 'previous' }],
    ['Make the next scene with the same character', { previous: { kind: 'video' } }, { capability: 'video.generate', params: { sameCharacter: true } }],
    ['Сделай следующую сцену с тем же персонажем', { previous: { kind: 'video' } }, { capability: 'video.generate', params: { sameCharacter: true } }],
    ['Stop the job', { mode: 'image' }, { kind: 'control', op: 'stop' }],
    ['Останови работу', { mode: 'video' }, { kind: 'control', op: 'stop' }],
    ['How far along are you?', {}, { kind: 'control', op: 'status' }],
    ['На каком этапе?', { mode: 'music' }, { kind: 'control', op: 'status' }],
    ['Continue from your previous step', {}, { kind: 'control', op: 'continue' }],
    ['Продолжи с того места, где остановился', {}, { kind: 'control', op: 'continue' }],
  ];
  test.each(cases)('%s', (text, extra, want) => {
    expect(run(text, extra)).toMatchObject(want);
  });

  test('the language follows the script', () => {
    expect(run('Stop the job').lang).toBe('en');
    expect(run('Останови работу').lang).toBe('ru');
    expect(run('სამუშაო შეწყვიტე').lang).toBe('ka');
    expect(langOf('👍', 'ru')).toBe('ru');
    expect(langOf('ამ ვიდეოდან MP3')).toBe('ka');
  });
});

describe('never an act: questions, talk, feedback', () => {
  test.each([
    ['რამდენი ღირს მონტაჟი?', {}],
    ['what is dubbing?', {}],
    ['сколько стоит видео?', {}],
    ['რა მუსიკაა ამ ვიდეოში?', { attachments: [V] }],
    ['what song is in this video?', { attachments: [V] }],
    ['რა ფერებია ამ ფოტოზე?', { mode: 'image', attachments: [I] }],
    ['can you tell me what is in this video?', { attachments: [V] }],
    ['შეგიძლია ვიდეოს დამონტაჟება?', {}],
  ] as Array<[string, Partial<IntentInput>]>)('%s → question', (text, extra) => {
    const i = run(text, extra);
    expect(i.kind).toBe('question');
    expect(intentCanSpend(i)).toBe(false);
  });

  test.each(['აქ ხარ?', 'გამარჯობა', 'thanks', 'привет', 'who are you', 'რა არის ეს?'])('%s in Image mode → talk', (text) => {
    expect(run(text, { mode: 'image' }).kind).toBe('talk');
  });

  test.each(['არ მომწონს', 'ეს სურათი საერთოდ არ მომწონს', "I don't like it", 'мне не нравится это', 'ცუდია', 'not what i wanted'])(
    '%s → feedback, in any tool',
    (text) => {
      for (const mode of ['chat', 'image', 'video', 'music', 'lipsync']) expect(run(text, { mode }).kind).toBe('feedback');
    },
  );

  test('a complaint that names the change is an instruction, not feedback', () => {
    expect(run('არ მომწონს, ფერები გაათბე', { previous: { kind: 'image' } })).toMatchObject({ kind: 'act', params: { editOp: 'color' } });
  });
});

describe('controls are short and only about work in flight', () => {
  test.each([
    ['stop motion animation of a fox', { mode: 'image' }, 'image.generate'],
    ['continue the story about a dragon', {}, null],
    ['update the colors of this photo', { attachments: [I] }, 'image.generate'],
  ] as Array<[string, Partial<IntentInput>, string | null]>)('%s is not a control', (text, extra, cap) => {
    const i = run(text, extra);
    expect(i.kind).not.toBe('control');
    if (cap) expect(i).toMatchObject({ kind: 'act', capability: cap });
  });

  test('a file plus „stop" is not a job control', () => {
    expect(run('stop', { attachments: [V] }).kind).not.toBe('control');
  });

  test('controlOp reads the phrase anywhere in a short message, with only filler around it', () => {
    expect(controlOp('გთხოვ ახლავე შეწყვიტე')).toBe('stop');
    expect(controlOp('ok, status?')).toBe('status');
    expect(controlOp('please keep going')).toBe('continue');
    expect(controlOp('stop the music video and make a new one with dancers in it now')).toBeNull();
  });
});

describe('a change to the plan on screen', () => {
  const pending = { pending: { capability: 'agent.montage' as const } };
  test.each([
    ['make it 9:16', { aspect: '9:16' }],
    ['გახადე 20 წამიანი', { durationSec: 20 }],
    ['ვერტიკალური იყოს', { aspect: '9:16' }],
    ['сделай 30 секунд', { durationSec: 30 }],
  ] as Array<[string, Record<string, unknown>]>)('%s', (text, params) => {
    expect(act(run(text, pending))).toMatchObject({ capability: 'agent.montage', target: 'pending', params });
  });

  test('asking for something new is not a change to the plan', () => {
    expect(run('make a 30 second video of a dog', pending)).not.toMatchObject({ target: 'pending' });
    expect(run('გააკეთე 20-წამიანი რეკლამა', pending)).toMatchObject({ capability: 'video.product-ad' });
  });

  test('without a plan on screen the same words are not a change to one', () => {
    expect(run('make it 9:16')).not.toMatchObject({ target: 'pending' });
  });
});

describe('the focus tool still decides its own prompts', () => {
  test('thin prompt → act with detail missing (the gate\'s clarify), real prompt → act', () => {
    expect(act(run('cat', { mode: 'image' }))).toMatchObject({ capability: 'image.generate', missing: ['detail'] });
    expect(act(run('a red fox in the snow at sunset', { mode: 'image' }))).toMatchObject({ capability: 'image.generate', missing: [] });
    expect(act(run('lofi', { mode: 'music' }))).toMatchObject({ capability: 'music.generate' });
  });

  test('a polite request is read as the request', () => {
    expect(act(run('can you add subtitles to this video?', { attachments: [V] }))).toMatchObject({ capability: 'video.remix', params: { editOp: 'captions' } });
    expect(act(run('Could you cut these clips to the music?', { attachments: [V, V, A] }))).toMatchObject({ capability: 'agent.montage' });
  });

  test('a coming-soon service says so', () => {
    expect(run('remix this song')).toMatchObject({ kind: 'unavailable', capability: 'music.remix' });
  });
});
