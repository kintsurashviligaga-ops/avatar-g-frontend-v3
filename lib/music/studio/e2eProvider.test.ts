/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { e2eFakeLyriaEnabled, e2eFault } from './e2eProvider';

describe('e2eProvider guard (the stand-in for Lyria never reaches a real deployment)', () => {
  const on = { MUSIC_STUDIO_E2E_FAKE_PROVIDER: '1' } as NodeJS.ProcessEnv;
  it('answers only with the flag, off Vercel, against a Supabase on this machine', () => {
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'https://supabase.video-core-e2e.test:54443' })).toBe(true);
    expect(e2eFakeLyriaEnabled({ ...on, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).toBe(true);
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'http://localhost:54321' })).toBe(true);
    expect(e2eFakeLyriaEnabled({ SUPABASE_URL: 'http://localhost:54321' } as NodeJS.ProcessEnv)).toBe(false);
    expect(e2eFakeLyriaEnabled({ MUSIC_STUDIO_E2E_FAKE_PROVIDER: 'true', SUPABASE_URL: 'http://localhost:54321' } as NodeJS.ProcessEnv)).toBe(false);
  });
  it('refuses on any Vercel deployment and with any hosted or unparsable Supabase address', () => {
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'http://localhost:54321', VERCEL: '1' })).toBe(false);
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'http://localhost:54321', VERCEL_ENV: 'preview' })).toBe(false);
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'https://zwksnayknzggdcenqqxy.supabase.co' })).toBe(false);
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'https://evil.test.example.com' })).toBe(false);
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'not a url' })).toBe(false);
    // A mixed configuration (one address local, the other hosted) is refused.
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_URL: 'https://zwksnayknzggdcenqqxy.supabase.co' })).toBe(false);
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'https://zwksnayknzggdcenqqxy.supabase.co', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).toBe(false);
    expect(e2eFakeLyriaEnabled({ ...on, SUPABASE_URL: 'https://supabase.video-core-e2e.test:54443', NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.video-core-e2e.test:54443' })).toBe(true);
    expect(e2eFakeLyriaEnabled({ ...on })).toBe(false);
  });
  it('reads the fault switch from the prompt', () => {
    expect(e2eFault('calm [e2e:fail]')).toBe('fail');
    expect(e2eFault('[e2e:silent] x')).toBe('silent');
    expect(e2eFault('x [e2e:slow]')).toBe('slow');
    expect(e2eFault('calm piano')).toBeNull();
  });
});
