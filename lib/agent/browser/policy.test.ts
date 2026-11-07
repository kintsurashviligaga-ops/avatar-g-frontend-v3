/** @jest-environment node */
import { BROWSER_MAX_SHOTS, BROWSER_MAX_STEPS, checkBrowserTask, isPublicHost, publicUrl } from './policy';

describe('browser policy', () => {
  it('accepts public host names only', () => {
    for (const h of ['example.com', 'www.nbg.gov.ge', 'sub.domain.co.uk', 'xn--80ak6aa92e.com']) expect(isPublicHost(h)).toBe(true);
    for (const h of ['localhost', '127.0.0.1', '10.0.0.5', '169.254.169.254', 'metadata.google.internal', 'intranet',
      'printer.local', 'db.internal', 'nas.lan', 'router.home', 'x.corp', '-bad.com', 'a..com', '1234']) {
      expect(isPublicHost(h)).toBe(false);
    }
  });

  it('accepts http(s) on default ports without credentials only', () => {
    expect(publicUrl('https://example.com/a?b=1')?.toString()).toBe('https://example.com/a?b=1');
    expect(publicUrl('http://example.com')).not.toBeNull();
    for (const u of ['file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)', 'https://user:pw@example.com',
      'https://example.com:8080/', 'http://[::1]/', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data',
      'chrome://settings', 'not a url', 42]) {
      expect(publicUrl(u)).toBeNull();
    }
  });

  it('checks a task and names its hosts', () => {
    const r = checkBrowserTask({ steps: [
      { op: 'goto', url: 'https://www.nbg.gov.ge/en/monetary-policy' },
      { op: 'text', selector: 'main' },
      { op: 'links' },
      { op: 'screenshot', name: 'rates' },
      { op: 'goto', url: 'https://example.com/' },
      { op: 'screenshot' },
    ] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.hosts).toEqual(['www.nbg.gov.ge', 'example.com']);
    expect(r.plan.steps[2]).toEqual({ op: 'links' });
    expect(r.plan.steps[5]).toEqual({ op: 'screenshot', name: 'shot-2' });
  });

  it('refuses what it must', () => {
    const bad = (steps: unknown) => checkBrowserTask({ steps }).ok;
    expect(bad([])).toBe(false);
    expect(bad([{ op: 'text' }])).toBe(false); // the first step opens a page
    expect(bad([{ op: 'goto', url: 'http://localhost:3000' }])).toBe(false);
    expect(bad([{ op: 'goto', url: 'https://example.com' }, { op: 'goto', url: 'http://10.1.2.3/' }])).toBe(false);
    expect(bad([{ op: 'goto', url: 'https://example.com' }, { op: 'eval', code: 'x' }])).toBe(false);
    expect(bad([{ op: 'goto', url: 'https://example.com' }, { op: 'press', key: 'Control+A' }])).toBe(false);
    expect(bad([{ op: 'goto', url: 'https://example.com' }, { op: 'wait', ms: 60_000 }])).toBe(false);
    expect(bad([{ op: 'goto', url: 'https://example.com' }, { op: 'type', selector: '#q', text: 'x'.repeat(501) }])).toBe(false);
    expect(bad(Array.from({ length: BROWSER_MAX_STEPS + 1 }, () => ({ op: 'goto', url: 'https://example.com' })))).toBe(false);
    expect(bad([{ op: 'goto', url: 'https://example.com' }, ...Array.from({ length: BROWSER_MAX_SHOTS + 1 }, () => ({ op: 'screenshot' }))])).toBe(false);
  });

  it('keeps a screenshot name a safe file name', () => {
    const r = checkBrowserTask({ steps: [{ op: 'goto', url: 'https://example.com' }, { op: 'screenshot', name: '../../etc/x' }] });
    expect(r.ok && r.plan.steps[1]).toEqual({ op: 'screenshot', name: 'shot-1' });
  });
});
