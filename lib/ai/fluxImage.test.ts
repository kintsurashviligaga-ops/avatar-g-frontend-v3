import { generateFluxProImage } from './fluxImage';

describe('generateFluxProImage — fail-open fallback leg', () => {
  const saved = process.env.REPLICATE_API_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.REPLICATE_API_TOKEN;
    else process.env.REPLICATE_API_TOKEN = saved;
  });

  test('returns null (leg unavailable) when REPLICATE_API_TOKEN is unset — never throws', async () => {
    delete process.env.REPLICATE_API_TOKEN;
    await expect(generateFluxProImage('a cat', '1:1')).resolves.toBeNull();
  });
});
