import { hasXaiApiKey, generateGrokImage } from './xaiImage';

describe('xAI Grok Imagine client', () => {
  const realKey = process.env.XAI_API_KEY;
  afterEach(() => {
    if (realKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = realKey;
  });

  test('hasXaiApiKey reflects the env var', () => {
    delete process.env.XAI_API_KEY;
    expect(hasXaiApiKey()).toBe(false);
    expect(hasXaiApiKey({ XAI_API_KEY: '  ' } as NodeJS.ProcessEnv)).toBe(false);
    expect(hasXaiApiKey({ XAI_API_KEY: 'xai-test' } as NodeJS.ProcessEnv)).toBe(true);
  });

  test('generateGrokImage returns null (leg unavailable) with no key — never throws', async () => {
    delete process.env.XAI_API_KEY;
    await expect(generateGrokImage('a neon cat')).resolves.toBeNull();
  });
});
