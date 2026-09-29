/** @jest-environment node */
import { signJobId, verifyJobSignature, webhookBaseUrl, webhookUrlForJob } from './webhookAuth';

const SECRET = 'a-webhook-secret-of-sufficient-length';
const env = { HF_WEBHOOK_SECRET: SECRET, NEXT_PUBLIC_APP_URL: 'https://myavatar.ge/' } as NodeJS.ProcessEnv;
const JOB = '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

describe('the webhook URL is the credential', () => {
  test('carries the job id and an HMAC of it, on the public https origin', () => {
    const url = webhookUrlForJob(JOB, env)!;
    expect(url).toBe(`https://myavatar.ge/api/webhooks/higgsfield?job=${JOB}&sig=${signJobId(JOB, SECRET)}`);
    const u = new URL(url);
    expect(verifyJobSignature(u.searchParams.get('job')!, u.searchParams.get('sig'), env)).toBe(true);
  });

  test('a signature for one job does not authenticate another', () => {
    const sig = signJobId(JOB, SECRET);
    expect(verifyJobSignature('7f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f', sig, env)).toBe(false);
  });

  test('tampered, missing or wrong-secret signatures fail', () => {
    const sig = signJobId(JOB, SECRET);
    expect(verifyJobSignature(JOB, `${sig.slice(0, -1)}A`, env)).toBe(false);
    expect(verifyJobSignature(JOB, null, env)).toBe(false);
    expect(verifyJobSignature(JOB, signJobId(JOB, 'another-secret-entirely-xx'), env)).toBe(false);
  });

  test('no secret (or a short one) → no webhook URL and nothing verifies', () => {
    expect(webhookUrlForJob(JOB, { NEXT_PUBLIC_APP_URL: 'https://myavatar.ge' } as NodeJS.ProcessEnv)).toBeNull();
    expect(webhookUrlForJob(JOB, { HF_WEBHOOK_SECRET: 'short', NEXT_PUBLIC_APP_URL: 'https://myavatar.ge' } as NodeJS.ProcessEnv)).toBeNull();
    expect(verifyJobSignature(JOB, signJobId(JOB, 'short'), { HF_WEBHOOK_SECRET: 'short' } as NodeJS.ProcessEnv)).toBe(false);
  });

  test('only an https origin is used (Higgsfield cannot call localhost or plain http)', () => {
    expect(webhookBaseUrl({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' } as NodeJS.ProcessEnv)).toBeNull();
    expect(webhookBaseUrl({ NEXT_PUBLIC_APP_URL: 'http://x', SITE_URL: 'https://myavatar.ge' } as NodeJS.ProcessEnv)).toBe('https://myavatar.ge');
    expect(webhookBaseUrl({ HF_WEBHOOK_BASE_URL: 'https://hooks.myavatar.ge/', NEXT_PUBLIC_APP_URL: 'https://myavatar.ge' } as NodeJS.ProcessEnv)).toBe('https://hooks.myavatar.ge');
  });
});
