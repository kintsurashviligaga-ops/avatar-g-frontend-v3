/** @jest-environment jsdom */
/**
 * The Music Studio card in the Agent G thread, against a faked /api/music/studio (no provider, no ledger): the price on
 * the button is the quoted price; nothing starts without the tap; the job's stage is a sentence, never a percent;
 * Cancel; the delivered track plays and downloads; an edit becomes a new version; refusals speak the user's language.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MusicStudioCard, type MusicDraft } from './MusicStudioCard';
import { musicCardCopy, stageText, COPY_LANGS } from './musicCardCopy';
import { musicDraftFromPanel } from './musicDraft';
import { MusicRequestSchema } from '@/lib/music/studio/contracts';

const DRAFT: MusicDraft = musicDraftFromPanel({ prompt: 'calm cello over rain', genre: 'cinematic, ambient', tempo: 'slow', instrumental: true, voiceType: 'auto', lyrics: '' }, 'en');

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown };
let handler: Handler;
const calls: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
    const r = handler(u, init);
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body } as unknown as Response;
  }) as unknown as typeof fetch;
});

const QUOTE = { ok: true, jobId: 'job-1', credits: 5, expiresAt: Date.now() + 1e6, plan: { v: 1 }, token: 'tok', summary: { model: 'lyria-3-clip-preview', transport: 'vertex', durationSec: 30, exactDuration: false, directions: [] }, providerInput: 'x' };
const view = (status: string, extra: Record<string, unknown> = {}) => ({ ok: true, jobId: 'job-1', status, stage: status === 'running' ? 'generating' : status, attempt: 1, error: null, settlementPending: false, cancellable: status === 'queued' || status === 'running', result: null, ...extra });

test('the panel draft passes the server contract (labels cleaned, the model length)', () => {
  expect(MusicRequestSchema.safeParse(DRAFT.request).success).toBe(true);
  expect(DRAFT.request).toMatchObject({ mode: 'instrumental', genre: 'cinematic ambient', durationSec: 30, modelId: 'lyria-3-clip-preview', locale: 'en' });
});

test('quote → the button says the quoted credits → nothing starts until the tap → stage text, no percent → delivered', async () => {
  let status = 'running';
  handler = (u) => {
    if (u.endsWith('/quote')) return { body: QUOTE };
    if (u.endsWith('/jobs')) return { status: 202, body: view('queued') };
    return { body: status === 'completed' ? view('completed', { result: { url: 'https://x/s.mp3', durationSec: 30.8, mime: 'audio/mpeg', modelId: 'lyria-3-clip-preview', credits: 5 } }) : view('running') };
  };
  render(<MusicStudioCard draft={DRAFT} locale="en" />);
  const button = await screen.findByRole('button', { name: /5 credits will be charged/ });
  expect(button).toHaveTextContent('Create · 5 credits');
  expect(calls.some((c) => c.url.endsWith('/jobs'))).toBe(false); // nothing started yet
  await act(async () => { fireEvent.click(button); });
  expect(calls.find((c) => c.url.endsWith('/jobs'))?.body).toEqual({ plan: QUOTE.plan, token: 'tok', confirmed: true });
  expect(localStorage.getItem(`music-studio:job:${DRAFT.id}`)).toBe('job-1'); // recoverable after a reload
  await screen.findByText('Queued…');
  await screen.findByText('Lyria is composing…', undefined, { timeout: 5000 });
  expect(document.body.textContent).not.toMatch(/\d+\s?%/);
  status = 'completed';
  await waitFor(() => expect(document.querySelector('audio')).toHaveAttribute('src', 'https://x/s.mp3'), { timeout: 8000 });
  expect(screen.getByText('31 s · 5 credits · lyria-3-clip-preview')).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /Download/ })[0]).toHaveAttribute('download');
}, 15000);

test('a reload follows the remembered job instead of quoting again; Cancel stops it', async () => {
  localStorage.setItem(`music-studio:job:${DRAFT.id}`, 'job-1');
  let cancelled = false;
  handler = (u) => {
    if (u.endsWith('/cancel')) { cancelled = true; return { body: view('cancelled', { error: 'cancelled' }) }; }
    return { body: cancelled ? view('cancelled', { error: 'cancelled' }) : view('running') };
  };
  render(<MusicStudioCard draft={DRAFT} locale="en" />);
  const cancel = await screen.findByRole('button', { name: /Cancel/ });
  expect(calls.some((c) => c.url.endsWith('/quote'))).toBe(false);
  await act(async () => { fireEvent.click(cancel); });
  await screen.findByText(/Cancelled\. The reserved credits were returned\./);
});

test('a refusal (vocals unverified) shows the server sentence and offers no button', async () => {
  handler = () => ({ status: 400, body: { ok: false, code: 'unsupported', message: 'ეს შესაძლებლობა ამ მოდელზე ჯერ დადასტურებული არ არის. თანხა არ ჩამოგეჭრა.' } });
  render(<MusicStudioCard draft={{ ...DRAFT, request: { ...DRAFT.request, mode: 'song' } }} locale="ka" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('თანხა არ ჩამოგეჭრა');
  expect(screen.queryByRole('button')).toBeNull();
});

test('an edit command becomes a NEW version; an unsupported ask is said plainly', async () => {
  localStorage.setItem(`music-studio:job:${DRAFT.id}`, 'job-1');
  let command: unknown = { kind: 'edit', ops: [{ op: 'fade_out', sec: 3 }], format: 'wav' };
  handler = (u) => {
    if (u.endsWith('/commands')) return { body: { ok: true, command } };
    if (u.endsWith('/edit')) return { body: { ok: true, jobId: 'job-2', url: 'https://x/e.wav', durationSec: 30.8, format: 'wav', label: 'fade_out → wav', credits: 0 } };
    return { body: view('completed', { result: { url: 'https://x/s.mp3', durationSec: 30.8, mime: 'audio/mpeg', modelId: 'lyria-3-clip-preview', credits: 5 } }) };
  };
  render(<MusicStudioCard draft={DRAFT} locale="en" />);
  const input = await screen.findByLabelText('Edit command');
  fireEvent.change(input, { target: { value: 'fade out 3s as wav' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Apply/ })); });
  await screen.findByText('New version: fade_out → wav · 31 s');
  expect(calls.find((c) => c.url.endsWith('/edit'))?.body).toEqual({ v: 1, sources: ['job-1'], ops: [{ op: 'fade_out', sec: 3 }], format: 'wav', locale: 'en' });
  expect(document.querySelectorAll('audio')).toHaveLength(2); // the original stays
  command = { kind: 'unsupported', op: 'stem_separation' };
  fireEvent.change(input, { target: { value: 'split the stems' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Apply/ })); });
  await screen.findByText(/not available in Music Studio yet/);
});

test('every sentence exists in ka / en / ru, and every stage has a sentence', () => {
  const keys = Object.keys(musicCardCopy('ka')).sort();
  for (const l of COPY_LANGS) expect(Object.keys(musicCardCopy(l)).sort()).toEqual(keys);
  for (const st of ['queued', 'reserving', 'starting', 'retrying', 'generating', 'quality_checking']) {
    const t = ['ka', 'en', 'ru'].map((l) => stageText(st, l));
    expect(new Set(t).size).toBe(3);
  }
});
