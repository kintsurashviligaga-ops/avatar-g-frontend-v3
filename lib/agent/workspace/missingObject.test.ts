/**
 * @jest-environment node
 */
import { StorageClient } from '@supabase/storage-js';
import { isMissingObject } from './missingObject';

// GG 2026-11-07 07:39Z: „Storage did not answer" on the first browser plan. A missing object from download() is a
// StorageUnknownError ("{}", the Response in originalError), and it must read as "missing", not as storage failing.
const client = (status: number, body: unknown) => new StorageClient('https://x.supabase.co/storage/v1', {},
  (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch);

describe('isMissingObject', () => {
  test('a missing object, as the real storage-js reports it, is missing', async () => {
    const { error } = await client(400, { statusCode: '404', error: 'not_found', message: 'Object not found' }).from('workspaces').download('u/index.json');
    expect(error).toBeTruthy();
    expect(await isMissingObject(error)).toBe(true);
  });

  test('a missing bucket (the first write creates it) is missing', async () => {
    const { error } = await client(400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }).from('workspaces').download('u/index.json');
    expect(await isMissingObject(error)).toBe(true);
  });

  test('a real failure is not', async () => {
    const { error } = await client(500, { statusCode: '500', error: 'internal', message: 'boom' }).from('workspaces').download('u/index.json');
    expect(await isMissingObject(error)).toBe(false);
    const denied = await client(400, { statusCode: '403', error: 'Unauthorized', message: 'invalid signature' }).from('workspaces').download('u/x');
    expect(await isMissingObject(denied.error)).toBe(false);
    expect(await isMissingObject(null)).toBe(false);
  });
});
