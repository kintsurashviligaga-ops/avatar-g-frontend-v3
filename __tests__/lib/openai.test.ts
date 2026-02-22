import {
  getOpenAIReply,
  __setOpenAIClientFactoryForTests,
  __resetOpenAIClientFactoryForTests,
} from '../../lib/openai';

describe('getOpenAIReply', () => {
  const mockCreate = jest.fn();

  beforeEach(() => {
    mockCreate.mockReset();
    delete process.env.OPENAI_API_KEY;
  });

  test('throws clear error when OPENAI_API_KEY is missing', async () => {
    __resetOpenAIClientFactoryForTests();
    await expect(getOpenAIReply('hello')).rejects.toThrow('OPENAI_API_KEY is missing in environment variables');
  });

  test('returns concise trimmed response up to 1500 chars', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'a'.repeat(1700),
          },
        },
      ],
    });

    __setOpenAIClientFactoryForTests(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    }));

    const reply = await getOpenAIReply('Give me a long answer');
    __resetOpenAIClientFactoryForTests();

    expect(reply.length).toBe(1500);
    expect(reply.endsWith('...')).toBe(true);
  });

  test('returns fallback text when OpenAI returns empty content', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '',
          },
        },
      ],
    });

    __setOpenAIClientFactoryForTests(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    }));

    const reply = await getOpenAIReply('hello');
    __resetOpenAIClientFactoryForTests();

    expect(reply).toBe('I could not generate a response right now.');
  });
});
