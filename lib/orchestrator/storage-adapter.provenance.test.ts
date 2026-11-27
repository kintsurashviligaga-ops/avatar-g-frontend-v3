/** @jest-environment node */
/**
 * EU AI Act Art. 50(2): an upload that carries `aiMark` gets IPTC/XMP "AI-generated" metadata written into the
 * file, but only with AI_PROVENANCE_META=1. Without the flag, or without `aiMark` (user uploads), the exact bytes go up.
 */
jest.mock('server-only', () => ({}));

const mockBodies: Buffer[] = [];
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => ({
    storage: {
      createBucket: async () => ({ error: { message: 'The resource already exists' } }),
      updateBucket: async () => ({ error: null }),
      from: (bucket: string) => ({
        upload: async (_path: string, b: Buffer) => { mockBodies.push(b); return { error: null }; },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://p.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t` }, error: null }),
      }),
    },
  }),
}));

import { uploadAndSign, uploadBufferAndSign, __resetKnownBuckets } from './storage-adapter';
import { AI_GENERATED, DIGITAL_SOURCE_TYPE } from '../provenance/aiMarking';

function box(type: string, body: Buffer): Buffer {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(8 + body.length, 0);
  h.write(type, 4, 'latin1');
  return Buffer.concat([h, body]);
}
const MP4 = Buffer.concat([box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2', 'latin1')), box('moov', Buffer.alloc(16)), box('mdat', Buffer.alloc(32, 7))]);
const prev = process.env.AI_PROVENANCE_META;

beforeEach(() => {
  mockBodies.length = 0;
  __resetKnownBuckets();
  delete process.env.AI_PROVENANCE_META;
});
afterAll(() => {
  if (prev === undefined) delete process.env.AI_PROVENANCE_META;
  else process.env.AI_PROVENANCE_META = prev;
});

test('flag off: a marked upload goes up byte-for-byte unchanged', async () => {
  await uploadBufferAndSign('renders', 'v/a.mp4', MP4, 'video/mp4', 60, { aiMark: AI_GENERATED });
  expect(mockBodies[0]!.equals(MP4)).toBe(true);
});

test('flag on: a generated MP4 gets the XMP box, from a Buffer and from base64', async () => {
  process.env.AI_PROVENANCE_META = '1';
  await uploadBufferAndSign('renders', 'v/a.mp4', MP4, 'video/mp4', 60, { aiMark: AI_GENERATED });
  await uploadAndSign('renders', 'v/b.mp4', MP4.toString('base64'), 'video/mp4', 60, { aiMark: AI_GENERATED });
  for (const b of mockBodies) {
    expect(b.subarray(0, MP4.length).equals(MP4)).toBe(true);
    expect(b.toString('utf8')).toContain(DIGITAL_SOURCE_TYPE.generated);
  }
});

test('flag on: an upload with no aiMark (a user upload) is never labelled', async () => {
  process.env.AI_PROVENANCE_META = '1';
  await uploadBufferAndSign('uploads', 'u/mine.mp4', MP4, 'video/mp4');
  await uploadAndSign('uploads', 'u/mine2.mp4', MP4.toString('base64'), 'video/mp4');
  for (const b of mockBodies) expect(b.equals(MP4)).toBe(true);
});
