import { chunkSpeech } from '@/lib/speech/chunk';
import { IDLE_SPEECH } from '@/lib/speech/player';
import { CHUNK_MAX_CHARS, IDLE_PLAYER, planAnswerSpeech, planReportSpeech, READ_MAX_CHARS, viewerPlayerState } from './speech';

// What the player sends, one request per chunk.
const requests = (text: string) => chunkSpeech(text, { leadSentence: true }).map((c) => c.text);

describe('planReportSpeech — the text a voice can read', () => {
  const md = [
    '# Electric cars in the Caucasus',
    '',
    'Sales grew **fast** in 2025 [1], driven by tax cuts ([source](https://example.com/a)).',
    '',
    '| Country | Share |',
    '|---|---|',
    '| Georgia | 12% |',
    '',
    '```js',
    'const secret = 1;',
    '```',
    '',
    '- Armenia followed a similar path.',
  ].join('\n');

  test('no marks, no URLs, no citation markers, no code — but the words are all there', () => {
    const spoken = planReportSpeech(md).text;
    expect(spoken).toContain('Electric cars in the Caucasus');
    expect(spoken).toContain('Sales grew fast in 2025');
    expect(spoken).toContain('Georgia, 12%');
    expect(spoken).toContain('Armenia followed a similar path');
    for (const bad of ['**', 'https://', '[1]', 'const secret', '```', '|---|']) expect(spoken).not.toContain(bad);
  });

  test('every chunk fits one request', () => {
    const long = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} says something moderately long about the market.`).join(' ');
    const sent = requests(planReportSpeech(long).text);
    expect(sent.length).toBeGreaterThan(1);
    for (const ch of sent) expect(ch.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  test('a long report is read from the start, capped, and says so', () => {
    const long = Array.from({ length: 4000 }, (_, i) => `Finding ${i} is stated plainly.`).join(' ');
    const plan = planReportSpeech(long);
    expect(plan.partial).toBe(true);
    expect(plan.text.length).toBeLessThanOrEqual(READ_MAX_CHARS);
    expect(plan.text.length).toBeGreaterThan(READ_MAX_CHARS * 0.6);
    expect(plan.text.startsWith('Finding 0')).toBe(true);
    // the cut lands on a sentence end, never mid-word
    expect(plan.text).toMatch(/\.$/);
  });

  test('a short text is read whole; an empty one has no chunks', () => {
    expect(planReportSpeech('One short line.').partial).toBe(false);
    expect(planReportSpeech('   ').text).toBe('');
    expect(planAnswerSpeech('**Key point:** it grew.').text).toBe('Key point: it grew.');
  });

  test('Georgian text is chunked on its own sentence ends', () => {
    const ka = 'ბაზარი სწრაფად იზრდება. ' .repeat(120);
    const chunks = requests(planReportSpeech(ka).text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const ch of chunks) expect(ch.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });
});

describe('viewerPlayerState — the player as the viewer shows it', () => {
  const at = (over: Partial<typeof IDLE_SPEECH>) => ({ ...IDLE_SPEECH, owner: 'research', index: 2, total: 5, ...over });

  test('its own read: the status, the chunk, the count', () => {
    for (const status of ['loading', 'playing', 'paused', 'done'] as const) {
      expect(viewerPlayerState(at({ status }), 'research')).toEqual({ status, index: 2, total: 5 });
    }
  });

  test('a read that failed is an error, at the chunk it stopped on', () => {
    expect(viewerPlayerState(at({ status: 'failed', fault: 'synthesis' }), 'research')).toEqual({ status: 'error', index: 2, total: 5 });
  });

  test("another owner's read (a chat reply, the read-aloud controls) is idle here", () => {
    expect(viewerPlayerState(at({ status: 'playing', owner: 'omni:4' }), 'research')).toEqual(IDLE_PLAYER);
    expect(viewerPlayerState(IDLE_SPEECH, 'research')).toEqual(IDLE_PLAYER);
  });
});
