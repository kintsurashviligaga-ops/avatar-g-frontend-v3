/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));

import { llmText } from '../ai/llmText';
import { parsePersonVerdict, storyFeaturesPerson } from './storyPerson';

const llm = llmText as jest.MockedFunction<typeof llmText>;

describe('parsePersonVerdict', () => {
  it.each([
    ['{"person": true}', true],
    ['{"person":false}', false],
    ['```json\n{"person": false}\n```', false],
    ['YES', true],
    ['no.', false],
    ['true', true],
  ])('%p → %p', (raw, want) => {
    expect(parsePersonVerdict(raw)).toBe(want);
  });

  it.each([[null], [undefined], [''], ['   '], ['{"person": "no"}'], ['{"human": false}'], ['maybe'], ['no person, but a cat']])(
    '%p → null (unknown keeps the old behaviour)',
    (raw) => {
      expect(parsePersonVerdict(raw as string | null | undefined)).toBeNull();
    },
  );
});

describe('storyFeaturesPerson', () => {
  beforeEach(() => llm.mockReset());

  it('asks Gemini once, as JSON at temperature 0, and reads the verdict', async () => {
    llm.mockResolvedValueOnce('{"person": false}');
    await expect(storyFeaturesPerson('A red paper boat on a pond, a grey cat on the dock')).resolves.toBe(false);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0]![0]).toMatchObject({ json: true, temperature: 0 });
    expect(llm.mock.calls[0]![0].system).toMatch(/HUMAN/);
  });

  it('an empty brief asks nothing', async () => {
    await expect(storyFeaturesPerson('   ')).resolves.toBeNull();
    expect(llm).not.toHaveBeenCalled();
  });

  it('a miss or a throw is null, never an exception', async () => {
    llm.mockResolvedValueOnce(null);
    await expect(storyFeaturesPerson('a singer on a stage')).resolves.toBeNull();
    llm.mockRejectedValueOnce(new Error('boom'));
    await expect(storyFeaturesPerson('a singer on a stage')).resolves.toBeNull();
  });

  it('cuts a very long brief before sending it', async () => {
    llm.mockResolvedValueOnce('{"person": true}');
    await storyFeaturesPerson('x'.repeat(5000));
    expect(llm.mock.calls[0]![0].user.length).toBe(1500);
  });
});
