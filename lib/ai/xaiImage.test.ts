/** @jest-environment node */
import { hasXaiApiKey, generateGrokImage } from './xaiImage';

test('retired xAI never advertises readiness or contacts the provider', async () => {
  expect(hasXaiApiKey({ XAI_API_KEY: 'legacy-key' } as NodeJS.ProcessEnv)).toBe(false);
  const fetchSpy = jest.spyOn(global, 'fetch');
  try {
    await expect(generateGrokImage('a cat')).rejects.toMatchObject({ code: 'provider_deprecated' });
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
