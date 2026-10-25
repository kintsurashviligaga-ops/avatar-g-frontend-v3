import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { quoteCredits } from '@/lib/credits/quote';
import {
  openStudio, pinSignedIn, say, attachClipsAndTrack, typeFilmPrompt, sendFilm, waitForBoard, cancelStoryboard,
  FILE_INPUT, JOB_ID, MASTER_URL, taskView, json, type Locale,
} from './video-core/_shared';
import { fakeMicrophone, signIn } from './fixtures/liveVoice';

/**
 * GG'S TEN SCENARIOS FOR THE UNIFIED COMPOSER (task „Chat-First Unified Service Experience", 2026-10-25, §10), in a real
 * browser on the six viewports of the test matrix. Every server route a scenario touches is mocked: nothing is generated,
 * uploaded to a provider, transcribed by Google or charged. A scenario that cannot run on a viewport (the desktop-only
 * check on a phone) is skipped with the reason, never passed.
 *
 *   1  a guest: „+" → a service → its format → a prompt; Send asks to sign in and nothing paid leaves the browser
 *   2  signed in: Video + a reference → the price on Send → the storyboard to approve, at the same price, nothing rendered
 *   3  an image, then „Send to video": the service changes, the conversation stays
 *   4  dictation start, stop and resume while the service's settings change between the two
 *   5  Avatar picked, then Live: a guest is sent to sign in (no microphone asked), a member gets the call, a refused mic stops it
 *   6  switching service while a job runs keeps the job's card, its stage, its Stop and its result
 *   7  what is closed is not offered: hidden services absent, a closed Veo tier and the paused image models not pickable
 *   8  KA → EN → RU → KA: the chat, the service, its settings and the unsent words come back each time
 *   9  a desktop needs no side settings panel: every service's settings are one layer in the composer's column
 *   10 a phone: the composer stays on screen, a smaller (keyboard) viewport keeps it, the sheets sit at the bottom
 */

type Vp = { name: string; width: number; height: number; phone: boolean; touch: boolean };
const VIEWPORTS: Vp[] = [
  { name: '375x667', width: 375, height: 667, phone: true, touch: true },
  { name: '390x844', width: 390, height: 844, phone: true, touch: true },
  { name: '768x1024', width: 768, height: 1024, phone: false, touch: true },
  { name: '1024x768', width: 1024, height: 768, phone: false, touch: false },
  { name: '1440x900', width: 1440, height: 900, phone: false, touch: false },
  { name: '1920x1080', width: 1920, height: 1080, phone: false, touch: false },
];
const desktopOf = (vp: Vp) => vp.width >= 1024; // OmniStudio's isDesktop: (min-width: 1024px)

const NAME = {
  chat: { ka: 'ჩატი', en: 'Chat', ru: 'Чат' },
  video: { ka: 'ვიდეო', en: 'Video', ru: 'Видео' },
  image: { ka: 'სურათი', en: 'Image', ru: 'Изображение' },
  music: { ka: 'მუსიკა', en: 'Music', ru: 'Музыка' },
  avatar: { ka: 'ავატარი', en: 'Avatar', ru: 'Аватар' },
} as const;
const LIVE = { ka: 'ცოცხალი ხმა', en: 'Live voice', ru: 'Живой голос' } as const;
const MIC = { ka: 'ხმის ჩაწერა', en: 'Record voice', ru: 'Записать голос' } as const;
const MENU = { ka: 'მენიუ', en: 'Menu', ru: 'Меню' } as const;
const LANG_ITEM = { ka: 'ქარ', en: 'ENG', ru: 'РУС' } as const;
/** GG's hidden tools (lib/catalog/nav): never in the picker. */
const HIDDEN = ['swap', 'photo', 'photoshoot', 'motion', 'dubbing', 'presentation'];
const POSTER = readFileSync(join(__dirname, '..', 'public', 'templates', 'image', 'poster.jpg'));

/**
 * Routes that would cost money if they ran (every generation family the studio calls). Counted, never allowed to matter:
 * a scenario asserts how many it saw (a guest: none; an unapproved storyboard: no render).
 */
const SPEND = new RegExp('^/api/(' + [
  'image', 'images', 'video/(?:assemble|remix|generate)', 'music', 'lipsync', 'generate', 'orchestrate', 'chat/orchestrate',
  'orchestrator/(?:produce|music|image|voice|avatar|interior)', 'nanobanana', 'heygen', 'genjutsu', 'ltx-video',
  'motion-control', 'pipeline', 'udio', 'replicate', 'elevenlabs', 'ai/(?:music|upscale|magic-wand|edit|edit-audio|edit-photo)',
  'avatar/(?:create|generate|enroll)', 'v2/(?:dubbing|model3d|presentation)',
].join('|') + ')(/|$)');
function watchSpend(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (r.method() === 'POST' && SPEND.test(u.pathname)) seen.push(u.pathname);
  });
  return seen;
}

/** A guest's first visit: the one-off banners answered, the chat model mocked, NOT signed in (ChatChrome publishes '0'). */
async function openAsGuest(page: Page, locale: Locale): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* private mode */ }
  });
  await page.route('**/api/chat/title', (r) => r.fulfill(json(200, { title: 't' })));
  await page.goto(`/${locale}/dashboard`);
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('html')).toHaveAttribute('data-authed', '0', { timeout: 20_000 });
}

/** „+" → the service, the way a person picks it; the picker closes and the composer names the service. */
async function pickService(page: Page, id: keyof typeof NAME | string, locale: Locale): Promise<void> {
  await page.getByTestId('plus').click();
  const picker = page.getByTestId('service-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId(`service-${id}`).click();
  await expect(page.getByTestId('tool-sheet')).toHaveCount(0);
  if (id in NAME && id !== 'chat') await expect(page.getByTestId('active-service-switch')).toContainText(NAME[id as keyof typeof NAME][locale]);
}

/** The video format through its quick chip (a sheet at every width). */
async function pickVideoFormat(page: Page, format: '16:9' | '9:16' | '1:1'): Promise<void> {
  await page.getByTestId('quick-video-format').click();
  const sheet = page.getByTestId('video-format-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByTestId(`video-format-${format.replace(':', '-')}`).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('quick-video-format')).toContainText(format);
}

/** The video length through its quick chip: a preset, then the sheet put away. */
async function pickVideoLength(page: Page, sec: number): Promise<void> {
  await page.getByTestId('quick-video-length').click();
  const sheet = page.getByTestId('video-duration-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByTestId(`video-preset-${sec}`).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('quick-video-length')).toContainText(String(sec));
}

/** The settings layer („⋯"), opened if it is shut. */
async function openLayer(page: Page): Promise<void> {
  const toggle = page.getByTestId('options-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', /^(true|false)$/);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.locator('#studio-settings')).toBeVisible();
}

/** The layer's box once its entrance animation has settled (it rises a few px into place). */
async function layerBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const layer = page.locator('#studio-settings');
  let last = '';
  let box = (await layer.boundingBox())!;
  await expect.poll(async () => {
    box = (await layer.boundingBox())!;
    const now = JSON.stringify(box);
    const same = now === last;
    last = now;
    return same;
  }, { timeout: 5_000, intervals: [120] }).toBe(true);
  return box;
}

const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Every visible control in the composer's row is at least 44 × 44 (touch viewports). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.getByTestId('composer-bar').evaluate((bar) => Array.from(bar.querySelectorAll('button')).filter((b) => {
    const r = b.getBoundingClientRect();
    const st = getComputedStyle(b);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && (r.width < 43.5 || r.height < 43.5);
  }).map((b) => `${b.getAttribute('data-testid') ?? b.getAttribute('aria-label') ?? b.textContent?.trim()} ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`));
}

/** Every finite animation on the page has finished: a sheet measured mid-rise reads half-faded (1.9 : 1) and misplaced. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
}

/**
 * Text in `scope` whose contrast with what is painted under it is below WCAG AA (4.5 : 1; 3 : 1 from 18.66 px bold or 24 px).
 * The background is every ancestor's colour composited from the page down; an element whose colour the browser does not
 * report as rgb() is left out (reported as `skipped`), never counted as passing.
 */
async function lowContrast(page: Page, scope: string): Promise<{ low: string[]; checked: number; skipped: number }> {
  return page.evaluate((sel) => {
    type C = { r: number; g: number; b: number; a: number };
    const parse = (s: string): C | null => {
      const m = /^rgba?\(([^)]+)\)$/.exec(s.trim());
      if (!m) return null;
      const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
      return p.length >= 3 && p.every((v) => Number.isFinite(v)) ? { r: p[0]!, g: p[1]!, b: p[2]!, a: p.length > 3 ? p[3]! : 1 } : null;
    };
    const over = (top: C, bot: C): C => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
    const lum = (c: C) => {
      const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
    };
    const roots = Array.from(document.querySelectorAll(sel));
    const low: string[] = [];
    let checked = 0; let skipped = 0;
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const seen = new Set<Element>();
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const el = t.parentElement;
        if (!el || seen.has(el) || !(t.textContent ?? '').trim()) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || el.closest('[aria-hidden="true"], :disabled, [aria-disabled="true"]')) continue;
        const chain: Element[] = [];
        for (let n: Element | null = el; n; n = n.parentElement) chain.unshift(n);
        let bg: C = { r: 0, g: 0, b: 0, a: 1 };
        let ok = true;
        for (const n of chain) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (!c) { ok = false; break; }
          if (c.a > 0) bg = over(c, bg);
        }
        const fg0 = parse(st.color);
        if (!ok || !fg0) { skipped += 1; continue; }
        let opacity = 1;
        for (const n of chain) opacity *= Number(getComputedStyle(n).opacity) || 1;
        const fg = over({ ...fg0, a: fg0.a * opacity }, bg);
        const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a) as [number, number];
        const ratio = (hi + 0.05) / (lo + 0.05);
        const px = parseFloat(st.fontSize);
        const large = px >= 24 || (px >= 18.66 && Number(st.fontWeight) >= 700);
        checked += 1;
        if (ratio < (large ? 3 : 4.5)) low.push(`${(t.textContent ?? '').trim().slice(0, 30)} ${ratio.toFixed(2)}:1 @${px}px`);
      }
    }
    return { low, checked, skipped };
  }, scope);
}

for (const vp of VIEWPORTS) {
  test.describe(`Unified composer · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.phone });
    const desktop = desktopOf(vp);

    test('1 · a guest picks a service from „+", changes its format and types a prompt; Send asks to sign in, nothing paid is sent', async ({ page }) => {
      const spend = watchSpend(page);
      await openAsGuest(page, 'ka');
      const box = page.getByTestId('composer-input');
      const chatPlaceholder = await box.getAttribute('placeholder');

      await page.getByTestId('plus').click();
      const picker = page.getByTestId('service-picker');
      await expect(picker.getByTestId('service-group-main')).toBeVisible();
      await expect(picker.getByTestId('service-group-create')).toBeVisible();
      await expect(picker.getByTestId('service-group-extra')).toBeVisible();
      await picker.getByTestId('service-video').click();
      await expect(page.getByTestId('tool-sheet')).toHaveCount(0);
      await expect(page.getByTestId('active-service-switch')).toContainText(NAME.video.ka);
      await expect(box).not.toHaveAttribute('placeholder', chatPlaceholder ?? '');

      await pickVideoFormat(page, '16:9');
      await box.fill('ზღვის პირას მზის ჩასვლა, ნელი კამერა');
      await expect(box).toHaveValue('ზღვის პირას მზის ჩასვლა, ნელი კამერა');
      await expect(page.getByTestId('run-button')).toBeVisible();
      await page.getByTestId('run-button').click();
      await expect(page.getByTestId('auth-sheet')).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('auth-sheet')).toBeHidden();
      // The composer kept everything: the service, its format and the words.
      await expect(page.getByTestId('active-service-switch')).toContainText(NAME.video.ka);
      await expect(page.getByTestId('quick-video-format')).toContainText('16:9');
      await expect(box).toHaveValue('ზღვის პირას მზის ჩასვლა, ნელი კამერა');
      expect(spend).toEqual([]);
      expect(await noSideways(page)).toBe(0);
    });

    test('2 · signed in: Video with a reference — the price on Send, then the storyboard to approve at that price; nothing renders', async ({ page }) => {
      const calls = await openStudio(page, { tool: null });
      await pickService(page, 'video', 'en');
      await pickVideoLength(page, 8);
      await page.locator(FILE_INPUT).setInputFiles([{ name: 'hero.jpg', mimeType: 'image/jpeg', buffer: POSTER }]);
      await expect(page.getByTitle('hero.jpg')).toBeVisible({ timeout: 10_000 });
      await typeFilmPrompt(page, 'The woman in the photo walks along the harbour at dawn');

      const send = page.getByTestId('run-button');
      const price = String(quoteCredits({ tool: 'video', seconds: 8, quality: 'fast' }));
      await expect(send).toHaveAttribute('data-price', price);
      await sendFilm(page);
      await waitForBoard(page, 'en', 1);
      const plan = calls.storyboard.find((b) => b.planOnly)!;
      expect(plan, 'the storyboard was planned').toBeTruthy();
      expect((plan.referenceImages as unknown[] | undefined)?.length ?? 0, 'the reference went with the plan').toBe(1);
      expect(plan.orientation).toBe('vertical');
      await expect(page.getByTestId('storyboard-generate')).toHaveAttribute('data-price', price);
      await expect(page.getByTestId('storyboard-generate')).toBeEnabled();
      // The approval stage: nothing dispatched, assembled or rendered until the person approves.
      expect(calls.orchestrate).toHaveLength(0);
      expect(calls.assemble).toHaveLength(0);
      expect(calls.directorRuns).toHaveLength(0);
      await cancelStoryboard(page);
      expect(calls.orchestrate).toHaveLength(0);
    });

    test('3 · an image, then „Send to video": the service is Video and the conversation is all still there', async ({ page }) => {
      const images: Array<Record<string, unknown>> = [];
      await page.route('**/api/nanobanana/image', async (route: Route) => {
        images.push((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
        await route.fulfill(json(200, { success: true, url: new URL('/templates/image/product.jpg', page.url()).toString(), model: 'mock' }));
      });
      await openStudio(page, { tool: null, reply: 'Happy to help — what shall we make?' });
      await say(page, 'Hello there');
      await expect(page.getByText('Happy to help — what shall we make?').last()).toBeVisible({ timeout: 20_000 });

      await pickService(page, 'image', 'en');
      await openLayer(page);
      const panel = page.locator('#studio-settings').getByTestId('image-create-panel');
      await panel.getByTestId('create-prompt').fill('A lighthouse on a cliff at sunset');
      await panel.getByTestId('create-generate').click();
      await expect.poll(() => images.length).toBe(1);
      const picture = page.locator('img[src*="/templates/image/product.jpg"]').filter({ visible: true }).last();
      await expect(picture).toBeVisible({ timeout: 20_000 });

      await page.getByRole('button', { name: 'Send to video', exact: true }).filter({ visible: true }).last().click();
      await expect(page.getByTestId('active-service-switch')).toContainText(NAME.video.en, { timeout: 15_000 });
      await expect(page.getByTestId('quick-video-length')).toContainText('8');
      // The same thread: the first message, its reply, the image prompt and the picture.
      for (const text of ['Hello there', 'Happy to help — what shall we make?', 'A lighthouse on a cliff at sunset']) {
        await expect(page.getByText(text, { exact: true }).first()).toBeAttached();
      }
      await expect(page.locator('img[src*="/templates/image/product.jpg"]').first()).toBeAttached();
      expect(images).toHaveLength(1);
    });

    test('3 · Interior mid-chat: the conversation stays on screen with the room tool under it, and comes back to the chat whole', async ({ page }) => {
      await openStudio(page, { tool: null, reply: 'Happy to help — what shall we make?' });
      await say(page, 'Hello there');
      await expect(page.getByText('Happy to help — what shall we make?').last()).toBeVisible({ timeout: 20_000 });
      await pickService(page, 'interior', 'en');
      // Until 2026-10-25 the room tool's result pane stood where the thread was.
      await expect(page.getByText('Hello there', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Happy to help — what shall we make?').last()).toBeVisible();
      await expect(page.getByTestId('shoot-empty')).toBeAttached();
      await pickService(page, 'chat', 'en');
      await expect(page.getByText('Hello there', { exact: true }).first()).toBeVisible();
      await expect(page.getByTestId('shoot-empty')).toHaveCount(0);
    });

    test('4 · dictation: start, stop, change the format, resume — both parts in the box, the setting kept', async ({ page }) => {
      // The recorder path (Web Speech removed): /api/voice/transcribe is the mock, the microphone a silent stream.
      await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        delete w.SpeechRecognition; delete w.webkitSpeechRecognition;
      });
      await fakeMicrophone(page);
      const finals = ['A quiet harbour at dawn', 'with three fishing boats'];
      let finalsServed = 0;
      const transcribe: string[] = [];
      await page.route('**/api/voice/transcribe**', async (route: Route) => {
        const final = route.request().url().includes('diag=1');
        transcribe.push(final ? 'final' : 'interim');
        const text = final ? finals[Math.min(finalsServed++, finals.length - 1)] : '';
        await route.fulfill(json(200, { text, language: 'en' }));
      });
      await openStudio(page, { tool: null });
      await pickService(page, 'video', 'en');
      const box = page.getByTestId('composer-input');
      const bar = page.getByTestId('composer-bar');

      await bar.getByRole('button', { name: MIC.en, exact: true }).click();
      const stop = bar.getByRole('button', { name: 'Stop', exact: true });
      await expect(stop).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(700);
      await stop.click();
      await expect(box).toHaveValue(/A quiet harbour at dawn/, { timeout: 15_000 });

      await pickVideoFormat(page, '16:9');
      await bar.getByRole('button', { name: MIC.en, exact: true }).click();
      await expect(stop).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(700);
      await stop.click();
      await expect(box).toHaveValue(/A quiet harbour at dawn.*with three fishing boats/, { timeout: 15_000 });
      await expect(page.getByTestId('quick-video-format')).toContainText('16:9');
      await expect(page.getByTestId('active-service-switch')).toContainText(NAME.video.en);
      expect(transcribe.filter((k) => k === 'final')).toHaveLength(2);
    });

    test('5 · Avatar, then Live: a guest is asked to sign in and no microphone is requested', async ({ page }) => {
      await page.addInitScript(() => {
        const md = navigator.mediaDevices;
        (window as unknown as { __gum: number }).__gum = 0;
        if (!md) return;
        const real = md.getUserMedia?.bind(md);
        md.getUserMedia = async (c) => { (window as unknown as { __gum: number }).__gum += 1; return real ? real(c) : Promise.reject(new Error('none')); };
      });
      await openAsGuest(page, 'en');
      await pickService(page, 'avatar', 'en');
      const live = page.getByTestId('composer-bar').getByRole('button', { name: LIVE.en, exact: true });
      await expect(live).toBeVisible();
      await live.click();
      await expect(page.getByTestId('auth-sheet')).toBeVisible({ timeout: 10_000 });
      expect(await page.evaluate(() => (window as unknown as { __gum: number }).__gum)).toBe(0);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('active-service-switch')).toContainText(NAME.avatar.en);
    });

    test('5 · Avatar, then Live: signed in, the call opens and ends back on Avatar; a refused microphone stops it with a message', async ({ page, baseURL }) => {
      await fakeMicrophone(page);
      let refuse = false;
      await page.exposeFunction('__refuseMic', () => refuse);
      await page.addInitScript(() => {
        const md = navigator.mediaDevices;
        if (!md) return;
        const fake = md.getUserMedia.bind(md);
        md.getUserMedia = async (c) => {
          const no = await (window as unknown as { __refuseMic: () => Promise<boolean> }).__refuseMic();
          if (no) throw new DOMException('denied', 'NotAllowedError');
          return fake(c);
        };
      });
      await signIn(page, baseURL);
      // Production today: no Gemini Live transport, the mint refuses and the turn-by-turn call opens (live-approved-screen).
      await page.route('**/api/voice/live', (r) => r.fulfill(json(503, { error: 'live_unavailable' })));
      await page.route('**/api/avatar/core', (r) => r.fulfill(json(404, {})));
      await page.route('**/api/chat/title', (r) => r.fulfill(json(200, { title: 't' })));
      await page.goto('/en/dashboard');
      await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 20_000 });
      await pickService(page, 'avatar', 'en');

      await page.getByTestId('composer-bar').getByRole('button', { name: LIVE.en, exact: true }).click();
      const call = page.locator('[role="dialog"][data-voice-status]');
      await expect(call).toBeVisible({ timeout: 45_000 });
      await expect(page.getByTestId('auth-sheet')).toHaveCount(0);
      await call.getByRole('button', { name: 'End call', exact: true }).click();
      await expect(call).toBeHidden({ timeout: 10_000 });
      await expect(page.getByTestId('active-service-switch')).toContainText(NAME.avatar.en);

      refuse = true;
      await page.getByTestId('composer-bar').getByRole('button', { name: LIVE.en, exact: true }).click();
      const refused = page.locator('[role="dialog"][data-live-call-ui], [role="dialog"][data-voice-status]').first();
      await expect(refused).toBeVisible({ timeout: 45_000 });
      await expect(refused.getByRole('alert').first()).toBeVisible({ timeout: 20_000 });
    });

    test('6 · switching service while a job runs keeps its card, stage and Stop; the result lands in the same thread', async ({ page }) => {
      const calls = await openStudio(page, { tool: null, taskViews: [taskView({ status: 'running', stage: 'stitch', pct: 55, attempt: 1, cancellable: true })] });
      await attachClipsAndTrack(page);
      await say(page, 'cut these to the music');
      const card = page.getByTestId('agent-montage-card');
      await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
      await page.getByTestId('agent-montage-start').click();
      await expect(card.locator('li[data-step="stitch"]')).toHaveAttribute('data-state', 'active', { timeout: 15_000 });

      await pickService(page, 'image', 'en');
      await page.keyboard.press('Escape'); // a settings layer the pick may have opened
      await pickService(page, 'music', 'en');
      await page.keyboard.press('Escape');
      await expect(card).toHaveAttribute('data-phase', 'running');
      await expect(card.locator('li[data-step="stitch"]')).toHaveAttribute('data-state', 'active');
      await expect(card).toBeAttached();
      // The job is still followed (read by id) after the switches.
      const before = calls.reads.length;
      await expect.poll(() => calls.reads.length, { timeout: 15_000 }).toBeGreaterThan(before);

      // The worker finishes: the master plays in the same thread, the card says done, the service is still Music.
      await page.route(/\/api\/tasks\?id=/, (r) => r.fulfill(json(200, { ok: true, task: taskView({ status: 'completed', pct: 100, result: { url: MASTER_URL, media: 'video', durationSec: 19.97, aspect: '16:9' } }) })));
      await expect(page.locator(`video[src^="${MASTER_URL}"]`)).toBeAttached({ timeout: 25_000 });
      await expect(card).toHaveAttribute('data-phase', 'done');
      await expect(page.getByTestId('active-service-switch')).toContainText(NAME.music.en);
      expect(calls.run).toHaveLength(1);
      expect(new Set(calls.reads)).toEqual(new Set([JOB_ID]));
    });

    test('7 · what is closed is not offered: hidden services absent, a closed Veo tier and the paused image models cannot be picked', async ({ page }) => {
      await page.route('**/api/video/engine', (r) => r.fulfill(json(200, {
        transport: 'vertex', googleOnly: true, audioToggle: true, enhancePrompt: true, nativeCameraControl: false,
        tiers: { lite: { available: true, referenceImages: 0, audioToggle: true }, fast: { available: true, referenceImages: 0, audioToggle: true }, standard: { available: false, referenceImages: 3, audioToggle: true } },
      })));
      await page.route('**/api/studio/catalogue**', (r) => r.fulfill(json(200, { models: [
        { id: 'nb/auto', available: true, reason: null }, { id: 'hf/soul-2', available: true, reason: null },
      ] })));
      await openStudio(page, { tool: null });

      await page.getByTestId('plus').click();
      const picker = page.getByTestId('service-picker');
      await expect(picker).toBeVisible();
      for (const id of HIDDEN) await expect(picker.getByTestId(`service-${id}`)).toHaveCount(0);
      // Every service drawn is pickable; one still in beta says so instead of looking finished.
      const rows = await picker.locator('button[data-testid^="service-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid'), disabled: (e as HTMLButtonElement).disabled })));
      expect(rows.length).toBeGreaterThanOrEqual(8);
      expect(rows.filter((r) => r.disabled)).toEqual([]);
      await picker.getByTestId('service-video').click();

      const tier = page.getByTestId('quick-video-tier');
      const tierBefore = (await tier.textContent())?.trim();
      await tier.click();
      // A sheet on a phone, a popover beside the chip on a desktop.
      const tiers = page.locator(desktop ? '[data-testid="picker-popover"]' : '[data-testid="video-tier-picker"]');
      await expect(tiers).toBeVisible();
      const closed = tiers.locator('[role="radio"][data-value="standard"]');
      await expect(closed).toBeDisabled();
      await expect(closed).toContainText('unavailable');
      await closed.click({ force: true });
      await page.keyboard.press('Escape');
      await expect(tier).toHaveText(tierBefore ?? '');

      await pickService(page, 'image', 'en');
      await openLayer(page);
      const panel = page.locator('#studio-settings').getByTestId('image-create-panel');
      const adv = panel.getByTestId('advanced-toggle').first();
      if ((await adv.getAttribute('aria-expanded')) !== 'true') await adv.click();
      await panel.getByTestId('model-row').click();
      const models = page.getByRole('dialog', { name: 'Model' });
      await expect(models).toBeVisible();
      await expect(models.locator('[data-model="nb/auto"]')).toHaveAttribute('aria-checked', 'true');
      await expect(models.locator('[data-model="hf/soul-2"]')).toHaveAttribute('aria-disabled', 'true');
      await models.locator('[data-model="hf/soul-2"]').click({ force: true });
      await expect(models.locator('[data-model="nb/auto"]')).toHaveAttribute('aria-checked', 'true');
    });

    test('8 · KA → EN → RU → KA: the chat, the service, its format and length and the unsent words come back each time', async ({ page }) => {
      await openStudio(page, { locale: 'ka', tool: null, reply: 'გამარჯობა! რა შევქმნათ?' });
      await say(page, 'გამარჯობა');
      await expect(page.getByText('გამარჯობა! რა შევქმნათ?').last()).toBeVisible({ timeout: 20_000 });
      await pickService(page, 'video', 'ka');
      await pickVideoFormat(page, '16:9');
      await pickVideoLength(page, 8);
      await page.getByTestId('composer-input').fill('ზღვა და ნავები');

      const switchTo = async (to: Locale, from: Locale) => {
        if (vp.width < 768) {
          await page.getByRole('button', { name: MENU[from], exact: true }).first().click();
        }
        await page.getByRole('button', { name: 'Language' }).filter({ visible: true }).first().click();
        await page.getByRole('menuitemradio', { name: LANG_ITEM[to] }).click();
        await page.waitForURL(new RegExp(`/${to}/dashboard`), { timeout: 30_000 });
        await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 60_000 });
        await pinSignedIn(page);
        await expect(page.getByText('გამარჯობა', { exact: true }).first()).toBeAttached({ timeout: 20_000 });
        await expect(page.getByText('გამარჯობა! რა შევქმნათ?').first()).toBeAttached();
        await expect(page.getByTestId('active-service-switch')).toContainText(NAME.video[to]);
        await expect(page.getByTestId('quick-video-format')).toContainText('16:9');
        await expect(page.getByTestId('quick-video-length')).toContainText('8');
        await expect(page.getByTestId('composer-input')).toHaveValue('ზღვა და ნავები');
      };
      await switchTo('en', 'ka');
      await switchTo('ru', 'en');
      await switchTo('ka', 'ru');
    });

    test('9 · a desktop needs no side panel: every service\'s settings are one layer in the composer\'s column, above it', async ({ page }) => {
      test.skip(!desktop, 'a desktop check (≥ 1024 px); phones are scenario 10');
      await openStudio(page, { tool: null });
      await expect(page.getByTestId('settings-panel-toggle')).toHaveCount(0);
      for (const id of ['video', 'image', 'music', 'avatar', 'interior', 'product']) {
        await page.getByTestId('plus').click();
        await page.getByTestId('service-picker').getByTestId(`service-${id}`).click();
        await expect(page.getByTestId('tool-sheet')).toHaveCount(0);
        await openLayer(page);
        const lb = await layerBox(page);
        const bb = (await page.getByTestId('composer-bar').boundingBox())!;
        const geo = { layerTop: lb.y, layerLeft: lb.x, layerRight: lb.x + lb.width, layerBottom: lb.y + lb.height, barTop: bb.y, barLeft: bb.x, barRight: bb.x + bb.width };
        // The layer sits above the composer, inside its column, and never as a right-hand column: no edge past the composer's
        // (at 1024 px the column itself reaches within 17 px of the screen's edge, so the screen's edge proves nothing) and
        // no top at the header's (a column runs from there down).
        expect(geo.layerBottom, `${id}: above the composer`).toBeLessThanOrEqual(geo.barTop + 1);
        expect(geo.layerLeft, `${id}: inside the composer's column`).toBeGreaterThanOrEqual(geo.barLeft - 1);
        expect(geo.layerRight, `${id}: inside the composer's column`).toBeLessThanOrEqual(geo.barRight + 1);
        expect(geo.layerTop, `${id}: not a column from the top`).toBeGreaterThan(80);
        expect(await page.locator('#studio-settings').getAttribute('aria-modal')).not.toBe('true');
        await page.keyboard.press('Escape');
        await expect(page.locator('#studio-settings')).toBeHidden();
        await expect(page.getByTestId('options-toggle')).toBeFocused();
      }
      expect(await noSideways(page)).toBe(0);
    });

    for (const theme of ['dark', 'light'] as const) {
      test(`11 · ${theme} theme: the composer, its chips and the picker read at AA contrast and name themselves to a screen reader`, async ({ page }) => {
        await page.addInitScript((t) => { try { localStorage.setItem('myavatar-theme', t); } catch { /* blocked */ } }, theme);
        await openStudio(page, { tool: null });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await pickService(page, 'video', 'en');
        const composer = await lowContrast(page, '[data-testid="composer-bar"], [data-testid="video-quick-settings"]');
        expect(composer.checked).toBeGreaterThan(3);
        expect(composer.low, `composer text below AA (${composer.skipped} skipped)`).toEqual([]);
        // Every quick chip says what it is and what it holds („Format: 9:16"), and that it opens a picker.
        for (const id of ['quick-video-mode', 'quick-video-format', 'quick-video-length', 'quick-video-tier']) {
          await expect(page.getByTestId(id)).toHaveAttribute('aria-label', /.+: .+/);
          await expect(page.getByTestId(id)).toHaveAttribute('aria-haspopup', 'dialog');
        }

        const plus = page.getByTestId('plus');
        await plus.click();
        await expect(plus).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByRole('dialog', { name: 'Services' })).toBeVisible();
        await settled(page);
        const picker = await lowContrast(page, '[data-testid="service-picker"]');
        expect(picker.checked).toBeGreaterThan(8);
        expect(picker.low, `picker text below AA (${picker.skipped} skipped)`).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('tool-sheet')).toHaveCount(0);
        await expect(plus).toHaveAttribute('aria-expanded', 'false');
        await expect(plus).toBeFocused();

        const more = page.getByTestId('options-toggle');
        await more.click();
        await expect(more).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#studio-settings')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(more).toHaveAttribute('aria-expanded', 'false');
        await expect(more).toBeFocused();
      });
    }

    test('10 · a phone: the composer stays on screen, a keyboard-sized viewport keeps it, the sheets open at the bottom', async ({ page }) => {
      test.skip(desktop, 'a phone and tablet check (< 1024 px); desktops are scenario 9');
      await openStudio(page, { tool: null });
      const bar = page.getByTestId('composer-bar');
      const inView = async () => {
        const r = (await bar.boundingBox())!;
        const vh = page.viewportSize()!.height;
        return r.y >= 0 && r.y + r.height <= vh + 1;
      };
      expect(await inView()).toBe(true);
      expect(await smallTargets(page)).toEqual([]);

      // „+" is a bottom sheet on a phone (its bottom edge is the screen's) and a card floating over the composer from 640 px
      // (BottomSheet's sm: layout), whole on screen either way. Escape closes it and focus comes back to „+".
      await page.getByTestId('plus').click();
      const sheet = page.getByTestId('tool-sheet');
      await expect(sheet).toBeVisible();
      await settled(page);
      const s = (await sheet.boundingBox())!;
      if (vp.width < 640) expect(s.y + s.height).toBeGreaterThanOrEqual(vp.height - 2);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y + s.height).toBeLessThanOrEqual(vp.height + 1);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId('plus')).toBeFocused();

      await pickService(page, 'video', 'en');
      expect(await smallTargets(page)).toEqual([]);
      await openLayer(page);
      const layer = await layerBox(page);
      const barBox = (await bar.boundingBox())!;
      expect(layer.y).toBeGreaterThanOrEqual(0);
      expect(layer.y + layer.height).toBeLessThanOrEqual(barBox.y + 1);
      // The composer is still usable under the open layer.
      const box = page.getByTestId('composer-input');
      await box.click();
      await box.fill('a lighthouse in the storm');
      await expect(box).toHaveValue('a lighthouse in the storm');
      expect(await inView()).toBe(true);

      // The keyboard: Chromium has none, so the viewport shrinks by a keyboard's height (Android's resize). The composer
      // and the text stay on screen. iPhone Safari's own keyboard is checked on GG's phone, not here.
      await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
      await page.waitForTimeout(300);
      expect(await inView()).toBe(true);
      await expect(box).toBeVisible();
      await expect(box).toHaveValue('a lighthouse in the storm');
      expect(await noSideways(page)).toBe(0);
    });

    test('the empty chat\'s line about the chosen service stays inside the screen, for every service', async ({ page }) => {
      // Interior's line ran 20 px past a 390 px screen's left edge once it showed the greeting (the greeting's column had no width).
      await openStudio(page, { tool: null });
      for (const id of ['video', 'image', 'music', 'avatar', 'interior', 'product', 'vfx', 'model3d']) {
        await pickService(page, id, 'en');
        const hint = page.getByTestId('tool-hint');
        await expect(hint).toBeVisible();
        await settled(page);
        const r = (await hint.boundingBox())!;
        expect(r.x, `${id}: left edge`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width, `${id}: right edge`).toBeLessThanOrEqual(vp.width);
      }
    });
  });
}
