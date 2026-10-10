import { expect, test, type Page } from '@playwright/test';

/**
 * The Interior designer's „3D plan", end to end in the browser: a render, the plan made for it, and the plan in the Library.
 *  · the panel renders a room (the image route is answered here, nothing is generated);
 *  · „3D plan" on the finished tile sends the room photo AND the render to file the plan under (`coverUrl`), and the plan
 *    shows under the tile;
 *  · the Library's Image tab asks for pictures and 3D plans, shows the plan with its render and a „3D plan" badge, and
 *    opens the plan on the card.
 * The network is the dummy-Supabase dev server, so the session is pinned in the page (`<html data-authed="1">`) and every
 * paid route is fulfilled by the test: the charge, refund and filing are covered by the route's jest suite
 * (app/api/orchestrator/interior/produce/route.test.ts).
 */
const RENDER = 'https://media.test/room-render.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const GEOMETRY = { roomType: 'living room', floor: { widthM: 5, depthM: 4 }, wallHeightM: 2.7, walls: [{ lengthM: 5 }, { lengthM: 4 }, { lengthM: 5 }, { lengthM: 4 }], openings: [{ type: 'window', wall: 0, widthM: 1.2, heightM: 1.4, offsetM: 1 }], confidence: 0.8 };
const STYLE = { styleName: 'Japandi', palette: ['#e8e2d6', '#cfc4b0', '#7c6a56'], materials: ['oak'], lighting: 'warm' };

async function pinSession(page: Page) {
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

test.use({ viewport: { width: 1280, height: 800 } });

test('a 3D plan is made for a render and filed to the Library with it', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* private mode */ }
  });
  await page.route('https://media.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('**/api/nanobanana/image', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, url: RENDER }) }));
  await page.route('**/api/orchestrator/jobs', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  const planBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/orchestrator/interior/produce', async (r) => {
    planBodies.push(r.request().postDataJSON() as Record<string, unknown>);
    const events = [
      { stage: 'extracting', pct: 10, ticker: '[Extracting…]' },
      { stage: 'geometry', pct: 45 },
      { stage: 'completed', pct: 100, geometry: GEOMETRY, style: STYLE, walkthrough: [], degradedGeometry: false, url: RENDER },
    ];
    await r.fulfill({ status: 200, contentType: 'text/event-stream', body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') });
  });
  const libraryKinds: Array<string | null> = [];
  await page.route('**/api/studio/library**', async (r) => {
    const kind = new URL(r.request().url()).searchParams.get('kind');
    libraryKinds.push(kind);
    const items = kind?.split(',').includes('interior')
      ? [{ id: 'intr_1', kind: 'interior', url: RENDER, prompt: 'Japandi style, Living room', orientation: 'landscape', createdAt: new Date().toISOString(), plan: { geometry: GEOMETRY, style: STYLE } }]
      : [];
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) });
  });

  // ── The render ────────────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto('/en/dashboard?tool=interior', { waitUntil: 'load' });
  const panel = page.getByTestId('interior-panel');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await pinSession(page);
  await page.getByTestId('interior-file').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('interior-photo')).toHaveCount(1);
  await page.getByTestId('interior-generate').click();
  const tile = page.locator('[data-testid="shoot-tile"][data-state="ready"]');
  await expect(tile).toHaveCount(1, { timeout: 30_000 });

  // ── The 3D plan, for that render ──────────────────────────────────────────────────────────────────────────────────
  await tile.getByTestId('tile-plan3d').click();
  await expect(page.getByTestId('plan-ready')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('plan-ready')).toContainText('Japandi');
  expect(planBodies).toHaveLength(1);
  expect(planBodies[0].coverUrl).toBe(RENDER);
  expect(String((planBodies[0].imageUrls as string[])[0])).toMatch(/^data:image\//);

  // ── The Library ───────────────────────────────────────────────────────────────────────────────────────────────────
  await page.goto('/en/library', { waitUntil: 'load' });
  await page.getByRole('button', { name: /^Image$/ }).click();
  await expect.poll(() => libraryKinds).toContain('image,interior');
  const card = page.getByAltText('Japandi style, Living room');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toHaveAttribute('src', RENDER);
  await expect(page.getByText('3D plan', { exact: true })).toBeVisible();
  await page.getByTestId('library-plan-toggle').click();
  await expect(page.getByTestId('plan-ready')).toBeVisible();
  await expect(page.getByTestId('plan-ready')).toContainText('Japandi');
  expect(libraryKinds[0]).toBe('film,avatar'); // the Video tab opens first: films and avatar videos
});
