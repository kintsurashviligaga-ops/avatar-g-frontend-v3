import { chromium } from 'playwright';

const base = 'https://www.myavatar.ge';
const paths = ['/en', '/en/services', '/en/services/avatar'];

function short(text, n = 160) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

const launchers = [
  { name: 'msedge', options: { channel: 'msedge' } },
  { name: 'chrome', options: { channel: 'chrome' } },
  { name: 'bundled', options: {} },
];

async function run() {
  let browser;
  for (const l of launchers) {
    try {
      browser = await chromium.launch({ headless: true, timeout: 45000, ...l.options });
      console.log('LAUNCHER', l.name);
      break;
    } catch {}
  }
  if (!browser) throw new Error('No browser launcher available');

  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  for (const path of paths) {
    const url = `${base}${path}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(600);

    console.log('\nPAGE', url);

    const candidates = page.locator('a[href], button');
    const count = await candidates.count();
    console.log('CANDIDATES', count);

    let tested = 0;
    for (let i = 0; i < count && tested < 12; i += 1) {
      const el = candidates.nth(i);
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;

      const text = short(await el.innerText().catch(() => ''));
      const href = await el.getAttribute('href').catch(() => null);
      const box = await el.boundingBox().catch(() => null);
      if (!box) continue;

      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      const top = await page.evaluate(({ x, y }) => {
        const n = document.elementFromPoint(x, y);
        if (!n) return null;
        const el = n;
        const cls = (el.getAttribute('class') || '').toString();
        return {
          tag: el.tagName,
          id: el.id || null,
          className: cls.slice(0, 120),
        };
      }, { x: cx, y: cy });

      const before = page.url();
      let clickOk = true;
      let clickErr = null;
      try {
        await el.click({ timeout: 2500 });
      } catch (e) {
        clickOk = false;
        clickErr = short(String(e), 220);
      }
      await page.waitForTimeout(500);
      const after = page.url();

      console.log(JSON.stringify({
        i,
        text,
        href,
        top,
        before,
        after,
        clickOk,
        clickErr,
        navigated: before !== after,
      }));

      if (before !== after && after.startsWith(base)) {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => undefined);
        await page.waitForTimeout(400);
      }

      tested += 1;
    }
  }

  console.log('\nPAGE_ERRORS', JSON.stringify(pageErrors.slice(0, 30), null, 2));
  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors.slice(0, 30), null, 2));

  await context.close();
  await browser.close();
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
