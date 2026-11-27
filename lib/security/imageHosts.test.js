/* eslint-disable @typescript-eslint/no-require-imports */
const { imageRemotePatterns, supabaseImageHost } = require('./imageHosts');

describe('image optimizer hosts', () => {
  const hosts = (env) => imageRemotePatterns(env).map((p) => p.hostname);

  it('admits only our own Supabase project when its URL is known', () => {
    expect(hosts({ NEXT_PUBLIC_SUPABASE_URL: 'https://zwksnayknzggdcenqqxy.supabase.co' })).toEqual([
      'zwksnayknzggdcenqqxy.supabase.co',
      'placehold.co',
      '*.r2.cloudflarestorage.com',
    ]);
  });

  it('never admits example.com or every Supabase project once the URL is set', () => {
    const list = hosts({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/' });
    expect(list).not.toContain('example.com');
    expect(list).not.toContain('**.supabase.co');
  });

  it('falls back to the old wildcard when the URL is unset or not a plain https supabase.co address', () => {
    for (const raw of [undefined, '', 'not a url', 'http://abc.supabase.co', 'https://abc.supabase.co:8443', 'https://u:p@abc.supabase.co', 'https://db.example.com', 'https://a.b.supabase.co']) {
      expect(supabaseImageHost(raw)).toBeNull();
      expect(hosts({ NEXT_PUBLIC_SUPABASE_URL: raw })[0]).toBe('**.supabase.co');
    }
  });

  it('next.config.js uses this list', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../next.config.js'), 'utf8');
    expect(src).toMatch(/remotePatterns:\s*imageRemotePatterns\(\)/);
    expect(src).not.toMatch(/hostname:\s*'example\.com'/);
  });
});
