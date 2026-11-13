/** @jest-environment node */
/** App previews live on a separate registrable domain (GG 2026-11-13). */
import { checkPreviewDomain, previewHeaders, previewOrigin, registrableDomain } from './preview';

test('the preview domain must not share cookies with myavatar.ge', () => {
  for (const bad of [undefined, '', 'myavatar.ge', 'sandbox.myavatar.ge', 'a.b.MYAVATAR.GE', 'x.vercel.app', 'not a domain', 'http://apps.example']) {
    expect(checkPreviewDomain(bad)).toMatchObject({ ok: false });
  }
  expect(checkPreviewDomain('myavatar-apps.ge')).toEqual({ ok: true, domain: 'myavatar-apps.ge' });
  // GG 13:06Z: only myavatar-apps.ge. Another safe domain is still refused while it isn't the approved one.
  expect(checkPreviewDomain('preview.myavatarusercontent.com')).toMatchObject({ ok: false });
  expect(checkPreviewDomain('MyAvatar-Apps.ge ')).toEqual({ ok: true, domain: 'myavatar-apps.ge' });
  // the safety rules hold on their own, whatever domain gets approved
  expect(checkPreviewDomain('preview.myavatarusercontent.com', undefined, null)).toMatchObject({ ok: true });
  expect(checkPreviewDomain('sandbox.myavatar.ge', undefined, 'sandbox.myavatar.ge')).toMatchObject({ ok: false });
  expect(registrableDomain('a.b.example.com.ge')).toBe('example.com.ge');
});

test('one origin per app, and strict headers with no cookie', () => {
  expect(previewOrigin('app_abc123', 'myavatar-apps.ge')).toBe('https://app-abc123.myavatar-apps.ge');
  expect(previewOrigin('../x', 'myavatar-apps.ge')).toBeNull();
  const h = previewHeaders();
  expect(h['Content-Security-Policy']).toMatch(/frame-ancestors https:\/\/myavatar\.ge https:\/\/www\.myavatar\.ge(;|$)/);
  expect(h['Content-Security-Policy']).not.toMatch(/frame-ancestors[^;]*\*/);
  expect(h['Content-Security-Policy']).toMatch(/connect-src 'self'/);
  expect(Object.keys(h).map((k) => k.toLowerCase())).not.toContain('set-cookie');
});
