/** @jest-environment node */
/**
 * „What is in my video?" in the chat (lib/agent/media/analyzeChat): which messages the whole-file analysis takes, what the
 * bubble says, and the card's steps, scenes, moments and transcript. Pure; nothing is read or charged here.
 */
import {
  analyzeAnswerText, analyzeAsk, analyzeCard, analyzeErrorText, analyzeFocusOf, analyzeReadingText, analyzeRetryable, atText,
  type AgentAnalyzeState,
} from './analyzeChat';
import type { MediaAnalysis } from './analyzeSpec';

const ANALYSIS: MediaAnalysis = {
  summary: 'Two people talk on a street at night.',
  language: 'en',
  scenes: [{ startSec: 0, endSec: 12, description: 'A street at night' }, { startSec: 12, endSec: 75, description: 'A café' }],
  moments: [{ atSec: 40, why: 'The laugh' }],
  transcript: [{ startSec: 3, speaker: 'A', text: 'Hello there.' }, { startSec: 65, speaker: null, text: 'Bye.' }],
  speakers: [{ id: 'A', description: 'a woman in a red coat' }],
  objects: ['car', 'lamp'],
  answer: null,
  dropped: 0,
};

describe('analyzeAsk: which messages the analysis takes', () => {
  test.each([
    ['რა ხდება ამ ვიდეოში?', 'question'],
    ['გადმომეცი სიტყვასიტყვით რას ამბობენ', 'transcript'],
    ['What are the best moments in this video?', 'moments'],
    ['Describe the scenes', 'scenes'],
    ['Что говорят в этом видео?', 'transcript'],
  ])('one attached video and a question (%s → %s)', (text, focus) => {
    expect(analyzeAsk(text, ['video'])).toEqual({ source: 'file', focus });
  });

  test('one audio file and a question: the same', () => {
    expect(analyzeAsk('who is speaking?', ['audio'])).toEqual({ source: 'file', focus: 'question' });
  });

  test('a YouTube link with a question about it; the link alone, or its „?v=", is not a question', () => {
    expect(analyzeAsk('რაზეა ეს ვიდეო? https://www.youtube.com/watch?v=abc12345678', [])).toEqual({
      source: 'youtube', url: expect.stringContaining('abc12345678'), focus: 'question',
    });
    expect(analyzeAsk('https://www.youtube.com/watch?v=abc12345678', [])).toBeNull();
    expect(analyzeAsk('https://youtu.be/abc12345678', [])).toBeNull();
  });

  test('not for it: edits, the MP3 ask, other links, two files, images, a link next to a file, no words', () => {
    expect(analyzeAsk('trim the first 5 seconds', ['video'])).toBeNull();
    expect(analyzeAsk('ამოიღე MP3 ამ ვიდეოდან', ['video'])).toBeNull();
    expect(analyzeAsk('what is on https://vimeo.com/12345 ?', [])).toBeNull();
    expect(analyzeAsk('what is in these?', ['video', 'video'])).toBeNull();
    expect(analyzeAsk('what is in this picture?', ['image'])).toBeNull();
    expect(analyzeAsk('compare with https://youtu.be/abc12345678 ?', ['video'])).toBeNull();
    expect(analyzeAsk('', ['video'])).toBeNull();
    expect(analyzeAsk('nice', ['video'])).toBeNull();
  });

  test('the focus words in KA/EN/RU', () => {
    expect(analyzeFocusOf('ტრანსკრიპტი მომეცი')).toBe('transcript');
    expect(analyzeFocusOf('highlights please')).toBe('moments');
    expect(analyzeFocusOf('Лучшие моменты')).toBe('moments');
    expect(analyzeFocusOf('რა სცენებია?')).toBe('scenes');
    expect(analyzeFocusOf('who is the man?')).toBe('question');
  });
});

describe('the bubble and the card', () => {
  test('the bubble says the answer, else the summary; times read as m:ss', () => {
    expect(analyzeAnswerText(ANALYSIS)).toBe('Two people talk on a street at night.');
    expect(analyzeAnswerText({ ...ANALYSIS, answer: '  A woman in red.  ' })).toBe('A woman in red.');
    expect(atText(75)).toBe('1:15');
    expect(atText(-3)).toBe('0:00');
    expect(analyzeReadingText('youtube', 'en')).toMatch(/analysis only/);
  });

  test('reading a file: the upload is the live step; once uploaded, Gemini reads it', () => {
    const s: AgentAnalyzeState = { phase: 'reading', source: 'file', name: 'clip.mp4', t0: 1 };
    expect(analyzeCard(s, 'en').steps.map((x) => x.state)).toEqual(['active', 'pending', 'pending']);
    const up = analyzeCard({ ...s, uploaded: true }, 'en');
    expect(up.steps.map((x) => x.state)).toEqual(['done', 'active', 'pending']);
    expect(up.steps[0]!.detail).toBe('clip.mp4');
    expect(up.note).toBeNull();
  });

  test('done: every step ticked; scenes as chips, moments, speakers, the transcript; free, within a daily limit', () => {
    const m = analyzeCard({ phase: 'done', source: 'file', name: 'clip.mp4', uploaded: true, answer: { analysis: ANALYSIS, type: 'video', durationSec: 75 }, t0: 1, t1: 2 }, 'en');
    expect(m.steps.every((x) => x.state === 'done')).toBe(true);
    expect(m.steps[1]!.detail).toBe('video · 1:15');
    expect(m.scenes).toEqual([{ at: '0:00–0:12', text: 'A street at night' }, { at: '0:12–1:15', text: 'A café' }]);
    expect(m.moments).toEqual([{ at: '0:40', text: 'The laugh' }]);
    expect(m.speakers).toEqual(['A: a woman in a red coat']);
    expect(m.transcript).toEqual([{ at: '0:03', who: 'A', text: 'Hello there.' }, { at: '1:05', who: null, text: 'Bye.' }]);
    expect(m.note).toBe('Free for you (within a daily limit)');
    expect(m.status).toBe('done');
  });

  test('a YouTube link says it was only read; a failure marks the step that failed and leaves the reason to the bubble (ka)', () => {
    const yt = analyzeCard({ phase: 'done', source: 'youtube', name: 'YouTube', answer: { analysis: ANALYSIS, type: 'video', durationSec: null } }, 'en');
    expect(yt.steps[0]!.label).toBe('Check the link');
    expect(yt.note).toBe('Analysis only: nothing was downloaded · Free for you (within a daily limit)');
    const up = analyzeCard({ phase: 'failed', source: 'file', error: 'upload_failed' }, 'ka');
    expect(up.steps.map((x) => x.state)).toEqual(['failed', 'skipped', 'skipped']);
    expect(up.steps[0]!.detail).toBeUndefined();
    const long = analyzeCard({ phase: 'failed', source: 'file', uploaded: true, error: 'too_long' }, 'ru');
    expect(long.steps.map((x) => x.state)).toEqual(['done', 'failed', 'skipped']);
    expect(long.steps[1]!.detail).toBeUndefined();
    expect(analyzeErrorText('too_long', 'ru')).toBe('Файл слишком длинный (до 30 минут).');
  });

  test('error texts fall back to „did not finish"; only a failure that asking again can mend is retried', () => {
    expect(analyzeErrorText('model_failed', 'en')).toBe('The analysis did not finish. Try again.');
    expect(analyzeErrorText(undefined, 'ka')).toBe(analyzeErrorText('network', 'ka'));
    expect(['network', 'model_failed', 'bad_answer', 'upload_failed'].every(analyzeRetryable)).toBe(true);
    expect(['too_long', 'rate_limited', 'closed', 'media_not_yours', 'not_youtube'].some(analyzeRetryable)).toBe(false);
  });
});
