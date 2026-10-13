import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageWorkspace } from './ImageWorkspace';
import { uploadFileToStorage } from '../ui/useUpload';
import type { ImageAccess, ClientQuote, ClientJob } from '@/lib/image/studio/client';

jest.mock('next/image', () => ({ __esModule: true, default: (props: Record<string, unknown>) => {
  const { unoptimized: _u, ...rest } = props;
  // Test host only; the application uses next/image.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...rest} />;
} }));
jest.mock('../ui/useUpload', () => ({ uploadFileToStorage: jest.fn(), uploadErrorText: () => 'Upload failed' }));
const access: ImageAccess = { userId: 'ui-owner', models: [{ id: 'gemini-3.1-flash-image', operations: ['generate', 'edit', 'character_variation', 'product_scene'],
  aspects: ['1:1', '9:16'], resolutions: ['1K', '2K', '4K'] }] };
const request = () => ({ v: 1 as const, operation: 'generate' as const, originalPrompt: '  თბილისი ღამით\n  ', instructions: [], references: [],
  modelId: access.models[0]!.id, aspectRatio: '1:1' as const, resolution: '1K' as const, count: 1, locale: 'ka' as const });
const quote = (id = 'job-1'): ClientQuote => ({ jobId: id, credits: 2, expiresAt: Date.now() + 60000, token: id + '-signed',
  plan: { v: 1, kind: 'image-studio-v1', request: request(), references: [], transport: 'vertex' }, supplementaryInstructions: ['Requested image operation: generate.'] });
const job = (id: string, status: ClientJob['status'] = 'running'): ClientJob => ({
  jobId: id, status, stage: status === 'running' ? 'generating' : status, cancellable: status === 'running',
  settlementPending: false, result: null, error: null,
});
const mockFetch = jest.fn();
const response = (value: unknown) => ({ ok: true, json: async () => value });
beforeEach(() => {
  sessionStorage.clear(); jest.clearAllMocks();
  global.fetch = mockFetch;
  mockFetch.mockImplementation(async (url: string) => response(url.endsWith('/commands') ? quote() : job('job-1')));
});
afterEach(() => jest.useRealTimers());

test('quote has exact text and no start; rapid confirmation starts just one signed job', async () => {
  render(<ImageWorkspace access={access} locale="en" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Prompt / Agent G command'), { target: { value: request().originalPrompt } });
  fireEvent.click(screen.getByText('Review plan and price'));
  await screen.findByText('Confirm and start');
  expect(mockFetch.mock.calls).toHaveLength(1);
  expect(JSON.parse(mockFetch.mock.calls[0]![1].body).originalPrompt).toBe(request().originalPrompt);
  const confirm = screen.getByText('Confirm and start');
  fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(mockFetch.mock.calls.filter(([url]) => url === '/api/image/jobs')).toHaveLength(1));
  expect(await screen.findByText('1. Generating image')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  const start = mockFetch.mock.calls.find(([url]) => url === '/api/image/jobs')!;
  expect(JSON.parse(start[1].body)).toMatchObject({ token: 'job-1-signed', confirmed: true });
});

test('changing a reference role invalidates an unconfirmed quote', async () => {
  const ref = { id: 'source', role: 'subject', asset: { kind: 'upload', path: 'owner/photo.png' } };
  const q = quote();
  q.plan.request.references = [ref as never];
  q.plan.references = [{ id: ref.id, role: 'subject', digest: 'a'.repeat(64), width: 1024, height: 1024, mime: 'image/png', bytes: 100 }];
  sessionStorage.setItem('image-studio:v1:ui-owner', JSON.stringify([{ quote: q, issued: false }]));
  render(<ImageWorkspace access={access} locale="en" onClose={() => {}} />);
  expect(screen.getByText('Confirm and start')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Role 1'), { target: { value: 'product' } });
  expect(screen.queryByText('Confirm and start')).toBeNull();
});

test('refresh reads an existing job, never repeats start; a different account restores nothing', async () => {
  sessionStorage.setItem('image-studio:v1:ui-owner', JSON.stringify([{ quote: quote(), issued: true }]));
  const mounted = render(<ImageWorkspace access={access} locale="ka" onClose={() => {}} />);
  await screen.findByText('1. სურათი იქმნება');
  expect(mockFetch.mock.calls.every(([url]) => url.includes('/api/image/jobs/'))).toBe(true);
  mounted.unmount(); mockFetch.mockClear();
  render(<ImageWorkspace access={{ ...access, userId: 'stranger' }} locale="ru" onClose={() => {}} />);
  expect(screen.getByText('Студия изображений')).toBeTruthy();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('four variations use four fixed quotes sequentially; cancelling pauses remaining jobs', async () => {
  let n = 0;
  mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith('/commands')) return response(quote('job-' + (++n)));
    if (url === '/api/image/jobs') return response(job(JSON.parse(init.body as string).token.replace('-signed', '')));
    if (url.endsWith('/cancel')) return response(job('job-1', 'cancelled'));
    return response(job(url.split('/').pop()!));
  });
  render(<ImageWorkspace access={access} locale="en" initialPrompt="four images" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Variations'), { target: { value: '4' } });
  fireEvent.click(screen.getByText('Review plan and price'));
  await screen.findByText('4 × 2 = 8 credits');
  fireEvent.click(screen.getByText('Confirm and start'));
  await screen.findByText('Cancel');
  expect(mockFetch.mock.calls.filter(([url]) => url === '/api/image/jobs')).toHaveLength(1);
  fireEvent.click(screen.getByText('Cancel'));
  await screen.findByText('1. Cancelled');
  expect(mockFetch.mock.calls.filter(([url]) => url === '/api/image/jobs')).toHaveLength(1);
  expect(screen.getByText('Resume approved plan')).toBeTruthy();
});

test('a saved completed tile allows the next approved variation, without replaying the first', async () => {
  jest.useFakeTimers();
  let done = false;
  mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
    if (url === '/api/image/jobs') return response(job(JSON.parse(init.body as string).token.replace('-signed', '')));
    return response(job('job-1', done ? 'completed' : 'running'));
  });
  sessionStorage.setItem('image-studio:v1:ui-owner', JSON.stringify([{ quote: quote(), issued: true }, { quote: quote('job-2'), issued: false }]));
  render(<ImageWorkspace access={access} locale="en" onClose={() => {}} />);
  await act(async () => {});
  fireEvent.click(screen.getByText('Resume approved plan'));
  expect(mockFetch.mock.calls.filter(([url]) => url === '/api/image/jobs')).toHaveLength(0);
  done = true;
  await act(async () => { jest.advanceTimersByTime(3000); });
  await waitFor(() => expect(mockFetch.mock.calls.filter(([url]) => url === '/api/image/jobs')).toHaveLength(1));
  expect(JSON.parse(mockFetch.mock.calls.find(([url]) => url === '/api/image/jobs')![1].body).token).toBe('job-2-signed');
});

test('uploaded references retain identity, explicit roles and order in the quoted command', async () => {
  const upload = jest.mocked(uploadFileToStorage);
  upload.mockResolvedValueOnce({ path: 'ui-owner/subject.png' }).mockResolvedValueOnce({ path: 'ui-owner/style.png' });
  URL.createObjectURL = jest.fn(() => 'blob:fixture');
  URL.revokeObjectURL = jest.fn();
  render(<ImageWorkspace access={access} locale="en" initialPrompt="Use these two photos" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Add photo'), { target: { files: [
    new File(['subject'], 'subject.png', { type: 'image/png' }), new File(['style'], 'style.png', { type: 'image/png' }),
  ] } });
  await screen.findByLabelText('Role 2');
  fireEvent.change(screen.getByLabelText('Role 2'), { target: { value: 'style' } });
  fireEvent.click(screen.getByLabelText('Move up 2'));
  fireEvent.click(screen.getByText('Review plan and price'));
  await screen.findByText('Confirm and start');
  const body = JSON.parse(mockFetch.mock.calls.find(([url]) => url.endsWith('/commands'))![1].body);
  expect(body.references.map((r: { role: string; asset: { path: string } }) => [r.role, r.asset.path])).toEqual([
    ['style', 'ui-owner/style.png'], ['subject', 'ui-owner/subject.png'],
  ]);
  expect(new Set(body.references.map((r: { id: string }) => r.id)).size).toBe(2);
  expect(upload).toHaveBeenNthCalledWith(1, expect.any(File), { verifyKind: 'image' });
  expect(mockFetch.mock.calls.every(([url]) => url !== '/api/image/jobs')).toBe(true);
});

test('Library version reuse quotes an owned edit with its parent and preserves the source', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const sourceRequest = { ...request(), originalPrompt: 'Original product' };
  const source = { id, request: sourceRequest, image: { path: 'image-studio/ui-owner/' + id + '/result.png',
    url: 'https://private.test/source.png', width: 1024, height: 1024, bytes: 100, mime: 'image/png', digest: 'a'.repeat(64) } };
  mockFetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/studio/library')) return response({ items: [{ id, url: source.image.url, prompt: sourceRequest.originalPrompt }] });
    if (url.endsWith('/versions')) return response({ current: { id, parentJobId: null, status: 'completed', operation: 'generate',
      prompt: sourceRequest.originalPrompt }, ancestors: [], children: [], moreAncestors: false, moreChildren: false });
    if (url.startsWith('/api/image/assets/')) return response(source);
    return response(quote());
  });
  render(<ImageWorkspace access={access} locale="en" onClose={() => {}} />);
  fireEvent.click(screen.getByText('My images'));
  fireEvent.click(await screen.findByText('Original product'));
  fireEvent.click(await screen.findByText('Edit this version'));
  expect((screen.getByLabelText('Operation') as HTMLSelectElement).value).toBe('edit');
  fireEvent.change(screen.getByLabelText('Prompt / Agent G command'), { target: { value: '  Only change the background\n' } });
  fireEvent.click(screen.getByText('Review plan and price'));
  await screen.findByText('Confirm and start');
  const body = JSON.parse(mockFetch.mock.calls.find(([url]) => url.endsWith('/commands'))![1].body);
  expect(body).toMatchObject({ operation: 'edit', originalPrompt: '  Only change the background\n', parentJobId: id,
    references: [{ role: 'subject', asset: { kind: 'result', id } }] });
  expect(source.request.originalPrompt).toBe('Original product');
  expect(mockFetch.mock.calls.every(([url]) => url !== '/api/image/jobs')).toBe(true);
  expect(await screen.findByText('Version history')).toBeTruthy();
});
