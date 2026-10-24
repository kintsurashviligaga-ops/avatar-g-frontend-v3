import { test, expect, type Page } from '@playwright/test';

/**
 * One primary action per panel (Phase 2 PR 7, GG's plan of 2026-10-23; MASTER TASK v3.1 §3.1): a tool's screen never
 * shows the panel's Create AND the composer's Send at once. Each is marked — `data-primary="create"` on the shared
 * GenerateButton, `data-primary="send"` on the composer's run button and the chat's send — and this spec counts the
 * marked buttons a person can actually see and reach: on screen, not covered by a sheet (the point under the button's
 * centre belongs to the button), at a 390 × 844 phone and a 1440 × 900 desktop.
 *
 *   settings open    exactly one primary, enabled, once words are typed (in the panel's box, or in the composer's where
 *                    the panel has none). Image, Music and Interior run from the panel, so theirs is the panel's Create
 *                    and the composer adds no Send beside it. Video's panel has no prompt and no Create: the
 *                    composer's Send is its one primary beside the desktop column. The phone's video sheet covers the
 *                    composer, so it shows none (its copy says to describe the video in the chat box; closing the sheet
 *                    brings Send back).
 *   settings closed  the composer's Send alone for Image, Video and Music; for Image and Music it holds the words typed
 *                    in the panel, so nothing typed is lost by closing it (#113's composer contract). Interior runs only
 *                    from its panel (the composer has no Send for it), so it shows none until its chip reopens it.
 *
 * Nothing leaves the machine: the music engines status is stubbed and no Create or Send is pressed.
 */

const VIEWPORTS = [
  { name: 'phone 390×844', size: { width: 390, height: 844 }, desktop: false },
  { name: 'desktop 1440×900', size: { width: 1440, height: 900 }, desktop: true },
] as const;

const PRIMARY = '[data-primary="send"], [data-primary="create"]';

/** Lyria is the one authorised music engine (MASTER TASK v3.1); the stub keeps the panel the same whatever keys exist. */
const MUSIC_STATUS = {
  engines: {
    lyria: { configured: true, busy: false, controls: 'prompt' },
    udio: { configured: false, busy: false, controls: 'prompt' },
    'elevenlabs-music': { configured: false, busy: false, controls: 'prompt' },
    musicgen: { configured: false, busy: false, controls: 'native' },
  },
  references: { cover: true, voice: true },
  chain: ['lyria'],
};

interface Tool {
  id: 'image' | 'video' | 'music' | 'interior';
  /** The panel's own text box, when it has one (words there enable its Create). */
  prompt?: string;
  /** The panel's Create, when it has one. */
  create?: string;
  /** Whether closing the panel carries the panel's words into the composer (#113: Image and Music share the draft). */
  sharesDraft?: boolean;
  /** What the composer offers once the settings are shut. */
  closed: 'send' | 'none';
}

const TOOLS: Tool[] = [
  { id: 'image', prompt: 'create-prompt', create: 'create-generate', sharesDraft: true, closed: 'send' },
  { id: 'video', closed: 'send' },
  { id: 'music', prompt: 'music-simple-input', create: 'music-create', sharesDraft: true, closed: 'send' },
  { id: 'interior', prompt: 'interior-brief', create: 'interior-generate', closed: 'none' },
];

interface Primary { testId: string | null; kind: string | null; enabled: boolean }

/** The marked buttons a person can see and reach right now. */
async function reachablePrimaries(page: Page): Promise<Primary[]> {
  return page.evaluate((sel) => {
    const out: { testId: string | null; kind: string | null; enabled: boolean }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit))) continue;
      const disabled = (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
      out.push({ testId: el.getAttribute('data-testid'), kind: el.getAttribute('data-primary'), enabled: !disabled });
    }
    return out;
  }, PRIMARY);
}

async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* storage blocked */ }
  });
  await page.route('**/api/ai/music/engines', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MUSIC_STATUS) }));
}

/** Picks the tool the way the sidebar does (`omni:set-tool`), then opens its settings with the chip if they are shut. */
async function openTool(page: Page, tool: Tool): Promise<void> {
  await page.goto('/en/dashboard', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: id })), tool.id);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tool), { timeout: 15_000 }).toBe(tool.id);
  const toggle = page.getByTestId('options-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', /^(true|false)$/);
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // The panels are separate chunks: wait for the one that marks this tool's screen as drawn (a cold `next dev` compiles it
  // on first use).
  const ready = tool.create ?? (tool.id === 'video' ? 'video-create-panel' : null);
  if (ready) await expect(page.getByTestId(ready).filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
}

/** Shuts the settings the way a person does: the same chip beside the desktop column, a tap above the phone's sheet. */
async function closeSettings(page: Page, desktop: boolean): Promise<void> {
  const toggle = page.getByTestId('options-toggle');
  if (desktop) await toggle.click();
  else await page.mouse.click((page.viewportSize()?.width ?? 390) / 2, 12);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: vp.size });
    test.beforeEach(async ({ page }) => { await seed(page); });

    for (const tool of TOOLS) {
      test(`${tool.id}: one primary with the settings open, the composer's Send alone once they close`, async ({ page }) => {
        test.setTimeout(150_000);
        await openTool(page, tool);

        const typed = `one primary · ${tool.id}`;
        const composer = page.getByTestId('composer-input');
        if (tool.prompt) await page.getByTestId(tool.prompt).filter({ visible: true }).first().fill(typed);
        else if (await composer.isVisible()) await composer.fill(typed); // the desktop composer sits beside the column

        // Settings open: never Create and Send together; with words typed, exactly one, and it is enabled.
        await expect.poll(async () => (await reachablePrimaries(page)).length, { timeout: 10_000 }).toBeLessThanOrEqual(1);
        const open = await reachablePrimaries(page);
        if (tool.create) {
          expect(open, JSON.stringify(open)).toEqual([{ testId: tool.create, kind: 'create', enabled: true }]);
        } else if (vp.desktop) {
          expect(open, JSON.stringify(open)).toEqual([{ testId: 'run-button', kind: 'send', enabled: true }]);
        } else {
          // The phone's video sheet covers the composer; its own copy points to the chat box.
          expect(open, JSON.stringify(open)).toEqual([]);
        }

        // Settings closed: the words typed in the panel are in the composer's box, and its Send is the one primary.
        await closeSettings(page, vp.desktop);
        await expect(composer).toBeVisible();
        if (tool.sharesDraft) await expect(composer).toHaveValue(typed);
        else if (!(await composer.inputValue())) await composer.fill(typed); // the phone's sheet covered the composer
        const want = tool.closed === 'send' ? ['send'] : [];
        await expect.poll(async () => (await reachablePrimaries(page)).map((p) => p.kind), { timeout: 10_000 }).toEqual(want);
        const closed = await reachablePrimaries(page);
        if (tool.closed === 'send') expect(closed, JSON.stringify(closed)).toEqual([{ testId: 'run-button', kind: 'send', enabled: true }]);
        else expect(closed, JSON.stringify(closed)).toEqual([]);
      });
    }
  });
}
