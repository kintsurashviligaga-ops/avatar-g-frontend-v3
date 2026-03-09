import { chromium, devices } from 'playwright';

const url = 'https://www.myavatar.ge/ka';
const iphone = devices['iPhone 13'];

async function run() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext({ ...iphone });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(1200);

  // Test top-level CTA and navbar interactions on touch.
  const selectors = [
    'a[href="/ka/services"]',
    'a[href="/ka/services/avatar"]',
    'a[href="/ka/login"]',
    'a[href="/ka/signup"]',
    'a[href*="/ka/services/"]',
    'button:has-text("რეკომენდებული სერვისის გახსნა")',
    'a:has-text("workflow-ის გახსნა")',
  ];

  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    const exists = await loc.count();
    if (!exists) {
      console.log(JSON.stringify({ sel, exists: false }));
      continue;
    }

    const visible = await loc.isVisible().catch(() => false);
    if (!visible) {
      console.log(JSON.stringify({ sel, exists: true, visible: false }));
      continue;
    }

    const before = page.url();
    let ok = true;
    let err = null;
    try {
      await loc.tap({ timeout: 3500 });
    } catch (e) {
      ok = false;
      err = String(e);
    }

    await page.waitForTimeout(1200);
    const after = page.url();
    console.log(JSON.stringify({ sel, ok, err, before, after, navigated: before !== after }));

    if (before !== after && after.startsWith('https://www.myavatar.ge')) {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    }
  }

  console.log('ERRORS', JSON.stringify(errors.slice(0, 20), null, 2));

  await context.close();
  await browser.close();
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
