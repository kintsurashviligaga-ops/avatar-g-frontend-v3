import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage();

  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

  await page.goto('https://www.myavatar.ge/en', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(1200);

  const target = page.locator('a[href="/en/services"]').first();
  console.log('VISIBLE', await target.isVisible().catch(() => false));

  const before = page.url();
  await target.click({ timeout: 5000 });
  await page.waitForURL('**/en/services', { timeout: 15000 }).catch((e) => console.log('WAIT_URL_FAIL', String(e)));
  const after = page.url();
  console.log('URL_BEFORE', before);
  console.log('URL_AFTER', after);

  await browser.close();
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
