/**
 * Pays an order on Bank of Georgia's own payment page in a headless Chromium — for bog-sandbox.e2e.test.ts, with BOG's
 * published SANDBOX test cards only. BOG's page is BOG's: its fields are found the way a browser's autofill finds them
 * (autocomplete cc-number / cc-exp / cc-csc first, then common names), in the page or any of its frames, and every
 * step is photographed into `shotsDir` so a change on BOG's side shows up as a picture, not a guess.
 */
import path from 'node:path';
import type { Browser, Frame, Locator, Page } from 'playwright-core';

const PAN = ['input[autocomplete="cc-number"]', 'input[name*="pan" i]', 'input[id*="pan" i]', 'input[name*="cardnumber" i]', 'input[name*="card_number" i]', 'input[id*="card" i][id*="number" i]', 'input[placeholder*="0000"]'];
const EXP = ['input[autocomplete="cc-exp"]', 'input[name*="expir" i]', 'input[id*="expir" i]', 'input[name*="exp" i]', 'input[placeholder*="MM" i]', 'input[placeholder*="თთ"]'];
const EXP_MONTH = ['input[autocomplete="cc-exp-month"]', 'input[name*="month" i]', 'select[name*="month" i]'];
const EXP_YEAR = ['input[autocomplete="cc-exp-year"]', 'input[name*="year" i]', 'select[name*="year" i]'];
const CVV = ['input[autocomplete="cc-csc"]', 'input[name*="cvv" i]', 'input[name*="cvc" i]', 'input[id*="cvv" i]', 'input[id*="cvc" i]', 'input[placeholder*="CVV" i]', 'input[placeholder*="CVC" i]'];
const HOLDER = ['input[autocomplete="cc-name"]', 'input[name*="holder" i]', 'input[id*="holder" i]'];
const PAY = /^\s*(pay|გადახდა|გადაიხადე|დადასტურება|confirm|submit|continue|გაგრძელება)/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PayOptions {
  /** Our return links' origin (BOG sends the browser there when it is done); the request is caught, never sent. */
  returnOrigin: string;
  /** Where screenshots go; none when empty. */
  shotsDir?: string;
  /** How long to wait for BOG to send the browser back after the pay button. */
  backWithinMs?: number;
}

let shot = 0;
async function snap(page: Page, dir: string | undefined, label: string) {
  if (!dir) return;
  shot += 1;
  await page.screenshot({ path: path.join(dir, `${String(shot).padStart(2, '0')}-${label}.png`), fullPage: true }).catch(() => undefined);
}

/** The first visible match among `selectors`, in the page or any of its frames (card fields often live in an iframe). */
async function find(page: Page, selectors: string[]): Promise<Locator | null> {
  const frames: Frame[] = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
  for (const sel of selectors) {
    for (const f of frames) {
      const loc = f.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
  }
  return null;
}

/** The first visible, enabled pay/confirm button in the page or any of its frames. */
async function payButton(page: Page): Promise<Locator | null> {
  for (const f of [page.mainFrame(), ...page.frames().filter((x) => x !== page.mainFrame())]) {
    const loc = f.getByRole('button', { name: PAY }).first();
    if ((await loc.isVisible().catch(() => false)) && (await loc.isEnabled().catch(() => false))) return loc;
  }
  return null;
}

/**
 * Pays `redirectUrl` with `card` (expiry 12/30, CVV 123 — BOG's sandbox takes any). Resolves with the return link BOG
 * sent the browser to (…&pay=success / …&pay=failed), or null when it did not within the time. Whatever it returns,
 * the ORDER's fate is read from BOG's receipt afterwards; this only drives the page.
 */
export async function payOnBogPage(browser: Browser, redirectUrl: string, card: string, label: string, opts: PayOptions): Promise<string | null> {
  const page = await browser.newPage({ locale: 'ka-GE' });
  let returned: string | null = null;
  await page.route(`${opts.returnOrigin}/**`, (route) => {
    returned = route.request().url();
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>back from BOG</p>' });
  });
  try {
    await page.goto(redirectUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
    await snap(page, opts.shotsDir, `${label}-page`);
    let pan = await find(page, PAN);
    if (!pan) {
      // A method picker first: choose the card.
      const cardTab = page.getByText(/ბარათ|card/i).first();
      if (await cardTab.isVisible().catch(() => false)) await cardTab.click().catch(() => undefined);
      await sleep(1_500);
      pan = await find(page, PAN);
    }
    if (!pan) {
      await snap(page, opts.shotsDir, `${label}-no-card-field`);
      throw new Error('no card-number field found on BOG’s page (see the screenshots)');
    }
    await pan.click();
    await pan.pressSequentially(card, { delay: 30 });
    const exp = await find(page, EXP);
    if (exp) {
      await exp.click();
      await exp.pressSequentially('1230', { delay: 30 });
    } else {
      const month = await find(page, EXP_MONTH);
      const year = await find(page, EXP_YEAR);
      if (!month || !year) throw new Error('no expiry field found on BOG’s page (see the screenshots)');
      await month.fill('12').catch(() => month.selectOption('12'));
      await year.fill('30').catch(() => year.selectOption({ index: 5 }));
    }
    const cvv = await find(page, CVV);
    if (!cvv) throw new Error('no CVV field found on BOG’s page (see the screenshots)');
    await cvv.click();
    await cvv.pressSequentially('123', { delay: 30 });
    const holder = await find(page, HOLDER);
    if (holder) await holder.fill('SANDBOX TEST');
    await snap(page, opts.shotsDir, `${label}-filled`);
    const pay = await payButton(page);
    if (!pay) throw new Error('no pay button found on BOG’s page (see the screenshots)');
    await pay.click();

    // 3-D Secure or a confirmation step may follow: press its button (a few times at most), then wait for the way back.
    const end = Date.now() + (opts.backWithinMs ?? 90_000);
    let presses = 0;
    while (!returned && Date.now() < end) {
      await sleep(2_500);
      if (returned) break;
      await snap(page, opts.shotsDir, `${label}-after-${presses}`);
      const next = presses < 3 ? await payButton(page) : null;
      if (next) {
        presses += 1;
        await next.click().catch(() => undefined);
      }
    }
    if (!returned) await snap(page, opts.shotsDir, `${label}-end`);
    return returned;
  } finally {
    await page.close().catch(() => undefined);
  }
}
