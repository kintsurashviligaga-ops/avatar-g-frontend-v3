/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./engine', () => ({ deliverableUrl: jest.fn() }));
jest.mock('../orchestrator/storage-adapter', () => ({
  createSignedAssetUrl: jest.fn(),
  uploadBufferAndSign: jest.fn(),
}));

import { hostGcsVideo } from './deliver';
import { deliverableUrl } from './engine';
import { createSignedAssetUrl, uploadBufferAndSign } from '../orchestrator/storage-adapter';

const signedGcs = deliverableUrl as jest.MockedFunction<typeof deliverableUrl>;
const existing = createSignedAssetUrl as jest.MockedFunction<typeof createSignedAssetUrl>;
const upload = uploadBufferAndSign as jest.MockedFunction<typeof uploadBufferAndSign>;

const VIDEO = { kind: 'gcs' as const, gcsUri: 'gs://bucket/veo/s/0-ab/sample_0.mp4', mimeType: 'video/mp4' };
const PATH = 'veo/session/abcdef0123456789abcdef01.mp4';
const GCS_URL = 'https://storage.googleapis.com/bucket/veo/s/0-ab/sample_0.mp4?X-Goog-Signature=sig';

const clipResponse = (bytes: number, status = 200) =>
  new Response(new Uint8Array(bytes).fill(7), { status, headers: { 'content-length': String(bytes) } });

let fetchMock: jest.SpyInstance;
beforeEach(() => {
  jest.resetAllMocks();
  fetchMock = jest.spyOn(global, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

describe('hostGcsVideo — a Vertex clip the Library can keep playing', () => {
  it('re-signs an object already hosted at the path — no GCS read, no copy', async () => {
    existing.mockResolvedValue('https://x.supabase.co/sign/renders/veo/session/abc.mp4?token=t');
    await expect(hostGcsVideo(VIDEO, PATH)).resolves.toBe('https://x.supabase.co/sign/renders/veo/session/abc.mp4?token=t');
    expect(signedGcs).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('copies the clip once into Supabase at the fixed path and returns that 7-day link', async () => {
    existing.mockResolvedValue(null);
    signedGcs.mockResolvedValue(GCS_URL);
    fetchMock.mockResolvedValue(clipResponse(4_096));
    upload.mockResolvedValue('https://x.supabase.co/sign/renders/veo/session/new.mp4?token=t');
    await expect(hostGcsVideo(VIDEO, PATH)).resolves.toBe('https://x.supabase.co/sign/renders/veo/session/new.mp4?token=t');
    expect(signedGcs).toHaveBeenCalledWith(VIDEO, 604_800);
    expect(upload).toHaveBeenCalledWith('renders', PATH, expect.any(Buffer), 'video/mp4', 604_800);
    expect((upload.mock.calls[0]![2] as Buffer).byteLength).toBe(4_096);
  });

  it('falls back to the 7-day GCS link when the copy fails (a playable clip beats none)', async () => {
    existing.mockResolvedValue(null);
    signedGcs.mockResolvedValue(GCS_URL);
    fetchMock.mockResolvedValue(clipResponse(4_096));
    upload.mockResolvedValue(null);
    await expect(hostGcsVideo(VIDEO, PATH)).resolves.toBe(GCS_URL);
  });

  it('never copies an unreadable or undersized object', async () => {
    existing.mockResolvedValue(null);
    signedGcs.mockResolvedValue(GCS_URL);
    fetchMock.mockResolvedValueOnce(clipResponse(10, 200));
    await expect(hostGcsVideo(VIDEO, PATH)).resolves.toBe(GCS_URL);
    fetchMock.mockResolvedValueOnce(clipResponse(4_096, 403));
    await expect(hostGcsVideo(VIDEO, PATH)).resolves.toBe(GCS_URL);
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(hostGcsVideo(VIDEO, PATH)).resolves.toBe(GCS_URL);
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses a declared size over the cap without reading the body', async () => {
    existing.mockResolvedValue(null);
    signedGcs.mockResolvedValue(GCS_URL);
    fetchMock.mockResolvedValue(new Response('x', { status: 200, headers: { 'content-length': String(300 * 1024 * 1024) } }));
    await expect(hostGcsVideo(VIDEO, PATH)).resolves.toBe(GCS_URL);
    expect(upload).not.toHaveBeenCalled();
  });

  it('is null when the clip cannot be signed at all (never throws)', async () => {
    existing.mockResolvedValue(null);
    signedGcs.mockRejectedValue(new Error('sign failed'));
    await expect(hostGcsVideo(VIDEO, PATH)).resolves.toBeNull();
  });
});
