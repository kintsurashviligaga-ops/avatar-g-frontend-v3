import { isUnavailable, taskFailDetail, taskFailLine } from './failText';

describe('Agent G task failure text (Phase 8.20)', () => {
  test('a Vertex timeout or 500 reads as "temporarily unavailable" in the visitor language, never llm_error', () => {
    for (const raw of ['llm_error', 'HTTP 502', 'HTTP 500', 'HTTP 0', 'The operation was aborted due to timeout', 'fetch failed']) {
      expect(isUnavailable(raw)).toBe(true);
      expect(taskFailLine('ვერ შესრულდა', raw, 'ka')).toBe('ვერ შესრულდა: სერვისი დროებით მიუწვდომელია. სცადე ერთ წუთში.');
      expect(taskFailLine('Не удалось', raw, 'ru')).toContain('временно недоступен');
      expect(taskFailLine('Failed', raw, 'en')).toContain('temporarily unavailable');
    }
  });

  test('a message already in the visitor script is kept', () => {
    expect(taskFailDetail('ბიუჯეტი ამოიწურა', 'ka')).toBe('ბიუჯეტი ამოიწურა');
    expect(taskFailDetail('Бюджет исчерпан', 'ru')).toBe('Бюджет исчерпан');
  });

  test('English technical text is never shown to a ka or ru visitor', () => {
    expect(taskFailDetail('sandbox_budget_exceeded', 'ka')).toBe('');
    expect(taskFailDetail('Budget exceeded for today', 'ka')).toBe('');
    expect(taskFailDetail('Budget exceeded for today', 'ru')).toBe('');
    expect(taskFailLine('ვერ შესრულდა', 'Budget exceeded for today', 'ka')).toBe('ვერ შესრულდა');
  });

  test('English readers keep a readable English sentence but not a code', () => {
    expect(taskFailDetail('Budget exceeded for today', 'en')).toBe('Budget exceeded for today');
    expect(taskFailDetail('sandbox_budget_exceeded', 'en')).toBe('');
  });

  test('nothing to say, nothing added', () => {
    expect(taskFailLine('ვერ შესრულდა', undefined, 'ka')).toBe('ვერ შესრულდა');
    expect(taskFailLine('ვერ შესრულდა', '  ', 'ka')).toBe('ვერ შესრულდა');
  });
});
