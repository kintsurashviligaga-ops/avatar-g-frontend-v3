/** @jest-environment node */
import { generateFluxProImage } from './fluxImage';

test('retired FLUX generation refuses without contacting Replicate even with legacy credentials', async () => {
  const saved = process.env.REPLICATE_API_TOKEN;
  const fetchSpy = jest.spyOn(global, 'fetch');
  process.env.REPLICATE_API_TOKEN = 'legacy-token';
  try {
    await expect(generateFluxProImage('a cat', '1:1')).rejects.toMatchObject({ code: 'provider_deprecated' });
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
    if (saved === undefined) delete process.env.REPLICATE_API_TOKEN;
    else process.env.REPLICATE_API_TOKEN = saved;
  }
});
