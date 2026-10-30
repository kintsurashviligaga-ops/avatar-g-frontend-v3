import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { mockStoredUpload, SIGNED_UPLOAD_URL } from './fixtures/uploads';
import { sendFilm, typeFilmPrompt, waitForClipCard } from './video-core/_shared';

/**
 * A CHAT OPENED FROM HISTORY ON ANOTHER DEVICE SHOWS ALL OF IT (the owner, 2026-10-11, on the computer, opening a chat
 * run on the iPhone: „the conversation does not show, nor the whole process that was done; nothing should be lost").
 * The account's copy kept the words only. Now a turn saves the files it sent, and an Agent G card is ONE row that follows
 * the card from its plan to its result (lib/chat/turnMeta, chat_messages.metadata). Every server route is mocked here:
 * nothing is uploaded, rendered or written anywhere.
 */

const SUPABASE_URL = (process.env.PLAYWRIGHT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co').replace(/\/$/, '');
const AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER = { id: '00000000-0000-4000-8000-0000000000d1', aud: 'authenticated', role: 'authenticated', email: 'e2e-devices@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
const SID = 'b47be053-48e5-41f6-93b8-0e43d995a699';
const ROW = 'c58cf164-59f6-4207-a4c9-1f54eaa6b7aa';
const ASK = 'cut these to the ad';
const MASTER = 'https://e2e-media.supabase.co/agent-montage.mp4';
const CLIP = readFileSync(join(__dirname, 'fixtures/clip.webm'));

const MANIFEST = [
  { index: 0, path: 'omni-uploads/u/file-1', name: 'beach.webm', kind: 'video', durationSec: 5 },
  { index: 1, path: 'omni-uploads/u/file-2', name: 'city.webm', kind: 'video', durationSec: 5 },
  { index: 2, path: 'omni-uploads/u/file-3', name: 'song.wav', kind: 'audio', durationSec: 6 },
];
const QUOTE = {
  jobId: '22222222-3333-4444-8555-666666666666', credits: 0, totalSec: 19.97, shots: 8, clips: 2, aspect: '16:9', beatSynced: true, bpm: 119.96,
  musicStartSec: 0.23, manifest: MANIFEST, clipOrder: [0, 1], engine: { id: 'ffmpeg-montage', label: 'FFmpeg montage', free: true },
  unusedFiles: [], expiresAt: Date.now() + 1_800_000,
};
const NAMES = ['beach.webm', 'city.webm', 'song.wav'];
const FILES = [
  { kind: 'video', name: 'beach.webm', size: 4096, durationSec: 5, path: 'omni-uploads/u/file-1' },
  { kind: 'video', name: 'city.webm', size: 4096, durationSec: 5, path: 'omni-uploads/u/file-2' },
  { kind: 'audio', name: 'song.wav', size: 96044, durationSec: 6, path: 'omni-uploads/u/file-3' },
];

const b64url = (s: string) => Buffer.from(s).toString('base64url');
function sessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b64url(JSON.stringify({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp })), 'e2e-signature'].join('.');
  return `base64-${b64url(JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'e2e-refresh', user: USER }))}`;
}

interface Writes { posts: Array<Record<string, unknown>>; patches: Array<{ id: string; body: Record<string, unknown> }> }
type Task = Record<string, unknown>;

/** Signed in, with the account's saved chats (`rows`, or none) and every montage route mocked; returns the writes. */
async function openSignedIn(page: Page, baseURL: string | undefined, rows: unknown[] | null, tasks: Task[], tool = 'chat'): Promise<Writes> {
  const writes: Writes = { posts: [], patches: [] };
  await page.context().addCookies([{ name: AUTH_COOKIE, value: sessionCookie(), url: baseURL ?? 'http://localhost:3000' }]);
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }));
  await page.route(`${SUPABASE_URL}/auth/v1/token**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', token_type: 'bearer', expires_in: 3600, refresh_token: 'y', user: USER }) }));
  await page.route(`${SUPABASE_URL}/rest/v1/**`, async (r: Route) => {
    const u = r.request().url();
    const method = r.request().method();
    if (u.includes('/chat_sessions')) {
      if (method === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows ? [{ session_id: SID, title: (rows[0] as { content?: string })?.content ?? ASK, updated_at: '2026-10-11T10:13:16Z', agent_id: 'agent-g' }] : []) });
      if (method === 'POST') return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ session_id: SID }) });
    }
    if (u.includes('/chat_messages')) {
      if (method === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows ?? []) });
      if (method === 'POST') { writes.posts.push(r.request().postDataJSON() as Record<string, unknown>); return r.fulfill({ status: 201, contentType: 'application/json', body: '' }); }
      if (method === 'PATCH') {
        writes.patches.push({ id: new URL(u).searchParams.get('id') ?? '', body: r.request().postDataJSON() as Record<string, unknown> });
        return r.fulfill({ status: 204, body: '' });
      }
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  let n = 0;
  await page.route('**/api/upload/sign', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bucket: 'uploads', path: `omni-uploads/u/file-${++n}`, token: 't', signedUrl: SIGNED_UPLOAD_URL }) }));
  await mockStoredUpload(page);
  await page.route('**/api/chat/title', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"t"}' }));
  const task = (t: Task) => ({ id: QUOTE.jobId, kind: 'agent-montage', service: 'film', stage: null, pct: null, attempt: null, result: null, error: null, cancellable: false, label: null, position: null, createdAt: null, updatedAt: null, ...t });
  const views = tasks.map(task);
  await page.route(/\/api\/tasks(\?.*)?$/, async (r: Route) => {
    const id = new URL(r.request().url()).searchParams.get('id');
    if (r.request().method() !== 'GET' || !id) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tasks: [] }) });
    const now = views.length > 1 ? views.shift() : views[0];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, task: now }) });
  });
  await page.route(/\/api\/agent\/media\/montage(\?.*)?$/, async (r: Route) => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    const body = r.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'quote') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, quote: QUOTE, request: { shots: ['signed plan'] }, token: 'signed-token' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: QUOTE.jobId, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false }) });
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar:welcomed', '1');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
    } catch { /* storage blocked */ }
  });
  await page.goto(`/en/dashboard?tool=${tool}`);
  await expect(page.locator('html[data-authed="1"]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 45_000 });
  return writes;
}

const DELIVERED = { status: 'completed', pct: 100, updatedAt: '2026-10-11T10:18:40Z', result: { url: MASTER, media: 'video', durationSec: 19.97, aspect: '16:9' } };
const savedTurns = (card: Record<string, unknown>, extra: Record<string, unknown> = {}) => [
  { id: 'd1e1a1b1-0000-4000-8000-000000000001', role: 'user', content: ASK, created_at: '2026-10-11T10:13:10Z', metadata: { v: 1, files: FILES } },
  { id: ROW, role: 'assistant', content: extra.content ?? 'Starting the edit…', created_at: '2026-10-11T10:13:16Z', metadata: { v: 1, id: 'agm-phone-1', montage: card, ...extra.meta as object } },
];

test.use({ viewport: { width: 1280, height: 800 } });
test.setTimeout(180_000);

test('a montage finished on the phone opens on the computer with its files, its card and the video', async ({ page, baseURL }) => {
  const done = { phase: 'done', stage: 'completed', quote: QUOTE, prompt: ASK, names: NAMES, t0: Date.now() - 400_000, t1: Date.now() - 60_000 };
  await openSignedIn(page, baseURL, savedTurns(done, { content: 'Ready: 20 s, cut to your track.', meta: { videoUrl: MASTER, orientation: 'landscape' } }), [DELIVERED]);
  await page.getByRole('button', { name: new RegExp(`^${ASK}`) }).first().click();

  const card = page.getByTestId('agent-montage-card');
  await expect(card).toHaveAttribute('data-phase', 'done', { timeout: 30_000 });
  await expect(page.locator(`video[src^="${MASTER}"]`)).toBeAttached();
  await expect(page.getByText('Ready: 20 s, cut to your track.')).toBeVisible();
  // The turn that asked lists what it sent, by name.
  for (const name of NAMES) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});

test('a montage still rendering on the phone: the computer follows its job, and its end is written to the same row', async ({ page, baseURL }) => {
  const running = { phase: 'running', quote: QUOTE, prompt: ASK, names: NAMES, t0: Date.now() - 30_000, pct: 40, stage: 'stitch' };
  const writes = await openSignedIn(page, baseURL, savedTurns(running), [{ status: 'running', stage: 'stitch', pct: 70, attempt: 1, cancellable: true }, DELIVERED]);
  await page.getByRole('button', { name: new RegExp(`^${ASK}`) }).first().click();

  const card = page.getByTestId('agent-montage-card');
  await expect(card).toHaveAttribute('data-phase', 'done', { timeout: 30_000 });
  await expect(page.locator(`video[src^="${MASTER}"]`)).toBeAttached();
  // No second row: the one the phone saved is rewritten with the end.
  await expect.poll(() => writes.patches.filter((p) => p.id === `eq.${ROW}`).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const last = writes.patches.filter((p) => p.id === `eq.${ROW}`).pop()!.body as { metadata: { montage: { phase: string }; videoUrl?: string } };
  expect(last.metadata.montage.phase).toBe('done');
  expect(last.metadata.videoUrl).toBe(MASTER);
  expect(writes.posts.filter((p) => (p.metadata as { id?: string } | undefined)?.id)).toHaveLength(0);
});

test('a montage run here is saved for the other devices: the files with the ask, the card as one row to its end', async ({ page, baseURL }) => {
  const writes = await openSignedIn(page, baseURL, null, [{ status: 'running', stage: 'stitch', pct: 55, attempt: 1, cancellable: true }, DELIVERED]);
  await page.locator('input[type=file][multiple][accept^="image/*,audio/*"][accept*="application/pdf"]').setInputFiles([
    { name: 'beach.webm', mimeType: 'video/webm', buffer: CLIP },
    { name: 'city.webm', mimeType: 'video/webm', buffer: CLIP },
    { name: 'song.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(96044) },
  ]);
  await expect(page.getByTitle('song.wav')).toBeVisible({ timeout: 10_000 });
  const box = page.getByTestId('composer-input');
  await box.fill('cut these to the music');
  // Plain Enter is a new line; the composer sends on its explicit shortcut (tests/video-core/_shared say).
  await box.press('Control+Enter');
  const card = page.getByTestId('agent-montage-card');
  await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });

  // The ask went up with its files' records; the card went up once, as its plan, under an id it chose.
  await expect.poll(() => writes.posts.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  const ask = writes.posts.find((p) => p.role === 'user')!;
  expect((ask.metadata as { files: Array<{ name: string }> }).files.map((f) => f.name)).toEqual(NAMES);
  const cardRow = writes.posts.find((p) => (p.metadata as { id?: string } | undefined)?.id)!;
  expect((cardRow.metadata as { montage: { phase: string } }).montage.phase).toBe('quoted');
  expect(cardRow.id).toMatch(/^[0-9a-f-]{36}$/);

  await page.getByTestId('agent-montage-start').click();
  await expect(page.locator(`video[src^="${MASTER}"]`)).toBeAttached({ timeout: 30_000 });
  await expect(card).toHaveAttribute('data-phase', 'done');
  // Running, then done: the same row each time, never a second one.
  await expect.poll(() => writes.patches.map((p) => (p.body.metadata as { montage: { phase: string } }).montage.phase), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['running', 'done']));
  expect(new Set(writes.patches.map((p) => p.id))).toEqual(new Set([`eq.${cardRow.id as string}`]));
  expect(writes.posts.filter((p) => (p.metadata as { id?: string } | undefined)?.id)).toHaveLength(1);
});

// ── A delivered clip (GG 2026-10-26 20:14Z „გაასწორე": a chat opened again showed no videos, though the Library had them) ──
// A clip is a bubble with no words and no card, so nothing saved it: the chat opened from History or on another device showed
// the question and nothing after it. It is now a row of its own; an Omni clip's job id rides with it, so „გააგრძელე" there
// continues THAT clip.

const HORSE = 'A boy rides a horse along the beach at dawn';
const OMNI_CLIP = 'https://e2e-media.supabase.co/renders/video-clip/e2e-omni/omni.mp4?token=signed';
const OMNI_JOB = 'e2e-omni-interaction-1::9:16::1761500000000::o8';
const clipTurns = () => [
  { id: 'd1e1a1b1-0000-4000-8000-0000000000c1', role: 'user', content: HORSE, created_at: '2026-10-26T20:00:00Z', metadata: null },
  { id: 'd1e1a1b1-0000-4000-8000-0000000000c2', role: 'assistant', content: '[video]', created_at: '2026-10-26T20:02:00Z', metadata: { v: 1, videoUrl: OMNI_CLIP, orientation: 'vertical', omniJob: OMNI_JOB } },
];

test('a clip made on the phone opens on the computer as its video, without a word, and is not saved a second time', async ({ page, baseURL }) => {
  const writes = await openSignedIn(page, baseURL, clipTurns(), [DELIVERED]);
  await page.getByRole('button', { name: new RegExp(`^${HORSE}`) }).first().click();

  await expect(page.locator(`video[src^="${OMNI_CLIP}"]`)).toBeAttached({ timeout: 30_000 });
  await expect(page.getByText(HORSE, { exact: true }).first()).toBeVisible();
  // The row's mark is for a voice call reading the thread, never shown in the bubble.
  await expect(page.getByText('[video]', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(1_500);
  expect(writes.posts.filter((p) => p.role === 'assistant')).toHaveLength(0);
  expect(writes.patches).toHaveLength(0);
});

test('„გააგრძელე" in a chat opened again continues ITS clip (the edit card on that clip), never a new clip', async ({ page, baseURL }) => {
  await openSignedIn(page, baseURL, clipTurns(), [DELIVERED]);
  const made: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/video\/(clip|omni-edit)$/.test(new URL(r.url()).pathname)) made.push(r.url()); });
  await page.getByRole('button', { name: new RegExp(`^${HORSE}`) }).first().click();
  await expect(page.locator(`video[src^="${OMNI_CLIP}"]`)).toBeAttached({ timeout: 30_000 });

  const box = page.getByTestId('composer-input');
  await box.fill('გააგრძელე, ცხენი ზღვაში შედის');
  await box.press('Control+Enter');
  const card = page.getByTestId('edit-card').last();
  await expect(card).toHaveAttribute('data-phase', 'ask', { timeout: 20_000 });
  await expect(card).toHaveAttribute('data-op', 'extend');
  await expect(card.getByTestId('edit-video')).toHaveAttribute('src', OMNI_CLIP);
  await expect(page.getByTestId('clip-card')).toHaveCount(0);
  expect(made).toEqual([]);
});

test('a clip made here is saved for the other devices: one row of its own with its link and its job id', async ({ page, baseURL }) => {
  const writes = await openSignedIn(page, baseURL, null, [DELIVERED], 'video');
  const clipBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/video/clip', async (r: Route) => {
    const body = r.request().postDataJSON() as Record<string, unknown>;
    clipBodies.push(body);
    await r.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ success: true, op: 'clip', jobId: OMNI_JOB, credits: body.expectedCredits, seconds: body.seconds }) });
  });
  const views = [{ success: true, done: false, state: 'processing' }, { success: true, done: true, state: 'ready', videoUrl: OMNI_CLIP }];
  await page.route(/\/api\/genjutsu\/status(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(views.length > 1 ? views.shift() : views[0]) }));

  await typeFilmPrompt(page, HORSE);
  await sendFilm(page);
  const card = await waitForClipCard(page);
  await card.getByTestId('clip-confirm').click();
  await expect.poll(() => clipBodies.length, { timeout: 15_000 }).toBe(1);
  await expect(page.locator(`video[src^="${OMNI_CLIP}"]`).first()).toBeAttached({ timeout: 40_000 });

  // The ask went up with its words; the clip went up once, as its own row: the mark, the link, the shape, the job id.
  await expect.poll(() => writes.posts.filter((p) => p.role === 'assistant').length, { timeout: 15_000 }).toBe(1);
  const row = writes.posts.find((p) => p.role === 'assistant')!;
  expect(row.content).toBe('[video]');
  expect(row.metadata).toEqual({ v: 1, videoUrl: OMNI_CLIP, orientation: 'vertical', omniJob: OMNI_JOB });
  expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(writes.posts.find((p) => p.role === 'user')?.content).toBe(HORSE);
  await page.waitForTimeout(1_500);
  expect(writes.posts.filter((p) => p.role === 'assistant')).toHaveLength(1);
});
