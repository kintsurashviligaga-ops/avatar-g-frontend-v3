import { chromium } from 'playwright';

const baseUrl = process.env.VERIFY_BASE_URL || 'https://www.myavatar.ge';

const checks = [
  {
    locale: 'en',
    path: '/en',
    texts: ['Landing Control Center', 'Planning Options', 'Open Agent G Workspace'],
  },
  {
    locale: 'ka',
    path: '/ka',
    texts: ['Landing მართვის ცენტრი', 'დაგეგმვის პარამეტრები', 'Agent G სამუშაო სივრცის გახსნა'],
  },
  {
    locale: 'ru',
    path: '/ru',
    texts: ['Центр управления Landing', 'Параметры планирования', 'Открыть рабочее пространство Agent G'],
  },
];

async function withTimeout(label, ms, fn) {
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function run() {
  console.log(`[verify] Starting hydrated i18n verification for ${baseUrl}`);

  const watchdog = setTimeout(() => {
    console.error('[verify] Global timeout reached (480s). Exiting.');
    process.exit(1);
  }, 480000);

  const launchCandidates = [
    { name: 'msedge', options: { channel: 'msedge' } },
    { name: 'chrome', options: { channel: 'chrome' } },
    { name: 'bundled', options: {} },
  ];

  let browser;
  let context;

  for (const candidate of launchCandidates) {
    try {
      console.log(`[verify] Launch attempt: ${candidate.name}`);
      browser = await chromium.launch({
        headless: true,
        timeout: 60000,
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
        ...candidate.options,
      });
      context = await browser.newContext();
      console.log(`[verify] Browser launched via ${candidate.name}`);
      break;
    } catch (error) {
      console.error(`[verify] Launch failed via ${candidate.name}:`, error);
      if (browser) {
        await browser.close().catch(() => undefined);
        browser = undefined;
      }
    }
  }

  if (!browser || !context) {
    throw new Error('Unable to launch a usable browser (msedge/chrome/bundled)');
  }

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  console.log('[verify] Browser/page ready');

  let failed = false;

  try {
    for (const item of checks) {
      const url = `${baseUrl}${item.path}`;

      try {
        console.log(`[${item.locale}] Visiting ${url}`);

        await withTimeout(`[${item.locale}] goto`, 65000, () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }));

        // `networkidle` can hang on pages with long-lived requests; keep it best-effort.
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(1000);

        for (const text of item.texts) {
          const visible = await withTimeout(`[${item.locale}] textCheck`, 12000, () =>
            page.getByText(text, { exact: false }).first().isVisible().catch(() => false)
          );
          if (visible) {
            console.log(`[${item.locale}] PASS: ${text}`);
          } else {
            failed = true;
            console.log(`[${item.locale}] FAIL: ${text}`);
          }
        }
      } catch (error) {
        failed = true;
        console.error(`[${item.locale}] ERROR:`, error);
      }
    }
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    clearTimeout(watchdog);
  }

  if (failed) {
    process.exit(1);
  }

  console.log('Hydrated i18n verification passed for all locales.');
}

run().catch((error) => {
  console.error('verify-i18n-hydrated failed:', error);
  process.exit(1);
});
