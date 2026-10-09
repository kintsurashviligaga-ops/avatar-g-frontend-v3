/** @jest-environment node */
/**
 * lib/uploads/policy — images, video and audio up to 50 MB; and the bucket migration carries the same list and cap.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UPLOAD_MAX_BYTES,
  UPLOAD_MIME_ALLOWLIST,
  allowedUploadMime,
  baseMime,
  isAllowedUploadMime,
  storageContentType,
  uploadExtFor,
} from './policy';

describe('allowedUploadMime', () => {
  it.each([
    ['image/png', null, 'image/png'],
    ['video/quicktime', 'clip.mov', 'video/quicktime'],
    ['audio/webm;codecs=opus', null, 'audio/webm'],
    ['Audio/MPEG', null, 'audio/mpeg'],
    ['', 'IMG_0001.HEIC', 'image/heic'],
    ['', 'beach.mov', 'video/quicktime'],
    ['application/octet-stream', 'song.m4a', 'audio/mp4'],
  ])('%s (%s) → %s', (ct, name, want) => {
    expect(allowedUploadMime(ct, name)).toBe(want);
  });

  it.each([
    ['text/html', null],
    ['image/svg+xml', 'logo.svg'],
    ['application/javascript', 'x.js'],
    ['application/pdf', 'doc.pdf'],
    ['application/zip', 'a.zip'],
    ['', 'notes.txt'],
    ['application/octet-stream', 'payload.bin'],
    ['', null],
  ])('refuses %s (%s)', (ct, name) => {
    expect(allowedUploadMime(ct, name)).toBeNull();
  });

  it('a declared specific type is never overridden by the name (no html dressed up as .png)', () => {
    expect(allowedUploadMime('text/html', 'cat.png')).toBeNull();
  });
});

test('storageContentType only fills in a generic type, and never invents one', () => {
  expect(storageContentType('application/octet-stream', 'films/a.mp4')).toBe('video/mp4');
  expect(storageContentType('model/gltf-binary', 'm.glb')).toBe('model/gltf-binary');
  expect(storageContentType('application/zip', 'm.zip')).toBe('application/zip');
  expect(storageContentType('', 'x.unknown')).toBe('application/octet-stream');
  expect(baseMime(' Video/MP4 ; codecs="avc1"')).toBe('video/mp4');
  expect(isAllowedUploadMime('video/mp4; codecs=avc1')).toBe(true);
});

test('every allowlisted type has a stored extension', () => {
  for (const t of UPLOAD_MIME_ALLOWLIST) expect(uploadExtFor(t)).not.toBe('bin');
  expect(uploadExtFor('video/quicktime')).toBe('mov');
  expect(uploadExtFor('audio/mpeg')).toBe('mp3');
});

test('the uploads bucket migration carries exactly this list and the same 50 MB cap', () => {
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261008c_uploads_bucket_limits.sql'), 'utf8')
    .replace(/--[^\n]*/g, '');
  const insert = sql.slice(sql.indexOf('INSERT INTO storage.buckets'), sql.indexOf('ON CONFLICT (id) DO UPDATE'));
  const types = [...insert.matchAll(/'([a-z0-9.+-]+\/[a-z0-9.+-]+)'/g)].map((m) => m[1]);
  expect([...types].sort()).toEqual([...UPLOAD_MIME_ALLOWLIST].sort());
  expect(insert).toContain(`false, ${UPLOAD_MAX_BYTES},`);
  expect(UPLOAD_MAX_BYTES).toBe(52_428_800);
});
