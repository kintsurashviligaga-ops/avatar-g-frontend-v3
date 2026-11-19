/** @jest-environment node */
import { documentDownloadUrl, documentInfo, documentLinks, documentReadyText, requestDocument } from './client';

const reply = (status: number, body: unknown) => jest.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/renders/documents/u/a.pdf?token=t';

describe('requestDocument', () => {
  it('sends the words, the language and the material, with the session cookie', async () => {
    const f = reply(200, { ok: true, url: SIGNED, fileName: 'a.pdf', title: 'A', pages: 5, bytes: 2048 });
    const r = await requestDocument({ prompt: 'შემიქმენი PDF', locale: 'ka', source: 'ტექსტი' }, { fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, url: SIGNED, persisted: true, fileName: 'a.pdf', title: 'A', pages: 5, bytes: 2048 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/documents/create');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({ prompt: 'შემიქმენი PDF', locale: 'ka', source: 'ტექსტი' });
  });

  it.each([
    [401, {}, 'signed_out'],
    [429, {}, 'limit'],
    [502, { error: 'not_written', message: 'm' }, 'not_written'],
    [200, { ok: true, url: 'http://insecure', fileName: 'a.pdf', title: 'A', pages: 1, bytes: 1 }, 'not_written'],
    [200, { ok: true }, 'not_written'],
  ])('%s → %s', async (status, body, reason) => {
    const r = await requestDocument({ prompt: 'p', locale: 'ka' }, { fetchImpl: reply(status, body) as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason });
  });

  it('a dropped connection is said as such', async () => {
    const f = jest.fn(async () => { throw new TypeError('offline'); });
    expect(await requestDocument({ prompt: 'p', locale: 'ka' }, { fetchImpl: f as unknown as typeof fetch })).toEqual({ ok: false, reason: 'network' });
  });
});

describe('the card', () => {
  it('names pages and size in the chat language', () => {
    expect(documentInfo(5, 120 * 1024, 'ka')).toBe('5 გვერდი · 120 KB');
    expect(documentInfo(1, 3 * 1_048_576, 'en')).toBe('1 page · 3.0 MB');
    expect(documentInfo(2, 10, 'ru')).toBe('2 стр. · 1 KB');
  });

  it('asks Storage to send a signed file as an attachment, and leaves other links alone', () => {
    expect(new URL(documentDownloadUrl(SIGNED, 'ანგარიში.pdf')).searchParams.get('download')).toBe('ანგარიში.pdf');
    expect(new URL(documentDownloadUrl(SIGNED, 'a.pdf')).searchParams.get('token')).toBe('t');
    expect(documentDownloadUrl('blob:https://myavatar.ge/1', 'a.pdf')).toBe('blob:https://myavatar.ge/1');
  });

  it('opens a stored PDF through the route that signs a fresh link; a device-only copy by its own link', () => {
    const path = 'documents/u/2026-10-30-a.pdf';
    expect(documentLinks({ url: SIGNED, path, name: 'ა ბ.pdf' })).toEqual({
      open: '/api/documents/file?path=documents%2Fu%2F2026-10-30-a.pdf',
      download: '/api/documents/file?path=documents%2Fu%2F2026-10-30-a.pdf&download=1&name=%E1%83%90%20%E1%83%91.pdf',
    });
    expect(documentLinks({ url: 'blob:x', name: 'a.pdf' })).toEqual({ open: 'blob:x', download: 'blob:x' });
  });

  it('says when the copy lives on this device only', () => {
    const r = { ok: true as const, url: 'blob:x', persisted: false, fileName: 'a.pdf', title: 'ანგარიში', pages: 1, bytes: 1 };
    expect(documentReadyText(r, 'ka')).toBe('მზადაა: **ანგარიში**\n\nეს ასლი მხოლოდ ამ მოწყობილობაზეა: ჩამოტვირთე ახლავე.');
    expect(documentReadyText({ ...r, persisted: true }, 'en')).toBe('Ready: **ანგარიში**');
  });
});
