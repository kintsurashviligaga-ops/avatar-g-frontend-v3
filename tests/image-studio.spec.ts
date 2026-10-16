import { test, expect, type Page } from '@playwright/test';
import { imageCopy } from '../components/studio/image/copy';
import type { ImageAsset } from '../lib/image/studio/client';
const evidence = process.env.IMAGE_STUDIO_EVIDENCE_DIR || 'docs/handoffs/image-studio/evidence';

const model = { id: 'gemini-3.1-flash-image', label: 'Gemini image', operations: ['generate', 'edit', 'replace_background', 'character_variation', 'product_scene'],
  aspects: ['1:1', '16:9', '9:16'], resolutions: ['1K', '2K', '4K'] };
async function setup(page: Page, locale: string) {
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  const jobs = new Map<string, Record<string, unknown>>();
  const assets = new Map<string, ImageAsset>();
  let index = 0;
  await page.addInitScript(() => {
    localStorage.setItem('myavatar-cookie-consent', 'necessary');
    localStorage.setItem('myavatar:tour-seen', '1'); localStorage.setItem('myavatar:welcomed', '1');
  });
  // Every API and external browser request is intercepted; no provider, storage or database is contacted.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { ok: false, error: 'test_unavailable' } });
    return route.continue();
  });
  await page.route('**/api/image/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : {};
    requests.push({ path, body });
    if (path.endsWith('/models')) return route.fulfill({ json: { userId: 'browser-test-owner', models: [model] } });
    if (path.endsWith('/commands')) {
      const id = '11111111-1111-4111-8111-' + String(++index).padStart(12, '0');
      return route.fulfill({ json: { ok: true, jobId: id, credits: 2, expiresAt: Date.now() + 600000,
        token: id + '-signed', plan: { v: 1, kind: 'image-studio-v1', request: body, transport: 'vertex', references: [] },
        supplementaryInstructions: ['Requested image operation: ' + body.operation + '.'] } });
    }
    if (path === '/api/image/jobs') {
      const id = String(body.token).replace('-signed', '');
      const request = (body.plan as { request: Record<string, unknown> }).request;
      const job = { jobId: id, status: 'running', stage: 'generating', cancellable: true, settlementPending: false, result: null, error: null, request };
      if (!jobs.has(id)) jobs.set(id, job);
      return route.fulfill({ json: jobs.get(id) });
    }
    const id = path.split('/')[4]!;
    const asset = assets.get(id);
    if (path.startsWith('/api/image/assets/') && asset) {
      if (path.endsWith('/versions')) return route.fulfill({ json: { current: { id, parentJobId: asset.request.parentJobId ?? null,
        status: 'completed', operation: asset.request.operation, prompt: asset.request.originalPrompt }, ancestors: [], children: [], moreAncestors: false, moreChildren: false } });
      return route.fulfill({ json: asset });
    }
    const job = jobs.get(id);
    if (path.endsWith('/cancel') && job) {
      Object.assign(job, { status: 'cancelled', stage: 'cancelled', cancellable: false, settlementPending: false });
      return route.fulfill({ json: job });
    }
    if (path.startsWith('/api/image/jobs/') && job) return route.fulfill({ json: job });
    return route.fulfill({ status: 404, json: { ok: false, error: 'not_found' } });
  });
  await page.route('**/api/studio/library**', route => route.fulfill({ json: { items: [...assets.values()].map(a => ({
    id: a.id, kind: 'image', url: a.image.url, prompt: a.request.originalPrompt,
  })) } }));
  await page.route('**/image-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#338fe8"/></svg>' }));
  const workspace = await openStudio(page, locale);
  return { workspace, requests, jobs, assets };
}
/** The Image tool is one panel (GG's iPhone, 2026-10-16); the studio opens only from its own link. */
async function openStudio(page: Page, locale: string) {
  await page.goto('/' + locale + '/dashboard?tool=image&imageStudio=1', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60000 });
  const workspace = page.getByTestId('image-workspace');
  await expect(workspace).toBeVisible({ timeout: 20000 });
  return workspace;
}

for (const locale of ['en', 'ka', 'ru']) {
  test(locale + ': one-window quote, explicit confirmation, refresh recovery and cancellation', async ({ page }) => {
    await page.setViewportSize(locale === 'en' ? { width: 1365, height: 900 } : { width: 390, height: 844 });
    const { workspace, requests } = await setup(page, locale);
    const c = imageCopy(locale);
    const prompt = '  თბილისი ღამით — უცვლელი ტექსტი\n  ';
    await workspace.getByLabel(c.t('prompt'), { exact: true }).fill(prompt);
    await workspace.getByRole('button', { name: c.t('quote'), exact: true }).click();
    const confirm = workspace.getByRole('button', { name: c.t('confirm'), exact: true });
    await expect(confirm).toBeVisible();
    expect(requests.filter(x => x.path === '/api/image/jobs')).toHaveLength(0);
    expect(requests.find(x => x.path.endsWith('/commands'))!.body.originalPrompt).toBe(prompt);
    await confirm.click();
    await expect(workspace.getByTestId('image-job')).toContainText(c.stage('generating'));
    expect(requests.filter(x => x.path === '/api/image/jobs')).toHaveLength(1);
    expect(await workspace.locator('input:not([type=file]), textarea, select').evaluateAll(els =>
      els.every(el => parseFloat(getComputedStyle(el).fontSize) >= 16))).toBe(true);
    expect(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await workspace.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
    await page.screenshot({ path: evidence + '/image-workspace-' + locale + '.png' });
    await openStudio(page, locale); // a fresh load in the same tab: the batch comes back from the tab's storage
    await expect(page.getByTestId('image-job')).toContainText(c.stage('generating'));
    expect(requests.filter(x => x.path === '/api/image/jobs')).toHaveLength(1);
    await page.getByTestId('image-workspace').getByRole('button', { name: c.t('cancel'), exact: true }).click();
    await expect(page.getByTestId('image-job')).toContainText(c.stage('cancelled'));
    await page.getByTestId('image-workspace').getByRole('button', { name: c.t('close'), exact: true }).click();
    // Close returns to the Image tool's Create screen.
    await expect(page.getByTestId('image-create-panel')).toBeVisible();
  });
}
test('four quoted variants start sequentially; completed tiles never start again', async ({ page }) => {
  const { workspace, requests, jobs } = await setup(page, 'en');
  await workspace.getByLabel('Prompt / Agent G command', { exact: true }).fill('Four product ideas');
  await workspace.getByLabel('Variations', { exact: true }).selectOption('4');
  await workspace.getByRole('button', { name: 'Review plan and price', exact: true }).click();
  await expect(workspace).toContainText('4 × 2 = 8 credits');
  await workspace.getByRole('button', { name: 'Confirm and start', exact: true }).click();
  for (let n = 1; n <= 4; n++) {
    await expect.poll(() => requests.filter(x => x.path === '/api/image/jobs').length).toBe(n);
    const job = [...jobs.values()][n - 1]!;
    Object.assign(job, { status: 'completed', stage: 'completed', cancellable: false });
  }
  await expect(workspace.getByTestId('image-job').last()).toContainText('Completed');
  expect(requests.filter(x => x.path === '/api/image/jobs')).toHaveLength(4);
  expect(new Set(requests.filter(x => x.path === '/api/image/jobs').map(x => x.body.token)).size).toBe(4);
});

test('Library → preview → owned edit stays in One Window with keyboard confirmation and original reference', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { workspace, requests, jobs, assets } = await setup(page, 'en');
  const id = '22222222-2222-4222-8222-222222222222';
  const source: ImageAsset = { id, request: { v: 1, operation: 'generate', originalPrompt: 'Original product', instructions: [],
    references: [], modelId: model.id, aspectRatio: '1:1', resolution: '1K', count: 1, locale: 'en' },
    image: { path: 'image-studio/browser-test-owner/' + id + '/result.png', url: '/image-fixture.svg', width: 1024, height: 1024,
      bytes: 100, mime: 'image/png', digest: 'a'.repeat(64) } };
  assets.set(id, source);
  await workspace.getByRole('button', { name: 'My images', exact: true }).click();
  await workspace.getByRole('region', { name: 'My images', exact: true }).getByRole('button', { name: 'Original product' }).click();
  await expect(workspace.getByText('Version history', { exact: true })).toBeVisible();
  const preview = workspace.getByRole('region', { name: 'Result', exact: true });
  await preview.getByRole('button', { name: 'Edit this version', exact: true }).click();
  await expect(workspace.getByLabel('Operation', { exact: true })).toHaveValue('edit');
  await workspace.getByLabel('Role 1', { exact: true }).selectOption('product');
  const prompt = '  Keep packaging; replace only the background\n';
  await workspace.getByLabel('Prompt / Agent G command', { exact: true }).fill(prompt);
  await workspace.getByRole('button', { name: 'Review plan and price', exact: true }).click();
  const confirm = workspace.getByRole('button', { name: 'Confirm and start', exact: true });
  await expect(confirm).toBeVisible();
  expect(requests.filter(r => r.path === '/api/image/jobs')).toHaveLength(0);
  const quoted = requests.find(r => r.path.endsWith('/commands'))!.body;
  expect(quoted).toMatchObject({ operation: 'edit', originalPrompt: prompt, parentJobId: id,
    references: [{ role: 'product', asset: { kind: 'result', id } }] });
  await confirm.focus();
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => requests.filter(r => r.path === '/api/image/jobs').length).toBe(1);
  const job = [...jobs.values()][0]!;
  Object.assign(job, { status: 'completed', stage: 'completed', cancellable: false,
    result: { ...source.image, originalPrompt: prompt, parentJobId: id } });
  assets.set(job.jobId as string, { ...source, id: job.jobId as string, request: quoted as unknown as ImageAsset['request'] });
  await expect(workspace.getByTestId('image-job')).toContainText('Completed');
  await workspace.getByTestId('image-job').getByRole('button', { name: 'Result', exact: true }).click();
  await workspace.getByRole('button', { name: 'Compare with source', exact: true }).click();
  await expect(workspace.getByRole('heading', { name: 'Before', exact: true })).toBeVisible();
  expect(source.request.originalPrompt).toBe('Original product');
  expect(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: evidence + '/image-library-edit-mobile.png' });
});
