/** @jest-environment node */
jest.mock('server-only', () => ({}));
// Cut the Supabase import chain (ESM in node_modules) — URL parsing is pure.
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => { throw new Error('no client in test'); } }));

import { parseSupabaseObjectUrl } from './storage-adapter';

describe('parseSupabaseObjectUrl', () => {
  test('parses a public object URL', () => {
    const r = parseSupabaseObjectUrl('https://abc.supabase.co/storage/v1/object/public/media/clips/1.mp4');
    expect(r).toEqual({ bucket: 'media', path: 'clips/1.mp4' });
  });

  test('parses a signed object URL (drops token)', () => {
    const r = parseSupabaseObjectUrl('https://abc.supabase.co/storage/v1/object/sign/renders/a/b.mp4?token=xyz');
    expect(r).toEqual({ bucket: 'renders', path: 'a/b.mp4' });
  });

  test('returns null for external provider URLs', () => {
    expect(parseSupabaseObjectUrl('https://replicate.delivery/abc/out.mp4')).toBeNull();
    expect(parseSupabaseObjectUrl('https://files.heygen.ai/x.mp4')).toBeNull();
  });

  test('returns null for malformed input', () => {
    expect(parseSupabaseObjectUrl('not a url')).toBeNull();
    expect(parseSupabaseObjectUrl('https://abc.supabase.co/other/path')).toBeNull();
  });
});
