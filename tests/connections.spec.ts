import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Settings → Connections (Omnichannel B/H) in a real browser, the server mocked: what the four rows say comes from
 * /api/agent-g/channels (lib/connections/model.ts decides it on the server; its own tests pin that), so here the browser
 * half is held to the owner's rules:
 *
 *   · four rows in a fixed order, each with one of four plain words in the page's language (KA / EN / RU), and nothing
 *     technical on the page (no env names, no table names, no full phone number);
 *   · on a phone, a tablet and a desktop, in light and dark, nothing spills sideways, a row is at least 56 px tall and
 *     every button inside an opened row at least 44 px;
 *   · Notifications: the site is always on and is not a switch; WhatsApp is a switch per kind of news, saved at once,
 *     put back with a plain message when the save fails; Telegram, SMS and calls offer nothing to press;
 *   · a guest is asked to sign in, and the phone and Telegram rows stay „unavailable" whoever looks.
 */

type Lang = 'ka' | 'en' | 'ru';

const WORDS: Record<Lang, { connected: string; unavailable: string; on: string; signin: string; laterPlaces: RegExp }> = {
  ka: { connected: 'დაკავშირებულია', unavailable: 'დროებით მიუწვდომელია', on: 'ჩართულია', signin: 'შედი ანგარიშზე', laterPlaces: /Telegram, SMS და ზარი/ },
  en: { connected: 'Connected', unavailable: 'Temporarily unavailable', on: 'On', signin: 'Sign in', laterPlaces: /Telegram, SMS and calls are temporarily unavailable/ },
  ru: { connected: 'Подключено', unavailable: 'Временно недоступно', on: 'Включены', signin: 'Войдите', laterPlaces: /Telegram, SMS/ },
};

const MASKED = '+995 5•• ••• •12';
const MEMBER = {
  guest: false,
  connections: [
    { id: 'phone', state: 'unavailable' },
    { id: 'whatsapp', state: 'connected', detail: MASKED },
    { id: 'telegram', state: 'unavailable' },
    { id: 'notifications', state: 'on' },
  ],
};
const GUEST = {
  guest: true,
  connections: [
    { id: 'phone', state: 'unavailable' },
    { id: 'whatsapp', state: 'signin' },
    { id: 'telegram', state: 'unavailable' },
    { id: 'notifications', state: 'signin' },
  ],
};
const PREFS = {
  events: {
    task_completed: ['site', 'whatsapp'],
    approval_required: ['site', 'whatsapp'],
    needs_attention: ['site'],
    scheduled_report: ['site'],
    reminder: ['site'],
  },
  callWindow: { from: '10:00', to: '20:00' },
  timezone: 'Asia/Tbilisi',
  agentCalls: { enabled: false, perCallMinutes: 15, dailyMinutes: 30 },
};

interface Calls { puts: Array<Record<string, unknown>> }

async function open(page: Page, o: { lang: Lang; theme: 'light' | 'dark'; guest?: boolean; failSave?: boolean }): Promise<Calls> {
  const calls: Calls = { puts: [] };
  await page.addInitScript((th) => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
      localStorage.setItem('myavatar-theme', th);
    } catch { /* private mode */ }
  }, o.theme);
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/agent-g/channels', (r) => json(r, { ok: true, data: o.guest ? GUEST : MEMBER }));
  await page.route('**/api/agent-g/whatsapp/link', (r) => json(r, { ok: true, data: o.guest
    ? { guest: true, configured: true, available: true, linked: null }
    : { guest: false, configured: true, available: true, linked: { number: MASKED, linked_at: '2026-10-10T12:00:00Z', alerts: true } } }));
  // The account cards below Connections: a guest gets 401 (as on the Preview), a member a balance and an invite code.
  await page.route('**/api/credits/balance', (r) => (o.guest ? json(r, { error: 'Unauthorized' }, 401) : json(r, { balance: 80, monthlyAllowance: 100, resetAt: null })));
  await page.route('**/api/credits/history**', (r) => (o.guest ? json(r, { error: 'Unauthorized' }, 401) : json(r, { items: [] })));
  await page.route('**/api/referral/status', (r) => (o.guest ? json(r, { error: 'Unauthorized' }, 401) : json(r, { code: 'GG50', shareUrl: 'https://myavatar.ge/r/GG50', totalReferrals: 0, creditsEarned: 0 })));
  let prefs = structuredClone(PREFS);
  await page.route('**/api/notifications/preferences', async (r) => {
    if (r.request().method() === 'GET') return json(r, { ok: true, data: { prefs, saved: true, available: { whatsapp: !o.guest, telegram: false, sms: false, call: false } } });
    const body = r.request().postDataJSON() as { prefs: typeof PREFS };
    calls.puts.push(body as unknown as Record<string, unknown>);
    await new Promise((res) => setTimeout(res, 250));
    if (o.failSave) return json(r, { ok: false, error: 'x' }, 500);
    prefs = body.prefs;
    return json(r, { ok: true, data: { prefs } });
  });
  await page.goto(`/${o.lang}/settings`);
  await expect(page.getByTestId('connections-section')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('conn-row-notifications')).toBeVisible({ timeout: 20_000 });
  return calls;
}

async function fitsTheWindow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Every button inside the section is at least `min` px tall (the row buttons at least 56). */
async function tapTargets(page: Page): Promise<void> {
  const section = page.getByTestId('connections-section');
  for (const id of ['phone', 'whatsapp', 'telegram', 'notifications']) {
    const box = await section.getByTestId(`conn-row-${id}`).locator('> button').boundingBox();
    expect(box!.height, `${id} row`).toBeGreaterThanOrEqual(56);
  }
  const heights = await section.locator('button:visible').evaluateAll((els) => els.map((e) => [(e as HTMLElement).innerText.trim().slice(0, 30), e.getBoundingClientRect().height] as const));
  for (const [label, h] of heights) expect(h, `button „${label}"`).toBeGreaterThanOrEqual(44);
}

/**
 * No text runs under its neighbour: a row's name never under its status word, a kind of news never under its chips.
 * The TEXT's own extent is measured (a Range), not its box, because a squeezed flex item keeps a small box while its
 * words spill out of it.
 */
async function nothingOverlaps(page: Page): Promise<void> {
  const hits = await page.getByTestId('connections-section').evaluate((root) => {
    const out: string[] = [];
    const text = (e: Element) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); };
    const meets = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    root.querySelectorAll('[data-testid^="conn-row-"] > button').forEach((b) => {
      const label = b.querySelector('[data-testid^="conn-label-"]');
      const pill = b.querySelector('[data-testid^="conn-state-"]');
      if (label && pill && meets(text(label), pill.getBoundingClientRect())) out.push(`row ${label.textContent}`);
      if (label && text(label).right > b.getBoundingClientRect().right + 1) out.push(`row ${label.textContent} spills`);
    });
    root.querySelectorAll('[data-testid^="notify-row-"]').forEach((li) => {
      const [label, chips] = [li.firstElementChild, li.lastElementChild];
      if (label && chips && label !== chips && meets(text(label), chips.getBoundingClientRect())) out.push(`news ${label.textContent}`);
    });
    return out;
  });
  expect(hits).toEqual([]);
}

async function nothingTechnical(page: Page): Promise<void> {
  const text = await page.getByTestId('connections-section').innerText();
  expect(text).not.toMatch(/WHATSAPP_|TELEGRAM_|DELIVERY_OUTBOX|agent_g_channels|push_subscriptions|migration|not_configured|\+995\s?5\d{2}\s?\d{3}\s?\d{3}/i);
}

const SCREENS: Array<{ name: string; width: number; height: number; lang: Lang; theme: 'light' | 'dark' }> = [
  { name: 'phone-ka-dark', width: 390, height: 844, lang: 'ka', theme: 'dark' },
  { name: 'phone-en-light', width: 360, height: 780, lang: 'en', theme: 'light' },
  { name: 'tablet-ru-light', width: 820, height: 1180, lang: 'ru', theme: 'light' },
  { name: 'desktop-ka-dark', width: 1280, height: 800, lang: 'ka', theme: 'dark' },
];

for (const s of SCREENS) {
  test.describe(`Connections on ${s.name}`, () => {
    test.use({ viewport: { width: s.width, height: s.height } });

    test('four rows, four words, nothing technical; WhatsApp and Notifications open in place; a press saves at once', async ({ page }) => {
      const w = WORDS[s.lang];
      const calls = await open(page, { lang: s.lang, theme: s.theme });
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(s.theme);

      const rows = page.locator('[data-testid^="conn-row-"]');
      expect(await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid))).toEqual(['conn-row-phone', 'conn-row-whatsapp', 'conn-row-telegram', 'conn-row-notifications']);
      await expect(page.getByTestId('conn-state-phone')).toHaveText(w.unavailable);
      await expect(page.getByTestId('conn-state-whatsapp')).toHaveText(w.connected);
      await expect(page.getByTestId('conn-state-telegram')).toHaveText(w.unavailable);
      await expect(page.getByTestId('conn-state-notifications')).toHaveText(w.on);
      await expect(page.getByTestId('conn-row-whatsapp')).toContainText(MASKED);
      await nothingTechnical(page);
      await fitsTheWindow(page);
      await tapTargets(page);
      await nothingOverlaps(page);
      await page.getByTestId('connections-section').screenshot({ path: `test-results/connections-${s.name}-1-rows.png` });

      // Phone and Telegram: one sentence, nothing to press.
      await page.getByTestId('conn-row-phone').locator('> button').click();
      await expect(page.getByTestId('conn-panel-phone').locator('button')).toHaveCount(0);

      // WhatsApp: the linked number (masked), the alerts switch and Disconnect, all reachable with a thumb.
      await page.getByTestId('conn-row-whatsapp').locator('> button').click();
      await expect(page.getByTestId('conn-panel-whatsapp').getByRole('switch')).toBeVisible();
      await tapTargets(page);
      await fitsTheWindow(page);

      // Notifications: the site always, WhatsApp per kind of news, the later places named and not offered.
      await page.getByTestId('conn-row-notifications').locator('> button').click();
      const panel = page.getByTestId('conn-panel-notifications');
      await expect(panel.getByTestId('notify-row-task_completed')).toBeVisible({ timeout: 10_000 });
      await expect(panel).toContainText(w.laterPlaces);
      const attention = panel.getByTestId('notify-row-needs_attention').locator('button[aria-pressed]');
      await expect(attention).toHaveAttribute('aria-pressed', 'false');
      await expect(panel.getByTestId('notify-row-task_completed').locator('button[aria-pressed]')).toHaveAttribute('aria-pressed', 'true');
      await tapTargets(page);
      await fitsTheWindow(page);
      await nothingOverlaps(page);
      await page.getByTestId('connections-section').screenshot({ path: `test-results/connections-${s.name}-2-notifications.png` });

      await attention.click();
      await expect(attention).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => calls.puts.length).toBe(1);
      const sent = calls.puts[0]!.prefs as typeof PREFS;
      expect(sent.events.needs_attention).toEqual(['site', 'whatsapp']);
      expect(sent.events.task_completed).toEqual(['site', 'whatsapp']); // nothing else moved
    });
  });
}

test.describe('Connections when a save fails, and for a guest', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a failed save puts the switch back and says so', async ({ page }) => {
    const calls = await open(page, { lang: 'en', theme: 'light', failSave: true });
    await page.getByTestId('conn-row-notifications').locator('> button').click();
    const panel = page.getByTestId('conn-panel-notifications');
    const done = panel.getByTestId('notify-row-task_completed').locator('button[aria-pressed]');
    await expect(done).toHaveAttribute('aria-pressed', 'true');
    await done.click();
    await expect.poll(() => calls.puts.length).toBe(1);
    await expect(done).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByRole('alert')).toBeVisible();
  });

  test('a guest is asked to sign in; phone and Telegram stay unavailable', async ({ page }) => {
    await open(page, { lang: 'ka', theme: 'dark', guest: true });
    const w = WORDS.ka;
    await expect(page.getByTestId('conn-state-phone')).toHaveText(w.unavailable);
    await expect(page.getByTestId('conn-state-telegram')).toHaveText(w.unavailable);
    await expect(page.getByTestId('conn-state-whatsapp')).toHaveText(w.signin);
    await expect(page.getByTestId('conn-state-notifications')).toHaveText(w.signin);
    await page.getByTestId('conn-row-whatsapp').locator('> button').click();
    await expect(page.getByTestId('conn-panel-whatsapp').getByRole('button')).toHaveCount(1);
    await tapTargets(page);
    await fitsTheWindow(page);
    await nothingOverlaps(page);
    await page.getByTestId('connections-section').screenshot({ path: 'test-results/connections-phone-ka-dark-guest.png' });
    // Below Connections a guest gets one sign-in card: no balance error, no invite error in English, no Delete button
    // (all three were on the cert Preview for a guest, 2026-10-10).
    await expect(page.getByTestId('settings-signin')).toBeVisible();
    await expect(page.getByText('ანგარიშის წაშლა')).toHaveCount(0);
    await expect(page.getByText('მონაცემები ვერ მოვიდა.')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Failed to load');
    await page.getByTestId('settings-signin').screenshot({ path: 'test-results/settings-phone-ka-dark-guest-account.png' });
  });
});
