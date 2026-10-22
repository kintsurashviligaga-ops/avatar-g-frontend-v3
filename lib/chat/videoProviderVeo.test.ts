/** @jest-environment node */
import { hasVideoProvider, hasVeoVertexEnv } from './videoProvider';

const E = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

const VERTEX_VEO = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_VEO_BUCKET: 'gs://myavatar-veo-output',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};

describe('a Google-only configuration can render', () => {
  it('THE TRAP: Veo is the PRIMARY clip engine, and this gate did not count it — so removing the legacy '
    + 'tokens skipped every scene before Veo was ever asked', () => {
    expect(hasVideoProvider(E(VERTEX_VEO))).toBe(true);
  });

  it('a service-account key stands in for Workload Identity', () => {
    expect(hasVeoVertexEnv(E({ GCP_PROJECT_ID: 'p', GCP_VEO_BUCKET: 'b', GCP_SERVICE_ACCOUNT_KEY: '{}' }))).toBe(true);
  });

  it('VEO_TRANSPORT unset, auto or vertex all mean Vertex AI', () => {
    for (const v of ['', 'auto', 'vertex', ' Vertex ']) {
      expect(hasVeoVertexEnv(E({ ...VERTEX_VEO, VEO_TRANSPORT: v }))).toBe(true);
    }
  });
});

describe('the Developer API is not a Veo route (v3.1)', () => {
  it('an AI Studio key alone, under either alias, is no route', () => {
    expect(hasVideoProvider(E({ GEMINI_API_KEY: 'k' }))).toBe(false);
    expect(hasVideoProvider(E({ GOOGLE_GENERATIVE_AI_API_KEY: 'k' }))).toBe(false);
  });

  it('VEO_TRANSPORT=gemini (or any unknown value) refuses even a complete Vertex setup', () => {
    for (const v of ['gemini', 'bogus']) {
      expect(hasVeoVertexEnv(E({ ...VERTEX_VEO, GEMINI_API_KEY: 'k', VEO_TRANSPORT: v }))).toBe(false);
    }
  });

  it('a partial Vertex setup is no route: the bucket, the project, or one Workload Identity name missing', () => {
    for (const drop of ['GCP_VEO_BUCKET', 'GCP_PROJECT_ID', 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID']) {
      const env: Record<string, string> = { ...VERTEX_VEO, GEMINI_API_KEY: 'k' };
      delete env[drop];
      expect(hasVeoVertexEnv(E(env))).toBe(false);
    }
  });
});

describe('the existing providers are unaffected', () => {
  it('Replicate alone still counts', () => {
    expect(hasVideoProvider(E({ REPLICATE_API_TOKEN: 't' }))).toBe(true);
  });

  it('no provider at all is still false — the halt-before-spending guard must survive', () => {
    expect(hasVideoProvider(E({}))).toBe(false);
  });

  it('an empty or whitespace value is not a setting', () => {
    expect(hasVideoProvider(E({ ...VERTEX_VEO, GCP_PROJECT_ID: '   ' }))).toBe(false);
  });
});
