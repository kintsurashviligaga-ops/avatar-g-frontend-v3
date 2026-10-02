/**
 * The studio screen against a scripted server. What is under test is the money path as a user meets it:
 * no price → no spend; the price on the button is the price sent; a changed price waits for another tap; a
 * large one asks twice; a short balance goes to top-up; a lost start is never re-sent.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MODELS, publicModel } from '@/lib/providers/registry';

let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../../lib/supabase/browser', () => ({
  createBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));
let mockBalance = 500;
jest.mock('../../../store/useCreditsBalance', () => ({ useCreditsBalance: { getState: () => ({ get: async () => mockBalance }) } }));
const mockUpload = jest.fn(async () => 'omni-uploads/user-1/1.jpg');
jest.mock('../ui/useUpload', () => ({
  useUpload: () => ({ upload: mockUpload, busy: false, error: null, clearError: () => undefined }),
}));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { StudioV2 } from './StudioV2';

type Reply = { status: number; body?: unknown } | Error;
type Route = (url: string, init?: RequestInit) => Reply | undefined;

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const models = MODELS.map(publicModel);
const PRICE = { credits: 13, gel: 1.3, display: '1.30 ₾' };
const job = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111', status: 'queued', service: 'video', modelId: 'hf/kling-3-std-t2v', priceGel: 1.3, credits: 13,
  refunded: false, errorCode: null, promptOriginal: 'ზღვა მზის ჩასვლისას', promptSent: null, outputUrls: [], createdAt: '2026-09-29T10:00:00Z', completedAt: null,
  ...over,
});

/** A request body as the route reads it (JSON) — only the fields the tests look at are typed. */
type SentBody = { modelId?: string; confirmedGel?: number; params?: Record<string, unknown> } & Record<string, unknown>;
let calls: Array<{ url: string; method: string; body: SentBody | undefined }>;
let route: Route;

function install(extra: Route = () => undefined) {
  calls = [];
  route = extra;
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = String(init?.method ?? 'GET');
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = route(url, init) ?? (url.startsWith('/api/studio/models') ? { status: 200, body: { models } }
      : url.startsWith('/api/generate?') ? { status: 200, body: { jobs: [] } }
      : url === '/api/estimate' ? { status: 200, body: { modelId: 'x', price: PRICE } }
      : url === '/api/generate' && method === 'POST' ? { status: 202, body: { job: job(), price: PRICE } }
      : url.startsWith('/api/generate/') ? { status: 200, body: { job: job({ status: 'in_progress' }) } }
      : { status: 404, body: {} });
    if (r instanceof Error) throw r;
    return json(r.status, r.body) as unknown as Response;
  });
}

const posts = () => calls.filter((c) => c.url === '/api/generate' && c.method === 'POST');
const estimates = () => calls.filter((c) => c.url === '/api/estimate');
const button = () => screen.getByTestId('studio-generate');
const typePrompt = (text: string) => fireEvent.change(screen.getByLabelText('აღწერა'), { target: { value: text } });

beforeEach(() => {
  mockUser = { id: 'user-1' };
  mockBalance = 500;
  mockUpload.mockClear();
  try { localStorage.clear(); } catch { /* jsdom */ }
  install();
});

test('a guest sees the studio but is asked to sign in — and nothing is priced on their behalf', async () => {
  mockUser = null;
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(button()).toHaveTextContent('შედი და შექმენი'));
  typePrompt('ზღვა');
  await new Promise((r) => setTimeout(r, 600));
  expect(estimates()).toHaveLength(0);
  const heard = jest.fn();
  window.addEventListener('myavatar:auth-required', heard);
  fireEvent.click(button());
  expect(heard).toHaveBeenCalled();
  window.removeEventListener('myavatar:auth-required', heard);
});

test('the price goes on the button, and the tap sends exactly that price', async () => {
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByLabelText('აღწერა')).toBeInTheDocument());
  typePrompt('ზღვა მზის ჩასვლისას');
  await waitFor(() => expect(button()).toHaveTextContent('გენერაცია · 1.30 ₾'));
  expect(estimates()[0]!.body).toEqual({ modelId: 'hf/kling-3-std-t2v', params: { prompt: 'ზღვა მზის ჩასვლისას', duration: 5, aspect_ratio: '16:9', sound: 'on' } });

  await act(async () => { fireEvent.click(button()); });
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0]!.body).toMatchObject({ modelId: 'hf/kling-3-std-t2v', confirmedGel: 1.3, promptOriginal: 'ზღვა მზის ჩასვლისას' });
  expect(await screen.findByText('ზღვა მზის ჩასვლისას', { selector: 'p' })).toBeInTheDocument();
});

test('typing more words does not re-price (the words do not change the price)', async () => {
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByLabelText('აღწერა')).toBeInTheDocument());
  typePrompt('ზღვა');
  await waitFor(() => expect(button()).toHaveTextContent('1.30 ₾'));
  typePrompt('ზღვა და მთები');
  await new Promise((r) => setTimeout(r, 700));
  expect(estimates()).toHaveLength(1);
});

test('a changed price is shown and waits for another tap — never accepted on the user’s behalf', async () => {
  install((url, init) => (url === '/api/generate' && init?.method === 'POST' && posts().length === 1
    ? { status: 409, body: { error: 'price_changed', price: { credits: 16, gel: 1.6, display: '1.60 ₾' } } }
    : undefined));
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByLabelText('აღწერა')).toBeInTheDocument());
  typePrompt('ზღვა');
  await waitFor(() => expect(button()).toHaveTextContent('1.30 ₾'));
  await act(async () => { fireEvent.click(button()); });
  await waitFor(() => expect(button()).toHaveTextContent('გენერაცია · 1.60 ₾'));
  expect(screen.getByText(/ფასი შეიცვალა/)).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 300));
  expect(posts()).toHaveLength(1); // nothing re-sent by itself
  await act(async () => { fireEvent.click(button()); });
  await waitFor(() => expect(posts()).toHaveLength(2));
  expect(posts()[1]!.body!.confirmedGel).toBe(1.6);
});

test('above 10 ₾ the dock asks once more before spending', async () => {
  install((url) => (url === '/api/estimate' ? { status: 200, body: { price: { credits: 124, gel: 12.4, display: '12.40 ₾' } } } : undefined));
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByLabelText('აღწერა')).toBeInTheDocument());
  typePrompt('ზღვა');
  await waitFor(() => expect(button()).toHaveTextContent('12.40 ₾'));
  fireEvent.click(button());
  expect(await screen.findByText('დიახ, დაიწყე')).toBeInTheDocument();
  expect(posts()).toHaveLength(0);
  await act(async () => { fireEvent.click(screen.getByText('დიახ, დაიწყე')); });
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0]!.body!.confirmedGel).toBe(12.4);
});

test('a balance below the price goes to top-up instead of spending', async () => {
  mockBalance = 5; // credits; the price is 13
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByLabelText('აღწერა')).toBeInTheDocument());
  typePrompt('ზღვა');
  await waitFor(() => expect(button()).toHaveTextContent('ბალანსის შევსება · 1.30 ₾'));
  const heard = jest.fn();
  window.addEventListener('myavatar:open-credits', heard);
  fireEvent.click(button());
  expect(heard).toHaveBeenCalled();
  window.removeEventListener('myavatar:open-credits', heard);
  expect(posts()).toHaveLength(0);
});

test('a start whose answer is lost is NEVER re-sent; the job list is re-read instead', async () => {
  install((url, init) => (url === '/api/generate' && init?.method === 'POST' ? new TypeError('network') : undefined));
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByLabelText('აღწერა')).toBeInTheDocument());
  typePrompt('ზღვა');
  await waitFor(() => expect(button()).toHaveTextContent('1.30 ₾'));
  await act(async () => { fireEvent.click(button()); });
  expect(await screen.findByText(/ხელახლა ნუ დააჭერ/)).toBeInTheDocument();
  const listReads = calls.filter((c) => c.url.startsWith('/api/generate?')).length;
  await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/generate?')).length).toBeGreaterThan(listReads), { timeout: 6000 });
  expect(posts()).toHaveLength(1);
}, 10_000);

test('image→video waits for its first frame; the uploaded PATH is what gets priced', async () => {
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByLabelText('აღწერა')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Kling 3').closest('button')!);
  const sheet = await screen.findByRole('dialog');
  fireEvent.click(within(sheet).getByText('Kling 3 — ფოტოს გაცოცხლება'));
  typePrompt('ცოცხლდება');
  expect(await screen.findByText('დაამატე ფოტო')).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 600));
  expect(estimates()).toHaveLength(0);

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
  (global as unknown as { URL: { createObjectURL: () => string } }).URL.createObjectURL = () => 'blob:preview';
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  await waitFor(() => expect(estimates()).toHaveLength(1));
  expect(estimates()[0]!.body!.params).toMatchObject({ image_url: 'omni-uploads/user-1/1.jpg', prompt: 'ცოცხლდება' });
});

test('music, voice and avatar open the flows that already work, with no dock and no spend', async () => {
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByLabelText('აღწერა')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /მუსიკა/ }));
  expect(screen.getByRole('link', { name: /მუსიკის გახსნა/ })).toHaveAttribute('href', '/ka/dashboard?mode=music');
  expect(screen.queryByTestId('studio-generate')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^ხმა$/ }));
  expect(screen.getByRole('link', { name: /ხმის ჩართვა/ })).toHaveAttribute('href', '/ka/dashboard?voice=1');
});

test('the job list survives a reload: results play, failures say why and that the money came back', async () => {
  install((url) => (url.startsWith('/api/generate?') ? { status: 200, body: { jobs: [
    job({ id: 'a1111111-1111-4111-8111-111111111111', status: 'completed', outputUrls: ['https://storage.example/v.mp4'] }),
    job({ id: 'b1111111-1111-4111-8111-111111111111', status: 'failed', errorCode: 'generation_failed', refunded: true, promptOriginal: 'მეორე' }),
  ] } } : undefined));
  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
  expect(document.querySelector('video')!.getAttribute('src')).toBe('https://storage.example/v.mp4');
  expect(screen.getByRole('link', { name: /ჩამოტვირთვა/ })).toHaveAttribute('href', 'https://storage.example/v.mp4');
  const alert = screen.getByRole('alert');
  expect(alert.textContent!.match(/თანხა დაგიბრუნდა/g)).toHaveLength(1); // said once, not twice
});

test('the model is chosen in the studio\'s ModelPicker: what this deployment enabled is open, the rest says why — and the pick survives a reload', async () => {
  const enabled = models.filter((m) => m.id === 'hf/kling-3-std-t2v' || m.id === 'hf/seedance-2.5-t2v');
  install((url) => (url.startsWith('/api/studio/models') ? { status: 200, body: { models: enabled } } : undefined));
  const first = render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByLabelText('აღწერა')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /^Kling 3/ }));
  const sheet = screen.getByRole('dialog', { name: 'მოდელი' });
  const rows = within(sheet).getAllByRole('radio');
  // Only Studio β's own rows (no Veo here), the enabled ones first.
  expect(rows.every((r) => r.getAttribute('data-model')!.startsWith('hf/'))).toBe(true);
  expect(rows.filter((r) => r.getAttribute('aria-disabled') !== 'true').map((r) => r.getAttribute('data-model'))).toEqual(['hf/kling-3-std-t2v', 'hf/seedance-2.5-t2v']);
  const pro = rows.find((r) => r.getAttribute('data-model') === 'hf/kling-3-pro-t2v')!;
  expect(pro.getAttribute('aria-disabled')).toBe('true');
  expect(pro.textContent).toContain('ჯერ არ არის ჩართული');
  expect(sheet.textContent).not.toMatch(/₾|კრედიტ/); // no price in the picker — it is on the button
  fireEvent.click(rows.find((r) => r.getAttribute('data-model') === 'hf/seedance-2.5-t2v')!);
  expect(screen.queryByRole('dialog', { name: 'მოდელი' })).toBeNull();
  expect(localStorage.getItem('myavatar:studio:model:video')).toBe('hf/seedance-2.5-t2v');
  first.unmount();

  render(<StudioV2 locale="ka" />);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Seedance 2\.5/ })).toBeInTheDocument());
});
