import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, type Route, type TestInfo } from '@playwright/test';
import { mockStoredUpload, SIGNED_UPLOAD_URL } from '../fixtures/uploads';

/**
 * Shared ground for the Video Core v1.0 round-3 specs (tests/video-core/*). Every server route the studio talks to is
 * answered here by page.route — nothing is uploaded, planned by a model, rendered or charged — and the dummy-Supabase dev
 * server has no session, so „signed in" is pinned on <html data-authed> the way tests/agent-g-montage.spec.ts does it.
 *
 * The findings a spec OBSERVES (what the app does not persist, what it routes elsewhere) are recorded, not asserted
 * green: test.info().annotations plus a `findings` array in the evidence folder (docs/handoffs/video-core/evidence/t2-round3-final; t2-round3 is the earlier run, kept as it was).
 */

export const EVIDENCE_DIR = join(__dirname, '..', '..', 'docs', 'handoffs', 'video-core', 'evidence', 't2-round3-final');
export const FINDINGS_FILE = join(EVIDENCE_DIR, 'findings.json');

export type Locale = 'en' | 'ka' | 'ru';

export const CLIP = readFileSync(join(__dirname, '..', 'fixtures', 'clip.webm'));

/** A silent-ish PCM WAV of `seconds` at `rate` Hz — a real track for the montage's upload tiles. */
export function wav(seconds = 6, rate = 8000): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 3000), 44 + i * 2);
  return buf;
}

export const sse = (frames: unknown[]): string => frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('');

export const JOB_ID = '11111111-2222-4333-8444-555555555555';
export const MASTER_URL = 'https://e2e-media.supabase.co/agent-montage.mp4';
export const FRAME_URL = 'http://localhost:3000/templates/image/poster.jpg';

export const MANIFEST = [
  { index: 0, path: 'omni-uploads/u/file-1', name: 'beach.webm', kind: 'video', durationSec: 5 },
  { index: 1, path: 'omni-uploads/u/file-2', name: 'city.webm', kind: 'video', durationSec: 5 },
  { index: 2, path: 'omni-uploads/u/file-3', name: 'song.wav', kind: 'audio', durationSec: 6 },
];
export const QUOTE: Record<string, unknown> = {
  jobId: JOB_ID, credits: 0, totalSec: 19.97, shots: 8, clips: 2, aspect: '16:9', beatSynced: true, bpm: 119.96,
  musicStartSec: 0.23, musicFile: 2, manifest: MANIFEST, clipOrder: [0, 1], engine: { id: 'ffmpeg-montage', label: 'FFmpeg montage', free: true },
  unusedFiles: [], expiresAt: Date.now() + 1_800_000,
};

/** One task view as lib/tasks/taskView serves it (GET /api/tasks?id=…). */
export const taskView = (t: Record<string, unknown>): Record<string, unknown> => ({
  id: JOB_ID, kind: 'agent-montage', service: 'film', status: 'running', stage: null, pct: null, attempt: null, result: null, error: null,
  cancellable: false, label: null, position: null, createdAt: null, updatedAt: null, ...t,
});

export interface Calls {
  chat: Array<Record<string, unknown>>;
  quote: Array<Record<string, unknown>>;
  run: Array<Record<string, unknown>>;
  editQuote: Array<Record<string, unknown>>;
  editRun: Array<Record<string, unknown>>;
  reads: string[];
  cancel: unknown[];
  storyboard: Array<Record<string, unknown>>;
  orchestrate: Array<Record<string, unknown>>;
  assemble: Array<Record<string, unknown>>;
  directorRuns: Array<Record<string, unknown>>;
  statusReads: string[];
  /** Uploads: POST /api/upload/sign bodies, PUT URLs to the signed storage URL, POST /api/upload/verify bodies. */
  sign: Array<Record<string, unknown>>;
  put: string[];
  verify: Array<Record<string, unknown>>;
  /** GET /api/studio/library URLs and POST /api/studio/library bodies (an explicit „Save to library"). */
  libraryReads: string[];
  librarySaves: Array<Record<string, unknown>>;
  /** Every GET of a result on the media host (a download fetches the master again). */
  media: string[];
}

export interface Reply { status: number; body: unknown }

export interface StudioOptions {
  locale?: Locale;
  /** The `?tool=` the page opens with (default chat). `null`: no query at all. */
  tool?: string | null;
  /** Agent G's media routes, as their GET answers them (default: montage on, edit off, audio off). */
  montage?: boolean;
  edit?: boolean;
  audio?: boolean;
  /** GET /api/video/director → { enabled } (default false: the film path). */
  director?: boolean;
  /** The montage quote the server hands back (default QUOTE). A function sees the request body. */
  quote?: Record<string, unknown> | ((body: Record<string, unknown>, n: number) => Record<string, unknown>);
  /** The task as a worker moves it: read one view per GET ?id= until the last, which repeats (default running → completed 16:9). */
  taskViews?: Array<Record<string, unknown>>;
  /** The job tray's list (?active=1) carries the first view while it is live (a job already running elsewhere). */
  live?: boolean;
  /** POST /api/chat/orchestrate — dispatch (body.message) and poll (body.predictionId) alike. */
  orchestrate?: (body: Record<string, unknown>) => Reply;
  /** POST /api/video/assemble. */
  assemble?: Reply;
  /** POST /api/video/director/runs. */
  directorRuns?: Reply;
  /** The chat model's canned reply. */
  reply?: string;
  /** POST /api/upload/verify answers this instead of { ok: true } (a refused or broken check of the stored bytes). */
  verifyFails?: Reply;
  /** GET /api/studio/library → { items } (default none). */
  library?: Array<Record<string, unknown>>;
  /** Jobs the server lists as live (?active=1) from the start — work started elsewhere (another tab, before a reload). */
  others?: Array<Record<string, unknown>>;
}

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const json = (status: number, body: unknown) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** The film matrix with every clip landed and the stitch due: the client goes straight to /api/video/assemble. */
export function readyMatrix(sceneCount = 3): Record<string, unknown> {
  return {
    sceneCount, clipSec: 8, seed: 4242, storyboard: 'succeeded', stitch: 'pending', audio: 'succeeded', audioUrl: null,
    clips: Array.from({ length: sceneCount }, (_, i) => ({ ordinal: i + 1, status: 'succeeded', url: `https://e2e-media.supabase.co/clips/${i + 1}.mp4` })),
    readyToStitch: true, statusTokenId: 'tok-1',
  };
}

export const dispatchReady = (body: Record<string, unknown>): Reply => ({
  status: 200,
  body: { success: true, predictionId: 'pred-1', predictionStatus: 'processing', metadata: { film: readyMatrix(Number(body.sceneCount) || 3) } },
});

export const REVISION_MISMATCH_MESSAGE = 'the storyboard changed after it was approved (revision 2 · 0123456789abcdef. Nothing was rendered or charged — approve the storyboard again.)';
export const revisionMismatch = (): Reply => ({
  status: 400,
  body: { success: false, error: 'revision_mismatch', reason: 'board_changed', revision: 2, fingerprint: '0123456789abcdef', message: REVISION_MISMATCH_MESSAGE, detail: 'the board fingerprints to ffffffffffffffff, the approval names 0123456789abcdef' },
});

export const QC_REJECTED: Reply = {
  status: 502,
  body: { error: 'qc_rejected', reason: 'frame_count_mismatch', codes: ['frame_count_mismatch'], qa: { grade: 'F', score: 0 }, message: 'The master failed its quality check (frame_count_mismatch: counted 890 frames, expected 891). Nothing was delivered or charged.' },
};
export const MUSIC_UNREADABLE: Reply = {
  status: 422,
  body: { error: 'music_unreadable', reason: 'soundtrack_unreadable', lane: 'music', failedStep: 'probe', message: 'The soundtrack could not be read as audio, so nothing was assembled or charged. Attach a playable MP3 or WAV.' },
};

/**
 * Open the studio with every route mocked. Returns the calls the page made, for the specs to assert on.
 */
export async function openStudio(page: Page, opts: StudioOptions = {}): Promise<Calls> {
  const locale: Locale = opts.locale ?? 'en';
  const calls: Calls = { chat: [], quote: [], run: [], editQuote: [], editRun: [], reads: [], cancel: [], storyboard: [], orchestrate: [], assemble: [], directorRuns: [], statusReads: [], sign: [], put: [], verify: [], libraryReads: [], librarySaves: [], media: [] };
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* private mode */ }
  });

  // Uploads: sign → PUT (storage host) → verify. Nothing leaves the browser.
  let n = 0;
  await page.route('**/api/upload/sign', (r) => {
    calls.sign.push((r.request().postDataJSON() ?? {}) as Record<string, unknown>);
    return r.fulfill(json(200, { bucket: 'uploads', path: `omni-uploads/u/file-${++n}`, token: 't', signedUrl: SIGNED_UPLOAD_URL }));
  });
  await mockStoredUpload(page);
  await page.route(/\/storage\/v1\/object\/upload\/sign\//, (r) => {
    if (r.request().method() === 'PUT') calls.put.push(r.request().url());
    return r.fulfill(json(200, { Key: 'uploads/u/x' }));
  });
  await page.route('**/api/upload/verify', (r) => {
    calls.verify.push((r.request().postDataJSON() ?? {}) as Record<string, unknown>);
    const rep = opts.verifyFails ?? { status: 200, body: { ok: true } };
    return r.fulfill(json(rep.status, rep.body));
  });
  // Results are served from the storage domain.
  await page.route('https://e2e-media.supabase.co/**', (r) => {
    calls.media.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'video/webm', body: CLIP });
  });

  // The chat model and its title.
  await page.route('**/api/chat/title', (r) => r.fulfill(json(200, { title: 't' })));
  await page.route('**/api/chat/gemini', async (r: Route) => {
    calls.chat.push((r.request().postDataJSON() ?? {}) as Record<string, unknown>);
    await r.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sse([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } }, { text: opts.reply ?? 'Noted — the chat model answered this one.' }, '[DONE]']),
    });
  });
  await page.route(/\/api\/studio\/library(\?.*)?$/, (r) => {
    if (r.request().method() === 'POST') {
      calls.librarySaves.push((r.request().postDataJSON() ?? {}) as Record<string, unknown>);
      return r.fulfill(json(200, { success: true }));
    }
    calls.libraryReads.push(r.request().url());
    return r.fulfill(json(200, { items: opts.library ?? [] }));
  });
  await page.route('**/api/video/capabilities', (r) => r.fulfill(json(200, { longform: false, maxSeconds: 96 })));
  await page.route(/\/api\/video\/director$/, (r) => r.fulfill(json(200, { enabled: opts.director === true })));
  await page.route('**/api/video/director/runs', async (r: Route) => {
    calls.directorRuns.push((r.request().postDataJSON() ?? {}) as Record<string, unknown>);
    const rep = opts.directorRuns ?? { status: 400, body: { ...(revisionMismatch().body as object), problems: ['the board fingerprints to ffffffffffffffff'] } };
    await r.fulfill(json(rep.status, rep.body));
  });

  // Agent G's media routes: open or closed by the GET; the montage's quote and run.
  const flags: Record<string, boolean> = { montage: opts.montage ?? true, edit: opts.edit ?? false, audio: opts.audio ?? false };
  await page.route(/\/api\/agent\/media\/(montage|edit|audio)(\?.*)?$/, async (r: Route) => {
    const kind = /\/api\/agent\/media\/(montage|edit|audio)/.exec(r.request().url())![1]!;
    if (r.request().method() === 'GET') { await r.fulfill(json(200, { enabled: flags[kind] })); return; }
    const body = (r.request().postDataJSON() ?? {}) as Record<string, unknown>;
    if (kind === 'montage') {
      if (body.action === 'quote') {
        calls.quote.push(body);
        const q = typeof opts.quote === 'function' ? opts.quote(body, calls.quote.length) : (opts.quote ?? QUOTE);
        await r.fulfill(json(200, { ok: true, quote: q, request: { shots: ['signed plan'] }, token: 'signed-token' }));
      } else if (body.action === 'run') {
        calls.run.push(body);
        await r.fulfill(json(200, { ok: true, jobId: JOB_ID, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false }));
      } else await r.fulfill(json(400, { ok: false, error: 'bad_action' }));
      return;
    }
    if (kind === 'edit') {
      if (body.action === 'quote') {
        calls.editQuote.push(body);
        await r.fulfill(json(200, { ok: true, quote: EDIT_QUOTE, request: { file: 'signed plan' }, token: 'signed-token' }));
      } else if (body.action === 'run') {
        calls.editRun.push(body);
        await r.fulfill(json(200, { ok: true, jobId: EDIT_JOB, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false }));
      } else await r.fulfill(json(400, { ok: false, error: 'bad_action' }));
      return;
    }
    await r.fulfill(json(404, {}));
  });

  // The task route: the chat follows a job there (GET ?id=), the tray lists live ones (?active=1), Stop posts there.
  const views = opts.taskViews ? [...opts.taskViews] : [
    taskView({ status: 'running', stage: 'stitch', pct: 55, attempt: 1, cancellable: true }),
    taskView({ status: 'completed', pct: 100, result: { url: MASTER_URL, media: 'video', durationSec: 19.97, aspect: '16:9' } }),
  ];
  const first = views[0];
  let stopped = false;
  await page.route(/\/api\/tasks(\?.*)?$/, async (r: Route) => {
    if (r.request().method() === 'GET') {
      const id = new URL(r.request().url()).searchParams.get('id');
      if (!id) {
        // A job is live only once it was started (a run was posted) and until it was stopped — as the server lists it.
        const live = opts.live && calls.run.length > 0 && !stopped && first && (first.status === 'running' || first.status === 'queued') ? [first] : [];
        await r.fulfill(json(200, { ok: true, tasks: [...(opts.others ?? []), ...live] }));
        return;
      }
      calls.reads.push(id);
      // After a Stop the worker ends the job: every later read says cancelled (lib/tasks cancelTask → status cancelled).
      const task = stopped && id === JOB_ID
        ? taskView({ status: 'cancelled', stage: (first?.stage as string | null) ?? null, pct: null, error: 'cancelled' })
        : id === EDIT_JOB ? nextEditView() : views.length > 1 ? views.shift() : views[0];
      await r.fulfill(json(200, { ok: true, task }));
      return;
    }
    const posted = (r.request().postDataJSON() ?? {}) as Record<string, unknown>;
    calls.cancel.push(posted);
    if (posted.action === 'cancel') stopped = true;
    await r.fulfill(json(200, { ok: true, task: null }));
  });
  const editViews = [
    { ...taskView({}), id: EDIT_JOB, kind: 'agent-media-edit', status: 'running', stage: 'render', pct: 40, attempt: 1, cancellable: true },
    { ...taskView({}), id: EDIT_JOB, kind: 'agent-media-edit', status: 'completed', pct: 100, result: { url: EDIT_URL, media: 'video', name: 'beach-edit.mp4', durationSec: 5.02, width: 1080, height: 1920 } },
  ];
  const nextEditView = () => (editViews.length > 1 ? editViews.shift() : editViews[0]);

  // The storyboard route: planOnly → the scenes; scriptsOnly → nothing richer; characterAnchor → none; a frame per scene.
  await page.route('**/api/film/storyboard', async (r: Route) => {
    const body = (r.request().postDataJSON() ?? {}) as Record<string, unknown>;
    calls.storyboard.push(body);
    if (body.planOnly) {
      const count = Math.max(1, Number(body.sceneCount) || 3);
      const scenes = Array.from({ length: count }, (_, i) => ({ ordinal: i + 1, beat: `beat ${i + 1}`, prompt: `Scene ${i + 1}: a quiet harbour at dawn, boats rocking`, frameUrl: null }));
      await r.fulfill(json(200, { success: true, seed: 4242, clipSec: 8, scenes, sceneScripts: null, hostedRefs: null }));
      return;
    }
    if (body.scriptsOnly) { await r.fulfill(json(200, { success: true, sceneScripts: null, character: null, masterBrief: null })); return; }
    if (body.characterAnchor) { await r.fulfill(json(200, { success: false })); return; }
    if (body.sceneOrdinal) { await r.fulfill(json(200, { success: true, frameUrl: `data:image/png;base64,${PNG_1X1}` })); return; }
    await r.fulfill(json(400, { success: false, error: 'unexpected' }));
  });

  // The film render: dispatch, poll, stitch, and the durable tracker the client asks when the stitch answer is lost.
  await page.route('**/api/chat/orchestrate', async (r: Route) => {
    const body = (r.request().postDataJSON() ?? {}) as Record<string, unknown>;
    calls.orchestrate.push(body);
    const rep = (opts.orchestrate ?? dispatchReady)(body);
    await r.fulfill(json(rep.status, rep.body));
  });
  await page.route('**/api/video/assemble', async (r: Route) => {
    calls.assemble.push((r.request().postDataJSON() ?? {}) as Record<string, unknown>);
    const rep = opts.assemble ?? QC_REJECTED;
    await r.fulfill(json(rep.status, rep.body));
  });
  await page.route(/\/api\/video\/status\/[^/]+$/, async (r: Route) => {
    calls.statusReads.push(r.request().url());
    await r.fulfill(json(404, { error: 'not_found' }));
  });
  await page.route('**/api/audio/georgian-song', (r) => r.fulfill(json(200, { url: null })));

  const query = opts.tool === null ? '' : `?tool=${opts.tool ?? 'chat'}`;
  await page.goto(`/${locale}/dashboard${query}`);
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
  await pinSignedIn(page);
  return calls;
}

/** The dummy-Supabase dev server has no session; the studio stops a guest before any request. Pin „signed in" after mount. */
export async function pinSignedIn(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

export const EDIT_JOB = '44444444-3333-4444-8555-666666666666';
export const EDIT_URL = 'https://e2e-media.supabase.co/renders/edits/beach-edit.mp4?token=signed';
export const EDIT_QUOTE = {
  jobId: EDIT_JOB, credits: 0, name: 'beach-edit.mp4', expiresAt: Date.now() + 1_800_000,
  edits: [{ op: 'aspect', to: '9:16', fit: 'crop' }],
  plan: { sourceSec: 5, output: 'mp4', durationSec: 5, hasAudio: true, width: 1080, height: 1920, copyVideo: false },
};

export async function say(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  // On a desktop an open Image, Music or Video panel holds the description and the composer's box steps aside (GG's card,
  // 2026-10-18): put the panel away, as a person does, to write to Agent G.
  if (await box.isHidden()) {
    await page.getByTestId('options-toggle').click();
    await expect(box).toBeVisible();
  }
  await box.fill(text);
  await box.press('Enter');
}

export const FILE_INPUT = 'input[type=file][multiple][accept^="image/*,audio/*"][accept*="application/pdf"]';

/** Two clips and one track in the composer, waited for until the track's tile is there. */
export async function attachClipsAndTrack(page: Page, names: [string, string, string] = ['beach.webm', 'city.webm', 'song.wav']): Promise<void> {
  await page.locator(FILE_INPUT).setInputFiles([
    { name: names[0], mimeType: 'video/webm', buffer: CLIP },
    { name: names[1], mimeType: 'video/webm', buffer: CLIP },
    { name: names[2], mimeType: 'audio/wav', buffer: wav() },
  ]);
  await expect(page.getByTitle(names[2])).toBeVisible({ timeout: 10_000 });
}

export async function attachClips(page: Page, names: string[]): Promise<void> {
  await page.locator(FILE_INPUT).setInputFiles(names.map((name) => ({ name, mimeType: 'video/webm', buffer: CLIP })));
  await expect(page.getByTitle(names[names.length - 1]!)).toBeVisible({ timeout: 10_000 });
}

const MENU: Record<Locale, string> = { en: 'Menu', ka: 'მენიუ', ru: 'Меню' };

/** On a phone the options sheet (the Video panel's home) covers the header; Escape closes it (useDialogA11y). */
export async function closeOptionsSheet(page: Page): Promise<void> {
  const sheet = page.getByTestId('options-sheet');
  if (!(await sheet.isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden({ timeout: 5_000 });
}

/** The sidebar: a column on a desktop, a drawer behind the header's Menu button on a phone. */
export async function openSidebar(page: Page, isMobile: boolean, locale: Locale = 'en'): Promise<void> {
  if (!isMobile) return;
  await closeOptionsSheet(page);
  const menu = page.getByRole('button', { name: MENU[locale], exact: true }).first();
  if (await menu.isVisible().catch(() => false)) await menu.click();
}

/** The user's own bubble in the thread (the History row and the header title repeat the same words). */
export function userBubble(page: Page, text: string): Locator {
  return page.locator('div.whitespace-pre-wrap', { hasText: text }).first();
}

/** Chat → the Video tool through the sidebar's own row (the control a user has), then the panel on screen. */
export async function openVideoTool(page: Page, isMobile: boolean, locale: Locale = 'en'): Promise<void> {
  await openSidebar(page, isMobile, locale);
  await page.locator('[data-tour="tool-video"]').first().click();
  await expect(page.getByTestId('video-create-panel')).toBeVisible({ timeout: 15_000 });
}

/** The sidebar's Chat row, the way back from a tool. */
export async function openChatTool(page: Page, isMobile: boolean, locale: Locale = 'en'): Promise<void> {
  await openSidebar(page, isMobile, locale);
  await page.getByTestId('sidebar-chat').click();
  if (isMobile) await page.keyboard.press('Escape').catch(() => undefined);
}

/** The Video panel: on a phone it is the options sheet, which a chat step closes after opening the tool. */
export async function ensureVideoPanel(page: Page): Promise<void> {
  const panel = page.getByTestId('video-create-panel');
  if (await panel.isVisible().catch(() => false)) return;
  await page.getByTestId('options-toggle').click();
  await expect(panel).toBeVisible({ timeout: 10_000 });
}

/**
 * The film's words go in the CHAT BOX (GG 2026-10-18: the Video panel has no prompt of its own). On a phone the panel is
 * a sheet over the box: its „Done" closes it first. The box stays beside the open panel on a desktop.
 */
export async function typeFilmPrompt(page: Page, text: string): Promise<void> {
  const done = page.getByTestId('video-settings-done');
  if (await done.isVisible().catch(() => false)) await done.click();
  const box = page.getByTestId('composer-input');
  await expect(box).toBeVisible({ timeout: 10_000 });
  await box.fill(text);
}

/** The chat box's priced Send — the film's one button (it replaced the panel's Generate). */
export async function sendFilm(page: Page): Promise<void> {
  const send = page.getByTestId('run-button');
  await expect(send).toBeVisible({ timeout: 10_000 });
  await send.click();
}

export interface Finding { id: string; project: string; spec: string; test: string; text: string }

/** An observation that is not a failure: in the test's annotations and in the evidence folder's findings.json. */
export function recordFinding(info: TestInfo, id: string, text: string): void {
  info.annotations.push({ type: 'finding', description: `${id}: ${text}` });
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  let list: Finding[] = [];
  try { if (existsSync(FINDINGS_FILE)) list = JSON.parse(readFileSync(FINDINGS_FILE, 'utf8')) as Finding[]; } catch { list = []; }
  const row: Finding = { id, project: info.project.name, spec: info.file.split('/').pop() ?? info.file, test: info.title, text };
  const i = list.findIndex((f) => f.id === id && f.project === row.project);
  if (i >= 0) list[i] = row; else list.push(row);
  writeFileSync(FINDINGS_FILE, `${JSON.stringify(list, null, 2)}\n`);
}

/** A JPEG (quality 60, under 250 KB) of a key state, named for the summary. */
export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  let buf = await page.screenshot({ type: 'jpeg', quality: 60 });
  if (buf.length > 250_000) buf = await page.screenshot({ type: 'jpeg', quality: 35 });
  writeFileSync(join(EVIDENCE_DIR, `${name}.jpg`), buf);
}

/** The time the studio needs to read the media routes' GETs before the first message is judged. */
export const ROUTE_CHECK_MS = 600;

export const SB_CANCEL: Record<Locale, string> = { en: 'Cancel', ka: 'გაუქმება', ru: 'Отмена' };
export const SB_TITLE: Record<Locale, string> = { en: '📋 Storyboard', ka: '📋 სტორიბორდი', ru: '📋 Раскадровка' };
/** The first words of the `open` step's note: the Video tool was opened from the chat. */
export const ROUTE_NOTE: Record<Locale, string> = { en: '🎬 Opening Video Studio', ka: '🎬 ვხსნი ვიდეო სტუდიას', ru: '🎬 Открываю Видеостудию' };

/** The storyboard overlay the `open` step plans (free): closed through its own Cancel, whichever state it is in. */
export async function cancelStoryboard(page: Page, locale: Locale = 'en'): Promise<void> {
  const cancel = page.getByRole('button', { name: SB_CANCEL[locale], exact: true }).first();
  await expect(cancel).toBeVisible({ timeout: 20_000 });
  await cancel.click();
  await expect(cancel).toBeHidden({ timeout: 10_000 });
}

export const SB_SCENE: Record<Locale, string> = { en: 'Scene', ka: 'სცენა', ru: 'Сцена' };

/** Wait for the storyboard overlay to show its board, its Generate button enabled and — when `frames` is given — the last
 *  scene's frame on screen (the frames are fetched one POST per scene after the plan). */
export async function waitForBoard(page: Page, locale: Locale = 'en', frames?: number): Promise<void> {
  await expect(page.getByRole('heading', { name: SB_TITLE[locale] })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('storyboard-generate')).toBeEnabled({ timeout: 30_000 });
  if (frames) await expect(page.getByRole('img', { name: `${SB_SCENE[locale]} ${frames}`, exact: true })).toBeVisible({ timeout: 30_000 });
}
