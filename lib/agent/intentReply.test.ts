/** @jest-environment node */
/**
 * What the chat answers itself (lib/agent/intentReply) for the readings lib/agent/intent gives: the 13 sentences of the
 * Master Task in the chat, the same in a focus tool (never taken over), and the words Agent G says in ka · en · ru.
 */
import { classifyAgentIntent, type IntentInput } from './intent';
import {
  askReply, continueReply, interceptAct, mergeMontagePrompt, replacedNote, statusReply, stopReply, unsupportedReply,
  type ActIntent, type InterceptContext,
} from './intentReply';

const ON: InterceptContext = { mode: 'chat', montageOn: true, audioOn: true };
const act = (input: IntentInput): ActIntent => {
  const i = classifyAgentIntent({ mode: 'chat', ...input });
  if (i.kind !== 'act') throw new Error(`expected act for "${input.text}", got ${i.kind}`);
  return i;
};

describe('interceptAct: the chat takes over only what it can answer honestly', () => {
  test('a plan change on the montage card on screen re-quotes it', () => {
    const i = act({ text: 'მუსიკა 5 წამიდან დაიწყე.', pending: { capability: 'agent.montage' } });
    expect(interceptAct(i, ON)).toBe('requote');
    const j = act({ text: 'make it 9:16', pending: { capability: 'agent.montage' } });
    expect(interceptAct(j, ON)).toBe('requote');
  });

  test('three clips with no track: Agent G asks for the track, nothing runs', () => {
    const i = act({ text: 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.', attachments: ['video', 'video', 'video'] });
    expect(i.missing).toEqual(['track']);
    expect(interceptAct(i, ON)).toBe('ask');
  });

  test('clips and a track go on to the montage card (not taken over)', () => {
    const i = act({ text: 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.', attachments: ['video', 'video', 'video', 'audio'] });
    expect(i.missing).toEqual([]);
    expect(interceptAct(i, ON)).toBeNull();
  });

  test('„extract the sound as MP3" with nothing attached asks for the source; with a video it goes on', () => {
    expect(interceptAct(act({ text: 'ამ ვიდეოდან ამოიღე ხმა MP3-ად.' }), ON)).toBe('ask');
    expect(interceptAct(act({ text: 'ამ ვიდეოდან ამოიღე ხმა MP3-ად.', attachments: ['video'] }), ON)).toBeNull();
  });

  test('with the Agent G media flag off, montage and audio fall through to the old doors', () => {
    const off: InterceptContext = { mode: 'chat', montageOn: false, audioOn: false };
    expect(interceptAct(act({ text: 'მუსიკა 5 წამიდან დაიწყე.', pending: { capability: 'agent.montage' } }), off)).toBeNull();
    expect(interceptAct(act({ text: 'ამ ვიდეოდან ამოიღე ხმა MP3-ად.' }), off)).toBeNull();
  });

  test('„convert the video to 9:16" with a video attached: said plainly, no new video is made', () => {
    const i = act({ text: 'ვიდეო 9:16-ზე გადაიყვანე.', attachments: ['video'] });
    expect(i.capability).toBe('media.edit');
    expect(interceptAct(i, ON)).toBe('unsupported');
    expect(unsupportedReply(i, 'ka')).toContain('9:16');
  });

  test('an edit of the previous result is said plainly, not regenerated', () => {
    const i = act({ text: 'წინა შედეგს ფერები შეუცვალე.', previous: { kind: 'video' } });
    expect(i.target).toBe('previous');
    expect(interceptAct(i, ON)).toBe('unsupported');
    expect(unsupportedReply(i, 'en')).toMatch(/will not make a new one/);
  });

  test('„bring this photo to life" with no photo asks for it; with a photo it goes on to the video tool', () => {
    expect(interceptAct(act({ text: 'ეს ფოტო გააცოცხლე.' }), ON)).toBe('ask');
    expect(interceptAct(act({ text: 'ეს ფოტო გააცოცხლე.', attachments: ['image'] }), ON)).toBeNull();
  });

  test('„add subtitles" with no video asks which video', () => {
    const i = act({ text: 'სუბტიტრები დაამატე.' });
    expect(i.capability).toBe('video.remix');
    expect(interceptAct(i, ON)).toBe('ask');
    expect(askReply(i, 'ka')).toMatch(/ვიდეო/);
  });

  test('a 20-second ad and a dub go on to their existing doors', () => {
    expect(interceptAct(act({ text: 'გააკეთე 20-წამიანი რეკლამა.' }), ON)).toBeNull();
    expect(interceptAct(act({ text: 'ეს ვიდეო რუსულად გაახმოვანე.', attachments: ['video'] }), ON)).toBeNull();
  });

  test('a focus tool keeps its own flow: nothing is taken over outside the chat', () => {
    const i = classifyAgentIntent({ text: 'ეს ფოტო გააცოცხლე.', mode: 'video' });
    if (i.kind === 'act') expect(interceptAct(i, { ...ON, mode: 'video' })).toBeNull();
    const j = act({ text: 'მუსიკა 5 წამიდან დაიწყე.', pending: { capability: 'agent.montage' } });
    expect(interceptAct(j, { ...ON, mode: 'music' })).toBeNull();
  });
});

describe('control replies', () => {
  test('stop: what was stopped, or that nothing ran, in each language', () => {
    expect(stopReply([], 'ka')).toMatch(/არაფერი მუშაობს/);
    expect(stopReply([], 'en')).toMatch(/Nothing is running/);
    expect(stopReply([], 'ru')).toMatch(/ничего не выполняется/);
    expect(stopReply([{ what: 'montage', status: 'running' }], 'en')).toBe('⏹ Stopped: the montage.');
    expect(stopReply([{ what: 'image', status: 'queued', label: 'Sunset poster' }], 'ka')).toBe('⏹ გავაჩერე: Sunset poster.');
  });

  test('stop of a film says that scenes already sent keep rendering', () => {
    expect(stopReply([{ what: 'video', status: 'running' }], 'en')).toMatch(/keep rendering/);
    expect(stopReply([{ what: 'audio', status: 'running' }], 'en')).not.toMatch(/keep rendering/);
  });

  test('status lists each item with its step and percent', () => {
    expect(statusReply([], 'ru')).toMatch(/ничего не выполняется/);
    const s = statusReply([
      { what: 'montage', status: 'running', stage: 'Cutting on the beat', pct: 41.6 },
      { what: 'image', status: 'queued', pct: 0 },
    ], 'en');
    expect(s).toBe('Running now:\n• the montage — Cutting on the beat · 42%\n• an image — queued');
  });

  test('continue: a waiting plan, running work, or nothing to pick up', () => {
    expect(continueReply('plan-waiting', 'ka')).toMatch(/დაწყებას/);
    expect(continueReply('running', 'en')).toMatch(/still working/);
    expect(continueReply('nothing', 'ru')).toMatch(/Прерванной работы нет/);
  });

  test('an unknown locale answers in Georgian', () => {
    expect(continueReply('nothing', 'de')).toMatch(/შეწყვეტილი/);
  });
});

describe('ask and unsupported replies', () => {
  test('a montage with no clips asks for clips and a track; with clips only the track', () => {
    const none = act({ text: 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.' });
    expect(none.missing).toEqual(['clips', 'track']);
    expect(askReply(none, 'en')).toMatch(/Attach the clips and one music file/);
    const clips = act({ text: 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.', attachments: ['video', 'video'] });
    expect(askReply(clips, 'en')).toMatch(/the music is missing/);
  });

  test('every ask names what to send in all three languages and never promises a charge', () => {
    const cases = [
      act({ text: 'ამ ვიდეოდან ამოიღე ხმა MP3-ად.' }),
      act({ text: 'ეს ფოტო გააცოცხლე.' }),
      act({ text: 'სუბტიტრები დაამატე.' }),
    ];
    for (const i of cases) {
      for (const lang of ['ka', 'en', 'ru']) {
        const t = askReply(i, lang);
        expect(t.length).toBeGreaterThan(20);
        expect(t).not.toMatch(/კრედიტ|credit|кредит/i);
      }
    }
  });

  test('a music offset on a finished video points at the montage plan', () => {
    const i = act({ text: 'მუსიკა 5 წამიდან დაიწყე.', attachments: ['video'] });
    expect(i.params.editOp).toBe('music_offset');
    expect(interceptAct(i, ON)).toBe('unsupported');
    expect(unsupportedReply(i, 'ru')).toMatch(/В плане монтажа могу/);
  });
});

test('mergeMontagePrompt keeps the plan\'s words, adds the change and stays within the route limit', () => {
  expect(mergeMontagePrompt('ამ სამი ვიდეოდან კლიპი', 'მუსიკა 5 წამიდან დაიწყე')).toBe('ამ სამი ვიდეოდან კლიპი\nმუსიკა 5 წამიდან დაიწყე');
  expect(mergeMontagePrompt(undefined, ' 9:16 ')).toBe('9:16');
  expect(mergeMontagePrompt('x'.repeat(1990), 'make it 9:16').length).toBe(2000);
});

test('replacedNote in each language', () => {
  expect(replacedNote('ka')).toMatch(/ქვემოთაა/);
  expect(replacedNote('en')).toBe('Plan changed: the new one is below.');
  expect(replacedNote('ru')).toMatch(/новый ниже/);
});
