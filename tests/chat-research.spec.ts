import { expect, test, type Page, type Request } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Deep Research in the chat, driven through a real browser against MOCKED /api/research*, /api/connectors* and /api/voice/live.
 *
 * What only a browser can show: the „+" sheet offers the research rows only when /api/research/capabilities says `available`;
 * the start sheet puts the EXACT price on its button and nothing else says a number of credits; a finished job found by the
 * watcher becomes a toast, the toast opens the report, the report draws its sources as favicon chips through OUR proxy;
 * „Go live" opens the Live call carrying the report's id; the Connectors sheet says Local files works and the other four are
 * „Soon" with no connect button; and none of it pushes the page sideways at 375 px. The jest suites cover each rule; this covers
 * the wiring between them.
 *
 * The chat is sign-in only and there is no Supabase session in this run, so — like tests/chat-streaming.spec.ts — the init step
 * pins the studio's publish-once flags on <html> (`data-authed`, `data-uid`), which the studio and ResearchHost read.
 * Set SHOTS_DIR to also run the screenshot pass (phone 390×844, desktop 1280×800) and write the PNGs there.
 */

const RID = '3f2b8c1e-4d5a-4b6c-9d7e-1a2b3c4d5e6f';
const UID = '9a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const REPORT = [
  '# EV market in the Caucasus',
  '',
  '## Summary',
  '',
  'Electric-car sales grew fast in 2025 [1], driven by import-tax cuts.',
  '',
  '## Findings',
  '',
  '- Georgia leads regional adoption [2].',
  '- Armenia followed a similar path [3].',
  '',
  '| Country | Share |',
  '|---|---|',
  '| Georgia | 12% |',
].join('\n');

const SOURCES = [
  { url: 'https://www.example-ev.com/report', title: 'EV Outlook 2026' },
  { url: 'https://stats.gov.ge/ev', title: 'Geostat — vehicle registrations' },
  { url: 'https://news.example.org/a', title: 'Market news' },
];

const jobRow = (over: Record<string, unknown> = {}) => ({
  id: RID,
  status: 'running',
  prompt: 'How is the EV market in the Caucasus developing?',
  locale: 'en',
  title: null,
  credits: 120,
  createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  startedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  completedAt: null,
  progress: { summary: 'Comparing registration statistics across the three countries', searches: 14 },
  hasReport: false,
  reportChars: 0,
  sourcesCount: 0,
  incomplete: false,
  errorCode: null,
  refunded: false,
  refundPending: false,
  cancelRequested: false,
  contextFiles: [],
  ...over,
});
const finishedRow = () => jobRow({ status: 'completed', title: 'EV market in the Caucasus', hasReport: true, reportChars: REPORT.length, sourcesCount: SOURCES.length, progress: {}, completedAt: new Date(Date.now() - 30_000).toISOString() });

interface Mock {
  caps: Record<string, unknown> | 'fail';
  list: unknown[];
  files: Array<Record<string, unknown>>;
  listCalls: number;
  capsCalls: number;
  startBodies: Array<Record<string, unknown>>;
  askBodies: Array<Record<string, unknown>>;
  liveBodies: Array<Record<string, unknown>>;
  ttsBodies: Array<Record<string, unknown>>;
  fileBodies: Array<Record<string, unknown>>;
}

const AVAILABLE = { available: true, credits: 120, filesAvailable: true, maxActive: 1 };
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockApi(page: Page, init: Partial<Mock> = {}): Promise<Mock> {
  const m: Mock = { caps: AVAILABLE, list: [], files: [], listCalls: 0, capsCalls: 0, startBodies: [], askBodies: [], liveBodies: [], ttsBodies: [], fileBodies: [], ...init };

  // Everything else the studio does on load (balance, titles, persistence) — answered so nothing hangs or 401s the run.
  await page.route('**/api/chat/title', (r) => r.fulfill(json({ title: 'x' })));

  await page.route(/\/api\/research\/capabilities/, (r) => {
    m.capsCalls++;
    return m.caps === 'fail' ? r.fulfill(json({ error: 'x' }, 500)) : r.fulfill(json(m.caps));
  });
  await page.route(/\/api\/research(\?[^/]*)?$/, (r) => {
    m.listCalls++;
    return r.fulfill(json({ items: m.list, serverNow: new Date().toISOString(), available: true }));
  });
  await page.route(/\/api\/research\/start/, async (r) => {
    const body = r.request().postDataJSON() as Record<string, unknown>;
    m.startBodies.push(body);
    const row = jobRow({ prompt: body.prompt });
    m.list = [row];
    await r.fulfill(json({ job: row, serverNow: new Date().toISOString(), replayed: false }, 201));
  });
  await page.route(/\/api\/research\/[0-9a-f-]{36}\/ask/, async (r) => {
    const body = r.request().postDataJSON() as Record<string, unknown>;
    m.askBodies.push(body);
    await r.fulfill(json({ answer: body.mode === 'summarize' ? 'Sales grew fast; Georgia leads.' : 'Georgia has the highest share.', truncated: false }));
  });
  await page.route(/\/api\/research\/[0-9a-f-]{36}(\?.*)?$/, (r) =>
    r.fulfill(json({ job: { ...finishedRow(), report: REPORT, sources: SOURCES }, serverNow: new Date().toISOString() })));
  await page.route(/\/api\/research\/favicon/, (r) => {
    const domain = new URL(r.request().url()).searchParams.get('domain');
    return domain === 'stats.gov.ge' ? r.fulfill({ status: 200, contentType: 'image/png', body: PNG }) : r.fulfill({ status: 204 });
  });

  await page.route(/\/api\/connectors(\?.*)?$/, (r) =>
    r.fulfill(json({
      connectors: [
        { id: 'local_files', label: 'Local files', status: 'ready', fileCount: m.files.length },
        { id: 'google_drive', label: 'Google Drive', status: 'soon' },
        { id: 'onedrive', label: 'OneDrive', status: 'soon' },
        { id: 'notion', label: 'Notion', status: 'soon' },
        { id: 'dropbox', label: 'Dropbox', status: 'soon' },
      ],
      limits: { maxFiles: 10, maxFileChars: 30000, maxAttach: 5, maxContextChars: 40000 },
    })));
  await page.route(/\/api\/connectors\/files/, async (r) => {
    const limits = { maxFiles: 10, maxFileChars: 30000, maxAttach: 5, maxContextChars: 40000 };
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      m.fileBodies.push(body);
      const file = { id: 'aaaaaaaa-1111-4222-8333-444444444444', name: body.name, mimeType: body.mimeType, chars: String(body.text).length, bytes: body.bytes, truncated: false, createdAt: new Date().toISOString() };
      m.files = [file, ...m.files];
      return r.fulfill(json({ file, limits }, 201));
    }
    return r.fulfill(json({ files: m.files, limits }));
  });

  await page.route('**/api/voice/live', async (r) => {
    m.liveBodies.push(r.request().postDataJSON() as Record<string, unknown>);
    await r.fulfill(json({ error: 'unavailable' }, 503));
  });
  await page.route('**/api/tts/gemini', async (r) => {
    m.ttsBodies.push(r.request().postDataJSON() as Record<string, unknown>);
    await r.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.from('UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==', 'base64') });
  });
  return m;
}

async function openChat(page: Page, locale = 'en'): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* private mode */ }
  });
  await page.goto(`/${locale}/dashboard?tool=chat`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('model-switcher').filter({ visible: true })).toBeVisible({ timeout: 20_000 });
}

/** Signed in, as far as the page can tell (no Supabase here): pinned AFTER mount, because ChatChrome publishes '0' from an effect. */
async function pinSignedIn(page: Page): Promise<void> {
  await page.evaluate((uid) => {
    const el = document.documentElement;
    const pin = () => {
      if (el.dataset.authed !== '1') el.dataset.authed = '1';
      if (el.dataset.uid !== uid) el.dataset.uid = uid;
    };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed', 'data-uid'] });
  }, UID);
}

async function openPlus(page: Page): Promise<void> {
  await page.getByTestId('plus').click();
  await expect(page.getByTestId('tool-sheet')).toBeVisible();
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(600); // let the sheet-rise / fade animations settle
  await page.screenshot({ path: `${dir}/${name}.png` });
}

const researchNodes = (page: Page) => page.locator('[data-testid^="research-"], [data-testid="sidebar-research"], [data-testid^="tool-extra-"]');

test.describe('Deep Research · the capability gate', () => {
  test('capability off → nothing is shown, nothing polls, the chat home is untouched', async ({ page }) => {
    const m = await mockApi(page, { caps: { available: false, reason: 'schema', credits: 120, filesAvailable: false, maxActive: 1 } });
    await openChat(page);
    await pinSignedIn(page);
    await openPlus(page);
    // The „+" sheet has its tools and none of the research rows.
    await expect(page.getByTestId('tool-extra-research')).toHaveCount(0);
    await expect(page.getByTestId('tool-extra-connectors')).toHaveCount(0);
    await expect(page.getByTestId('tool-sheet-extras')).toHaveCount(0);
    await expect.poll(() => m.capsCalls).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    // …no watcher polling for a feature that is off, and no research element anywhere in the page.
    expect(m.listCalls).toBe(0);
    await expect(researchNodes(page)).toHaveCount(0);
  });

  test('a failing capabilities request degrades to nothing too (never an error on screen)', async ({ page }) => {
    const m = await mockApi(page, { caps: 'fail' });
    await openChat(page);
    await pinSignedIn(page);
    await openPlus(page);
    await expect(page.getByTestId('tool-extra-research')).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(m.listCalls).toBe(0);
    await expect(researchNodes(page)).toHaveCount(0);
  });

  test('capability on → the „+" sheet offers Deep Research only (My documents opens from research itself)', async ({ page }) => {
    await mockApi(page);
    await openChat(page);
    await pinSignedIn(page);
    await openPlus(page);
    await expect(page.getByTestId('tool-extra-research')).toBeVisible();
    await expect(page.getByTestId('tool-extra-connectors')).toHaveCount(0);
    await expect(page.getByTestId('tool-extra-research')).toContainText('Deep Research');
  });
});

test.describe('Deep Research · start, in the thread', () => {
  test('the start sheet shows the exact price on its button only, and starts nothing until pressed', async ({ page }) => {
    const m = await mockApi(page);
    await openChat(page);
    await pinSignedIn(page);
    await page.getByTestId('composer-input').fill('How will EV adoption evolve in Georgia?');
    await openPlus(page);
    await page.getByTestId('tool-extra-research').click();

    const sheet = page.getByTestId('research-start-sheet');
    await expect(sheet).toBeVisible();
    // Seeded from the composer's text.
    await expect(page.getByTestId('research-prompt')).toHaveValue('How will EV adoption evolve in Georgia?');
    // The price is ON the button: the number the server's capabilities answer gave.
    const button = page.getByTestId('research-start-button');
    await expect(button).toHaveAttribute('data-price', '120');
    await expect(button).toContainText('120');
    await expect(button).toHaveAttribute('aria-label', /Start research — 120 credits/);
    // …and in no sentence of the sheet.
    const sentences = await sheet.evaluate((el, btn) => (el.textContent ?? '').replace(btn ?? '', ''), await button.textContent());
    expect(sentences).not.toMatch(/120/);
    expect(sentences).not.toMatch(/\d\s*credits?/i);
    // Nothing was ordered by opening the sheet.
    expect(m.startBodies).toHaveLength(0);

    await button.click();
    await expect.poll(() => m.startBodies.length).toBe(1);
    const body = m.startBodies[0]!;
    expect(body).toMatchObject({ prompt: 'How will EV adoption evolve in Georgia?', confirmedCredits: 120, locale: 'en', fileIds: [] });
    expect(String(body.requestId)).toMatch(/^[A-Za-z0-9_-]{8,100}$/);

    // The sheet closes; the thread gets the question and a card that follows the job; the composer is not left holding the text.
    await expect(sheet).toBeHidden();
    const card = page.getByTestId('research-card').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-state', 'running');
    await expect(card).toContainText('You can close this');
    await expect(card).toContainText('Comparing registration statistics');
    await expect(page.getByTestId('composer-input')).toHaveValue('');
    await expect(page.getByTestId('research-toast').filter({ hasText: 'Research started' })).toBeVisible();
  });

  test('a refused start shows the server\'s sentence and keeps the question', async ({ page }) => {
    await mockApi(page);
    await page.route(/\/api\/research\/start/, (r) =>
      r.fulfill(json({ error: 'insufficient_credits', message: 'You do not have enough credits for Deep Research. Top up and try again.' }, 402)));
    await openChat(page);
    await pinSignedIn(page);
    await openPlus(page);
    await page.getByTestId('tool-extra-research').click();
    await page.getByTestId('research-prompt').fill('A question that cannot be paid for');
    await page.getByTestId('research-start-button').click();
    await expect(page.getByTestId('research-start-error')).toContainText('not have enough credits');
    await expect(page.getByTestId('research-start-sheet')).toBeVisible();
    await expect(page.getByTestId('research-prompt')).toHaveValue('A question that cannot be paid for');
    await expect(page.getByTestId('research-card')).toHaveCount(0);
  });
});

test.describe('Deep Research · the finished report', () => {
  test('a finished job found by the watcher → toast → report → source chips (favicons through our proxy)', async ({ page }) => {
    const m = await mockApi(page, { list: [finishedRow()] });
    const thirdParty: string[] = [];
    page.on('request', (req: Request) => { if (/gstatic\.com|google\.com\/s2|favicons\?/.test(req.url()) && !req.url().includes('/api/research/favicon')) thirdParty.push(req.url()); });
    await openChat(page);
    await pinSignedIn(page);

    const toast = page.getByTestId('research-toast').filter({ hasText: 'Your report is ready' });
    await expect(toast).toBeVisible({ timeout: 20_000 });
    await expect(toast).toContainText('EV market in the Caucasus');
    await expect(toast).toContainText('3 sources');
    expect(m.listCalls).toBeGreaterThan(0);

    await page.getByTestId('research-toast-open').click();
    const viewer = page.getByTestId('research-viewer');
    await expect(viewer).toBeVisible();
    await expect(toast).toBeHidden();
    const report = page.getByTestId('research-report');
    await expect(report.getByRole('heading', { name: 'Summary' })).toBeVisible();
    await expect(report.getByRole('heading', { name: 'Findings' })).toBeVisible();
    await expect(report).toContainText('Georgia leads regional adoption');
    await expect(report.locator('table')).toBeVisible();

    // Sources: one chip per source, a real link in a new tab, favicons only via /api/research/favicon.
    const chips = page.getByTestId('research-source');
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toContainText('EV Outlook 2026');
    await expect(chips.nth(0)).toHaveAttribute('data-domain', 'example-ev.com');
    await expect(chips.nth(0)).toHaveAttribute('href', 'https://www.example-ev.com/report');
    await expect(chips.nth(0)).toHaveAttribute('target', '_blank');
    await expect(chips.nth(0)).toHaveAttribute('rel', /noopener/);
    // stats.gov.ge has an icon (the proxy answers a PNG); the others answer 204 → the letter badge.
    await expect(chips.nth(1).locator('img')).toHaveAttribute('src', '/api/research/favicon?domain=stats.gov.ge');
    await expect(chips.nth(0).locator('img')).toHaveCount(0, { timeout: 10_000 });
    await expect(chips.nth(0).locator('span').first()).toHaveText('e');
    expect(thirdParty).toEqual([]);

    // The ask box: a command button asks the report (mode), a free line is a question, a bare "stop" is neither.
    await page.getByTestId('research-summarize').click();
    await expect.poll(() => m.askBodies.length).toBe(1);
    expect(m.askBodies[0]).toMatchObject({ mode: 'summarize', locale: 'en' });
    await expect(page.getByTestId('research-answer').first()).toContainText('Georgia leads');
    await page.getByTestId('research-ask-input').fill('Which country has the highest share?');
    await page.getByTestId('research-ask-send').click();
    await expect.poll(() => m.askBodies.length).toBe(2);
    expect(m.askBodies[1]).toMatchObject({ mode: 'ask', question: 'Which country has the highest share?' });
    await page.getByTestId('research-ask-input').fill('stop');
    await page.getByTestId('research-ask-input').press('Enter');
    await page.waitForTimeout(400);
    expect(m.askBodies).toHaveLength(2);

    // Escape closes the viewer and the toast does not come back (already told).
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('research-toast')).toHaveCount(0);
  });

  test('Read aloud sends the report text in short chunks to the TTS route', async ({ page }) => {
    const m = await mockApi(page, { list: [finishedRow()] });
    await openChat(page);
    await pinSignedIn(page);
    await page.getByTestId('research-toast-open').click();
    await expect(page.getByTestId('research-viewer')).toBeVisible();
    await page.getByTestId('research-read-aloud').click();
    await expect.poll(() => m.ttsBodies.length).toBeGreaterThan(0);
    const first = m.ttsBodies[0]!;
    expect(String(first.text)).toContain('EV market in the Caucasus');
    expect(String(first.text).length).toBeLessThanOrEqual(600);
    expect(String(first.text)).not.toMatch(/\*\*|https?:\/\/|\[\d\]/);
    expect(first.locale).toBe('en');
  });

  test('Go live opens the Live call carrying the report id', async ({ page }) => {
    const m = await mockApi(page, { list: [finishedRow()] });
    await openChat(page);
    await pinSignedIn(page);
    await page.getByTestId('research-toast-open').click();
    await expect(page.getByTestId('research-viewer')).toBeVisible();
    await page.getByTestId('research-go-live').click();
    // The viewer steps aside and the Live call asks the server for its token WITH the report id (never report text).
    await expect.poll(() => m.liveBodies.length, { timeout: 45_000 }).toBeGreaterThan(0);
    expect(m.liveBodies[0]).toMatchObject({ researchId: RID, locale: 'en' });
    expect(JSON.stringify(m.liveBodies[0])).not.toContain('Electric-car sales');
  });
});

test.describe('Deep Research · Connectors', () => {
  test('My documents opens from the research start sheet; Local files works; no cloud service without a connect flow is shown', async ({ page }) => {
    const m = await mockApi(page, { files: [{ id: 'bbbbbbbb-1111-4222-8333-444444444444', name: 'market-notes.pdf', mimeType: 'application/pdf', chars: 5200, bytes: 90000, truncated: false, createdAt: new Date().toISOString() }] });
    await openChat(page);
    await pinSignedIn(page);
    await openPlus(page);
    await page.getByTestId('tool-extra-research').click();
    await page.getByTestId('research-docs-open').click();

    const sheet = page.getByTestId('research-connectors-sheet');
    await expect(sheet).toBeVisible();
    const local = page.getByTestId('connector-local');
    await expect(local).toContainText('Local files');
    await expect(page.getByTestId('connector-files')).toContainText('market-notes.pdf');
    await expect(page.getByTestId('connector-add')).toBeEnabled();

    // A cloud integration with no real connect flow is not shown at all (Omnichannel A2).
    await expect(page.getByTestId('connector-soon')).toHaveCount(0);
    for (const name of ['Google Drive', 'OneDrive', 'Notion', 'Dropbox']) await expect(sheet).not.toContainText(name);

    // Upload a text file: its text goes to /api/connectors/files, and it joins the list.
    await page.getByTestId('connector-file-input').setInputFiles({ name: 'brief.txt', mimeType: 'text/plain', buffer: Buffer.from('The brief says: compare the three markets.') });
    await expect.poll(() => m.fileBodies.length).toBe(1);
    expect(m.fileBodies[0]).toMatchObject({ name: 'brief.txt', text: 'The brief says: compare the three markets.', locale: 'en' });
    await expect(page.getByTestId('connector-files')).toContainText('brief.txt');
  });
});

test.describe('Deep Research · at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('every sheet fits the phone: no sideways scroll, targets ≥ 44 px, focus lands inside', async ({ page }) => {
    await mockApi(page, { list: [finishedRow()] });
    await openChat(page);
    await pinSignedIn(page);

    // The toast.
    const toast = page.getByTestId('research-toast').filter({ hasText: 'Your report is ready' });
    await expect(toast).toBeVisible({ timeout: 20_000 });
    await noHorizontalScroll(page);

    // The report.
    await page.getByTestId('research-toast-open').click();
    const viewer = page.getByTestId('research-viewer');
    await expect(viewer).toBeVisible();
    await expect(page.getByTestId('research-source')).toHaveCount(3);
    await noHorizontalScroll(page);
    const viewerBox = await viewer.boundingBox();
    expect(viewerBox!.width).toBeLessThanOrEqual(375);
    for (const id of ['research-go-live', 'research-read-aloud', 'research-summarize', 'research-takeaways', 'research-ask-send', 'research-viewer-close']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.height, `${id} height`).toBeGreaterThanOrEqual(43.5);
      expect(box!.width, `${id} width`).toBeGreaterThanOrEqual(43.5);
    }
    for (const chip of await page.getByTestId('research-source').all()) expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    // Focus moved into the dialog.
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="research-viewer"]'))).toBe(true);
    await page.getByTestId('research-viewer-close').click();
    await expect(viewer).toBeHidden();

    // The start sheet.
    await openPlus(page);
    await page.getByTestId('tool-extra-research').click();
    await expect(page.getByTestId('research-start-sheet')).toBeVisible();
    await noHorizontalScroll(page);
    expect((await page.getByTestId('research-start-button').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="research-start-sheet"]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('research-start-sheet')).toBeHidden();

    // My documents, opened from the start sheet.
    await openPlus(page);
    await page.getByTestId('tool-extra-research').click();
    await page.getByTestId('research-docs-open').click();
    await expect(page.getByTestId('research-connectors-sheet')).toBeVisible();
    await expect(page.getByTestId('connector-soon')).toHaveCount(0);
    await noHorizontalScroll(page);
  });
});

// ─── the screenshot pass (only when SHOTS_DIR is set) ─────────────────────────────────────────────────────────────
for (const vp of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }] as const) {
  test.describe(`screenshots · ${vp.name}`, () => {
    test.skip(!process.env.SHOTS_DIR, 'set SHOTS_DIR to write screenshots');
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`${vp.name}: start sheet, thread card, toast, report, answers, connectors`, async ({ page }) => {
      const m = await mockApi(page);
      await openChat(page);
      await pinSignedIn(page);

      // 1 — the „+" sheet with the two rows, then the start sheet with the price on the button.
      await page.getByTestId('composer-input').fill('How will EV adoption evolve in Georgia?');
      await openPlus(page);
      await shot(page, `${vp.name}-1-plus-sheet`);
      await page.getByTestId('tool-extra-research').click();
      await expect(page.getByTestId('research-start-sheet')).toBeVisible();
      await shot(page, `${vp.name}-2-start-sheet`);

      // 2 — started: the card in the thread.
      await page.getByTestId('research-start-button').click();
      await expect(page.getByTestId('research-card').first()).toBeVisible();
      await page.getByTestId('research-toast').getByRole('button').last().click(); // dismiss the one-liner toast
      await shot(page, `${vp.name}-3-thread-card`);

      // 3 — the job finished while nobody was looking: the toast, then the report.
      m.list = [finishedRow()];
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect(page.getByTestId('research-toast').filter({ hasText: 'Your report is ready' })).toBeVisible({ timeout: 30_000 });
      await shot(page, `${vp.name}-4-toast-ready`);
      await page.getByTestId('research-toast-open').click();
      await expect(page.getByTestId('research-viewer')).toBeVisible();
      await expect(page.getByTestId('research-source')).toHaveCount(3);
      await shot(page, `${vp.name}-5-report`);
      await page.getByTestId('research-report').evaluate((el) => el.scrollIntoView({ block: 'end' }));
      await page.getByTestId('research-sources').scrollIntoViewIfNeeded();
      await shot(page, `${vp.name}-6-sources`);
      await page.getByTestId('research-summarize').click();
      await expect(page.getByTestId('research-answer').first()).toContainText('Georgia leads');
      await shot(page, `${vp.name}-7-answer`);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('research-viewer')).toBeHidden();

      // 4 — My documents (from the start sheet).
      await openPlus(page);
      await page.getByTestId('tool-extra-research').click();
      await page.getByTestId('research-docs-open').click();
      await expect(page.getByTestId('research-connectors-sheet')).toBeVisible();
      await shot(page, `${vp.name}-8-connectors`);
    });
  });
}
