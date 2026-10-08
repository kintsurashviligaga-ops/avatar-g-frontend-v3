/**
 * HiggsfieldGenerate — a Higgsfield pick in the Image / Video panel runs through the studio saga. Pinned: the request is the
 * model's own params (the panel's shape / length / size mapped, clamped where the model cannot render the panel's value, and
 * said); the price on the button is the server's estimate and the tap sends exactly it as `confirmedGel`; a changed price waits
 * for another tap; a guest is sent to sign-in before anything is asked; a model this deployment did not enable is never a live
 * button; the panel's pictures are uploaded once and reach the model on its own media key.
 *
 * ⚠️ v32 (lib/providers/policy) retired Higgsfield: the catalogue has no Higgsfield row any more, so no panel mounts this
 * button (components/studio/create/imageCreate.test.tsx pins that) and /api/estimate + /api/generate refuse every model
 * (lib/studio/saga.test.ts). The component is exercised here against a faked server only; with no catalogue row its
 * summary names the model by its id.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MODELS, publicModel } from '@/lib/providers/registry';
import { catalogueEntry } from '@/lib/providers/catalogue';
import { HiggsfieldGenerate, type HiggsfieldGenerateProps } from './HiggsfieldGenerate';
import { __resetStudioModelsCache } from './useStudioModels';

import { uploadFileToStorage } from '../ui/useUpload';

jest.mock('../ui/useUpload', () => ({
  uploadFileToStorage: jest.fn(async () => ({ path: 'omni-uploads/user-1/ref-1.jpg' })),
}));

const PUBLIC = MODELS.map(publicModel);
const PRICE = { credits: 13, gel: 1.3, display: '1.30 ₾' };
const JOB = {
  id: '11111111-1111-4111-8111-111111111111', status: 'queued', service: 'image', modelId: 'hf/soul-2', priceGel: 1.3, credits: 13,
  refunded: false, errorCode: null, promptOriginal: 'a lighthouse', promptSent: null, outputUrls: [], createdAt: '2026-10-02T10:00:00Z', completedAt: null,
};

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[];
let enabled: string[];
let nextGenerate: { status: number; body: unknown } | null;

function install() {
  calls = [];
  nextGenerate = null;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = String(init?.method ?? 'GET');
    if (url.startsWith('data:')) return { ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) } as unknown as Response;
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
    if (url.startsWith('/api/studio/models')) {
      const service = new URL(url, 'https://x').searchParams.get('service');
      return reply(200, { models: PUBLIC.filter((m) => m.service === service && enabled.includes(m.id)) });
    }
    if (url === '/api/estimate') return reply(200, { modelId: 'x', price: PRICE });
    if (url === '/api/generate' && method === 'POST') {
      if (nextGenerate) { const r = nextGenerate; nextGenerate = null; return reply(r.status, r.body); }
      return reply(202, { job: JOB, price: PRICE });
    }
    if (url.startsWith('/api/generate/')) return reply(200, { job: { ...JOB, status: 'completed', outputUrls: ['https://cdn.example.com/out.png'] } });
    return reply(404, {});
  }) as unknown as typeof fetch;
}

const realFetch = global.fetch;
beforeEach(() => {
  __resetStudioModelsCache();
  enabled = MODELS.map((m) => m.id);
  document.documentElement.dataset.authed = '1';
  (uploadFileToStorage as jest.Mock).mockClear();
  install();
});
afterEach(() => { global.fetch = realFetch; delete document.documentElement.dataset.authed; });

function show(over: Partial<HiggsfieldGenerateProps> = {}) {
  const p: HiggsfieldGenerateProps = {
    locale: 'en', modelId: 'hf/soul-2', service: 'image', label: 'Generate', prompt: 'a lighthouse',
    hints: { aspect: '9:16', quality: 'standard' }, images: [], balanceCredits: 100, onTopUp: jest.fn(), onNeedPrompt: jest.fn(), ...over,
  };
  return { p, ...render(<HiggsfieldGenerate {...p} />) };
}

const button = () => screen.getByTestId('create-generate') as HTMLButtonElement;
const estimates = () => calls.filter((c) => c.url === '/api/estimate');
const starts = () => calls.filter((c) => c.url === '/api/generate' && c.method === 'POST');

test('the request is the model\'s own params — the panel\'s shape and size mapped onto SOUL V2 — and the price is the server\'s', async () => {
  show();
  await waitFor(() => expect(button().getAttribute('data-price')).toBe('13'));
  expect(estimates()).toHaveLength(1);
  expect(estimates()[0]!.body).toEqual({ modelId: 'hf/soul-2', params: { prompt: 'a lighthouse', aspect_ratio: '9:16', resolution: '720p' } });
  expect(catalogueEntry('hf/soul-2')).toBeNull(); // v32: no catalogue row, so no display name — the id stands in
  expect(screen.getByTestId('hf-summary').textContent).toBe('hf/soul-2 · 9:16 · 720p');
});

test('the tap IS the confirmation: it sends the price on the button, then follows the job to its result', async () => {
  show();
  await waitFor(() => expect(button().getAttribute('data-price')).toBe('13'));
  await act(async () => { fireEvent.click(button()); });
  expect(starts()).toHaveLength(1);
  expect(starts()[0]!.body).toEqual({
    modelId: 'hf/soul-2', params: { prompt: 'a lighthouse', aspect_ratio: '9:16', resolution: '720p' }, confirmedGel: 1.3, promptOriginal: 'a lighthouse',
  });
  await waitFor(() => expect(screen.getByTestId('hf-job').getAttribute('data-status')).toBe('completed'), { timeout: 5000 });
  expect(screen.getByTestId('hf-job').textContent).toContain('Ready · saved to your Library');
  expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('https://cdn.example.com/out.png');
});

test('⚠️ a changed price is shown and WAITS for another tap — never accepted on the user\'s behalf', async () => {
  show();
  await waitFor(() => expect(button().getAttribute('data-price')).toBe('13'));
  nextGenerate = { status: 409, body: { error: 'price_changed', price: { credits: 16, gel: 1.6, display: '1.60 ₾' } } };
  await act(async () => { fireEvent.click(button()); });
  await waitFor(() => expect(button().getAttribute('data-price')).toBe('16'));
  expect(screen.getByRole('alert').textContent).toContain('The price changed');
  expect(starts()).toHaveLength(1); // no automatic second start
  await act(async () => { fireEvent.click(button()); });
  expect(starts()).toHaveLength(2);
  expect(starts()[1]!.body!.confirmedGel).toBe(1.6);
});

test('the balance cannot cover it: the tap opens the top-up, nothing starts', async () => {
  const { p } = show({ balanceCredits: 5 });
  await waitFor(() => expect(button().getAttribute('data-price')).toBe('13'));
  await act(async () => { fireEvent.click(button()); });
  expect(p.onTopUp).toHaveBeenCalledTimes(1);
  expect(starts()).toHaveLength(0);
});

test('a guest is sent to sign-in before anything is priced', async () => {
  document.documentElement.dataset.authed = '0';
  const heard = jest.fn();
  window.addEventListener('myavatar:auth-required', heard);
  show();
  await waitFor(() => expect(calls.some((c) => c.url.startsWith('/api/studio/models'))).toBe(true));
  await new Promise((r) => setTimeout(r, 600));
  expect(estimates()).toHaveLength(0);
  expect(button().textContent).toContain('Sign in to create');
  fireEvent.click(button());
  expect(heard).toHaveBeenCalled();
  window.removeEventListener('myavatar:auth-required', heard);
});

test('a model this deployment did not enable is never a live button, and says so', async () => {
  enabled = ['hf/kling-3-std-t2v'];
  show();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('unavailable right now'));
  expect(button().disabled).toBe(true);
  expect(estimates()).toHaveLength(0);
});

test('an empty prompt asks for it; nothing is priced without one', async () => {
  const { p } = show({ prompt: '' });
  await waitFor(() => expect(calls.some((c) => c.url.startsWith('/api/studio/models'))).toBe(true));
  await new Promise((r) => setTimeout(r, 600));
  expect(estimates()).toHaveLength(0);
  fireEvent.click(button());
  expect(p.onNeedPrompt).toHaveBeenCalled();
});

test('video: a length the model cannot render is CLAMPED and said; the panel\'s photo is uploaded once and goes in as the first frame', async () => {
  show({
    modelId: 'hf/kling-3-std-i2v', service: 'video', prompt: 'the sea moves',
    hints: { aspect: '9:16', seconds: 24, sound: false }, images: ['data:image/jpeg;base64,AAAA'],
  });
  await waitFor(() => expect(button().getAttribute('data-price')).toBe('13'));
  expect(uploadFileToStorage).toHaveBeenCalledTimes(1);
  // Kling image→video has no aspect_ratio (the photo decides), renders 3–15 s, and takes sound on/off.
  expect(estimates()[0]!.body).toEqual({
    modelId: 'hf/kling-3-std-i2v',
    params: { prompt: 'the sea moves', image_url: 'omni-uploads/user-1/ref-1.jpg', duration: 15, sound: 'off' },
  });
  expect(catalogueEntry('hf/kling-3-std-i2v')).toBeNull();
  expect(screen.getByTestId('hf-summary').textContent).toBe('hf/kling-3-std-i2v · 15 s · no sound');
});

test('video: a model that needs a photo says so on the button until the panel has one', async () => {
  show({ modelId: 'hf/kling-3-std-i2v', service: 'video', hints: { seconds: 8 }, images: [] });
  await waitFor(() => expect(button().textContent).toContain('Add a photo'));
  await new Promise((r) => setTimeout(r, 600));
  expect(estimates()).toHaveLength(0);
});
