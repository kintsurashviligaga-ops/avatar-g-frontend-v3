import { test, expect } from '@playwright/test';
import { openStudio, openVideoTool, openChatTool, openSidebar, say, attachClipsAndTrack, attachClips, recordFinding, pinSignedIn, userBubble, MASTER_URL, type Locale } from './_shared';

/**
 * ONE WINDOW, THREE LANGUAGES — the Video Core v1.0 round-3 navigation checks, in a real browser on a desktop and on a
 * phone, every server route mocked. The contract:
 *
 *   · the dashboard opens at /en, /ka and /ru with the composer ready;
 *   · chat → the Video tool through the sidebar's own row shows the Video panel; the panel's mode switch (film · music
 *     video) holds while the user goes to the chat and back;
 *   · a `?tool=video` link opens the Video tool;
 *   · a reload, Back/Forward and a sidebar switch keep what the app actually persists — and what it does NOT persist is
 *     recorded as a finding (test.info().annotations + evidence/findings.json), never dressed up as a pass;
 *   · a conversation's results stay in that conversation: a new session shows none of them, reopening it shows them again.
 */

const LOCALES: Locale[] = ['en', 'ka', 'ru'];

test.describe('Video Core — One Window navigation', () => {
  test('the dashboard loads at /en, /ka and /ru with the composer ready', async ({ page, isMobile }) => {
    for (const locale of LOCALES) {
      await openStudio(page, { locale });
      await expect(page.getByTestId('composer-input')).toBeVisible();
      const lang = await page.locator('html').getAttribute('lang');
      test.info().annotations.push({ type: 'observed', description: `/${locale}/dashboard → <html lang="${lang}">, mobile=${isMobile}` });
      // The sidebar's Chat row is the hub on every locale (a drawer on a phone).
      await openSidebar(page, isMobile, locale);
      await expect(page.getByTestId('sidebar-chat')).toBeVisible();
      if (isMobile) await page.keyboard.press('Escape');
    }
  });

  test('chat → Video through the sidebar row; the mode switch holds across a chat round-trip; a reload resets it', async ({ page, isMobile }, info) => {
    await openStudio(page);
    await openVideoTool(page, isMobile);
    const choice = page.getByTestId('video-mode-choice');
    await expect(choice).toBeVisible();
    await expect(page.getByTestId('video-mode-documentary')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('video-mode-musicvideo').click();
    await expect(page.getByTestId('video-mode-musicvideo')).toHaveAttribute('aria-checked', 'true');
    // To the chat and back: the panel keeps the pick (component state).
    await openChatTool(page, isMobile);
    await expect(page.getByTestId('video-create-panel')).toBeHidden();
    await openVideoTool(page, isMobile);
    await expect(page.getByTestId('video-mode-musicvideo')).toHaveAttribute('aria-checked', 'true');
    // Across a reload: observe, do not assume.
    await page.reload();
    await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
    await pinSignedIn(page);
    const panelAfterReload = await page.getByTestId('video-create-panel').isVisible().catch(() => false);
    if (!panelAfterReload) await openVideoTool(page, isMobile);
    const mode = (await page.getByTestId('video-mode-musicvideo').getAttribute('aria-checked')) === 'true' ? 'musicvideo' : 'documentary';
    recordFinding(info, 'nav-reload-tool', `After a reload the dashboard opens on ${panelAfterReload ? 'the Video tool' : 'the chat (the open tool is not persisted)'}; the Video mode comes back as "${mode}" (the music-video pick is ${mode === 'musicvideo' ? '' : 'NOT '}persisted — components/studio/OmniStudio.tsx:2584 keeps videoMode in component state only).`);
  });

  test('a ?tool=video link opens the Video tool; the param is taken off the URL, so Back/Forward carry no tool', async ({ page, isMobile }, info) => {
    await openStudio(page, { tool: 'video' });
    await expect(page.getByTestId('video-create-panel')).toBeVisible({ timeout: 15_000 });
    const afterOpen = new URL(page.url());
    expect(afterOpen.pathname).toBe('/en/dashboard');
    recordFinding(info, 'nav-tool-param-stripped', `?tool=video opens the Video tool, then history.replaceState drops the param (URL now "${afterOpen.pathname}${afterOpen.search}"; components/studio/OmniStudio.tsx:3549). The history entry therefore carries no tool for Back/Forward to restore.`);
    // Another document, then Back: what tool is on screen?
    await page.goto('/en/dashboard?tool=chat');
    await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
    await pinSignedIn(page);
    await expect(page.getByTestId('video-create-panel')).toBeHidden();
    await page.goBack();
    await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
    await page.waitForTimeout(800);
    const backUrl = new URL(page.url());
    const backVideo = await page.getByTestId('video-create-panel').isVisible().catch(() => false);
    await page.goForward();
    await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
    await page.waitForTimeout(800);
    const fwdUrl = new URL(page.url());
    const fwdVideo = await page.getByTestId('video-create-panel').isVisible().catch(() => false);
    recordFinding(info, 'nav-back-forward', `Back landed on "${backUrl.pathname}${backUrl.search}" with the Video panel ${backVideo ? 'OPEN' : 'closed (the tool opened by ?tool=video is not restored)'}; Forward landed on "${fwdUrl.pathname}${fwdUrl.search}" with the Video panel ${fwdVideo ? 'open' : 'closed'}. mobile=${isMobile}.`);
    // The page itself survives both moves.
    await expect(page.getByTestId('composer-input')).toBeVisible();
  });

  test('a reload opens a fresh chat; the conversation is in History and reopens from there', async ({ page, isMobile }, info) => {
    const calls = await openStudio(page, { reply: 'Hello from the mocked model.' });
    await say(page, 'hello there, remember me');
    await expect(page.getByText('Hello from the mocked model.')).toBeVisible({ timeout: 20_000 });
    expect(calls.chat).toHaveLength(1);
    await page.reload();
    await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
    await pinSignedIn(page);
    await page.waitForTimeout(500);
    const threadKept = await page.getByText('Hello from the mocked model.').isVisible().catch(() => false);
    recordFinding(info, 'nav-reload-conversation', `After a reload the thread is ${threadKept ? 'restored in place' : 'EMPTY: the studio opens a new, empty conversation on every visit by design (components/studio/OmniStudio.tsx:1440-1455 currentConversationId — only an explicit History pick, OMNI_RESUME_KEY, reopens one)'}; the conversation is listed in History.`);
    // History holds it (title = the first words), and reopening it brings the turn back.
    await openSidebar(page, isMobile);
    const row = page.getByRole('button', { name: 'hello there, remember me' }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(page.getByText('Hello from the mocked model.')).toBeVisible({ timeout: 10_000 });
    await expect(userBubble(page, 'hello there, remember me')).toBeVisible();
  });

  test('switching conversations in the sidebar keeps results scoped: a new session shows none, reopening shows them again', async ({ page, isMobile }, info) => {
    const calls = await openStudio(page);
    await page.waitForTimeout(600);
    await attachClipsAndTrack(page);
    await say(page, 'cut these to the music');
    const card = page.getByTestId('agent-montage-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await page.getByTestId('agent-montage-start').click();
    await expect(page.getByTestId('agent-montage-result').locator(`video[src^="${MASTER_URL}"]`)).toBeAttached({ timeout: 25_000 });
    expect(calls.run).toHaveLength(1);

    // A new session: nothing of the first conversation is on screen.
    await openSidebar(page, isMobile);
    await page.getByRole('button', { name: 'New session' }).first().click();
    if (isMobile) await page.keyboard.press('Escape').catch(() => undefined);
    await expect(page.getByTestId('agent-montage-result')).toHaveCount(0);
    await expect(page.getByTestId('agent-montage-card')).toHaveCount(0);
    await expect(page.getByTestId('composer-input')).toHaveValue('');
    // Attachments picked in THIS session: do they follow the user to the other conversation? Observe.
    await attachClips(page, ['third.webm']);
    await expect(page.getByTitle('third.webm')).toBeVisible();

    // Back to the first conversation: its result is there again, exactly once.
    await openSidebar(page, isMobile);
    await page.getByRole('button', { name: 'cut these to the music' }).first().click();
    await expect(page.getByTestId('agent-montage-result')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.getByTestId('agent-montage-result').locator('video')).toBeAttached();
    const attachmentFollowed = await page.getByTitle('third.webm').isVisible().catch(() => false);
    recordFinding(info, 'nav-attachments-on-switch', `A clip attached in the composer of the new session ${attachmentFollowed ? 'STAYS in the composer when the earlier conversation is reopened (composer attachments are not scoped per conversation)' : 'is parked with its own session when the earlier conversation is reopened (the composer is per conversation)'}. Results (the montage card and its master) are scoped to their conversation.`);
    // Round-3 browser defect 6, fixed: a History pick parks the composer's files with the chat being left.
    expect(attachmentFollowed, 'the new session\'s clip must not ride into the reopened conversation').toBe(false);
    expect(calls.run).toHaveLength(1); // reopening never re-runs anything
  });
});
