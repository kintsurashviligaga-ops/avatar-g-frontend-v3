import { test, expect } from '@playwright/test';
import { followUpUnsupportedText } from '@/lib/agent/media/montageChat';
import {
  openStudio, openChatTool, ensureVideoPanel, cancelStoryboard, say, attachClipsAndTrack, attachClips, recordFinding, shot,
  MASTER_URL, QUOTE, ROUTE_NOTE, ROUTE_CHECK_MS, type Calls, type Locale,
} from './_shared';

/**
 * AGENT G READS THE SENTENCE — the Video Core v1.0 round-3 intent checks, in a real browser, every route mocked. The five
 * sentences of the brief are typed into the chat in Georgian, English and Russian, alone and with two clips and a track
 * attached, and the contract is what the app DOES with each:
 *
 *   · a make-sentence with a length opens the Video tool from the chat and SAYS the plan through the duration contract
 *     (requested · rendered · final): 24 s is 3 × 8 s with no deviation; one minute is 1:00 rendered as 1:04 (8 × 8 s) and
 *     trimmed back (1800 frames); 29.7 s is rendered as 32 s (4 × 8 s) and trimmed to 29.7 s = 891 frames — never the
 *     nearest stop sold as the request. The storyboard is planned (free); nothing renders before Start;
 *   · with clips and a track attached the same words are Agent G's montage lane: ONE quote POST to /api/agent/media/montage
 *     with the files in the user's order and the user's words — the plan's parameters („only the last five", „music from
 *     58 s") are mined server-side from that prompt, so the body is asserted, not the mined numbers;
 *   · a change said while a plan is waiting for Start re-quotes the same files with the card's words plus the change; the
 *     first card says it was replaced;
 *   · a sentence Agent G does not act on is a chat message (the model answers): recorded, never dressed up;
 *   · AC-23: a parameter this version cannot honour („music from the 5th second of the VIDEO") is said on the quote card in
 *     a note starting „ამ ვერსიაში არ არის მხარდაჭერილი", and a follow-up on a DELIVERED montage („add these two") is
 *     refused in words with the way out — zero new quote calls, nothing sent, the words and the files stay in the box.
 *
 * What the app does NOT do with a brief sentence is kept as a test marked `test.fail()` with the reason (the run stays
 * truthful) and as a finding in evidence/findings.json.
 */

const LOCALES: Locale[] = ['ka', 'en', 'ru'];
const REPLY = 'Noted — the chat model answered this one.';

const S = {
  mv24: { ka: 'შექმენი 24-წამიანი მუსიკალური კლიპი.', en: 'Make a 24-second music video.', ru: 'Сделай 24-секундный музыкальный клип.' },
  min1: { ka: 'გააკეთე ერთწუთიანი ვიდეო.', en: 'Make a one-minute video.', ru: 'Сделай одноминутное видео.' },
  last5: { ka: 'მარტო ბოლო ხუთი კლიპი გამოიყენე.', en: 'Use only the last five clips.', ru: 'Используй только последние пять клипов.' },
  music58: { ka: 'მუსიკა დაიწყე 58-ე წამიდან.', en: 'Start the music at second 58.', ru: 'Музыку начни с 58-й секунды.' },
  exact297: { ka: 'ვიდეო ზუსტად 29.7 წამი უნდა იყოს.', en: 'The video must be exactly 29.7 seconds.', ru: 'Видео должно быть ровно 29.7 секунды.' },
  /** The same length with a make-verb: the sentence that does open the tool, so the 29.7 → 32 → 29.7 plan is on record. */
  make297: { ka: 'გააკეთე 29.7-წამიანი ვიდეო.', en: 'Make a 29.7-second video.', ru: 'Сделай 29.7-секундное видео.' },
} satisfies Record<string, Record<Locale, string>>;

/** lib/video/durationContract describeDurationPlan — the words the contract says, per locale. */
const PLAN = {
  p24: { en: 'Length 24s (3 × 8s) · 720 frames', ka: 'ხანგრძლივობა 24წმ (3 × 8წმ) · 720 კადრი', ru: 'Длина 24с (3 × 8с) · 720 кадров' },
  p60: {
    en: 'Requested 1:00 · Rendered 1:04 (8 × 8s) · Final 1:00 (1800 frames, 4s trimmed; priced at 1:04)',
    ka: 'მოთხოვნილი 1:00 · რენდერი 1:04 (8 × 8წმ) · საბოლოო 1:00 (1800 კადრი, 4წმ მოიჭრება; ფასი 1:04-ზე)',
    ru: 'Запрошено 1:00 · Рендер 1:04 (8 × 8с) · Итог 1:00 (1800 кадров, обрезка 4с; цена за 1:04)',
  },
  p297: {
    en: 'Requested 29.7s · Rendered 32s (4 × 8s) · Final 29.7s (891 frames, 2.3s trimmed; priced at 32s)',
    ka: 'მოთხოვნილი 29.7წმ · რენდერი 32წმ (4 × 8წმ) · საბოლოო 29.7წმ (891 კადრი, 2.3წმ მოიჭრება; ფასი 32წმ-ზე)',
    ru: 'Запрошено 29.7с · Рендер 32с (4 × 8с) · Итог 29.7с (891 кадров, обрезка 2.3с; цена за 32с)',
  },
} satisfies Record<string, Record<Locale, string>>;

/** lib/agent/intentReply — Agent G's own note for „start the music at 58 s" with nothing attached. */
const SAY58: Record<Locale, string> = {
  ka: 'დასრულებულ ვიდეოში მუსიკის გადაწევა ჯერ არ შემიძლია. მონტაჟის გეგმაში კი შემიძლია: დაურთე კლიპები და მუსიკა და დაწერე, რომელი წამიდან დაიწყოს.',
  en: 'I cannot move the music in a finished video yet. In a montage plan I can: attach the clips and the track and say which second the music starts at.',
  ru: 'Сдвинуть музыку в готовом видео я пока не могу. В плане монтажа могу: прикрепите клипы и трек и напишите, с какой секунды начать музыку.',
};
const REPLACED: Record<Locale, string> = { en: 'Plan changed: the new one is below.', ka: 'გეგმა შეიცვალა — ახალი ქვემოთაა.', ru: 'План изменён — новый ниже.' };
const NAMES: [string, string, string] = ['beach.webm', 'city.webm', 'song.wav'];

/** The storyboard the `open` step plans, then the Video panel on screen: both are the tool having opened. */
const plansOf = (calls: Calls) => calls.storyboard.filter((b) => b.planOnly === true);

async function openedVideoTool(page: import('@playwright/test').Page, calls: Calls, locale: Locale, expected: { sceneCount: number }, plansBefore: number): Promise<Record<string, unknown>> {
  await expect(page.getByText(ROUTE_NOTE[locale]).last()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => plansOf(calls).length, { timeout: 15_000 }).toBe(plansBefore + 1);
  const plan = plansOf(calls)[plansBefore]!;
  expect(plan.sceneCount).toBe(expected.sceneCount);
  await cancelStoryboard(page, locale);
  await ensureVideoPanel(page);
  return plan;
}

test.describe('Video Core — Agent G reads the sentence', () => {
  for (const locale of LOCALES) {
    test(`[${locale}] the five sentences alone: which open the Video tool with the plan said, which are chat`, async ({ page, isMobile }, info) => {
      const calls = await openStudio(page, { locale, reply: REPLY });
      await page.waitForTimeout(ROUTE_CHECK_MS);

      // 1 · „make a 24-second music video" → the Video tool, music-video mode, 24 s = 3 × 8 s, no deviation to say.
      await say(page, S.mv24[locale]);
      const plan24 = await openedVideoTool(page, calls, locale, { sceneCount: 3 }, 0);
      await expect(page.getByText(PLAN.p24[locale]).first()).toBeVisible();
      await expect(page.getByTestId('video-mode-musicvideo')).toHaveAttribute('aria-checked', 'true');
      // The board was planned in the same tick the mode was set: observe which mode the plan request carried.
      recordFinding(info, `intent-mv24-plan-mode-${locale}`, `"${S.mv24[locale]}" opened the Video tool in music-video mode (the panel shows it), but the storyboard plan POST /api/film/storyboard carried musicVideoMode=${String(plan24.musicVideoMode)} — the board is planned with the mode from BEFORE the sentence (components/studio/OmniStudio.tsx:4647 reads videoMode from the render closure; the open step at ~8995 calls createStoryboard right after setVideoMode).`);
      await expect(page.getByTestId('video-duration-plan')).toHaveCount(0); // 24 s needs no trim: no deviation line
      expect(calls.chat).toHaveLength(0);
      expect(calls.quote).toHaveLength(0);

      // 2 · „make a one-minute video" → film mode, 1:00 rendered as 1:04 (8 × 8 s), trimmed back to 1800 frames.
      await openChatTool(page, isMobile, locale);
      await say(page, S.min1[locale]);
      await openedVideoTool(page, calls, locale, { sceneCount: 8 }, 1);
      await expect(page.getByText(PLAN.p60[locale]).first()).toBeVisible();
      await expect(page.getByTestId('video-mode-documentary')).toHaveAttribute('aria-checked', 'true');
      const p60 = page.getByTestId('video-duration-plan');
      await expect(p60).toHaveText(PLAN.p60[locale]);
      await expect(p60).toHaveAttribute('data-final', '60');
      await expect(p60).toHaveAttribute('data-native', '64');
      await expect(p60).toHaveAttribute('data-frames', '1800');
      expect(calls.chat).toHaveLength(0);

      // 3 · „use only the last five clips" with nothing attached: a chat message (the model answers); no quote, no tool.
      await openChatTool(page, isMobile, locale);
      const storyboardCalls = calls.storyboard.length;
      const plansSoFar = plansOf(calls).length;
      await say(page, S.last5[locale]);
      await expect.poll(() => calls.chat.length, { timeout: 15_000 }).toBe(1);
      await expect(page.getByText(REPLY)).toHaveCount(1, { timeout: 15_000 });
      expect(calls.quote).toHaveLength(0);
      expect(calls.storyboard).toHaveLength(storyboardCalls);

      // 4 · „start the music at second 58" with nothing attached: KA and RU get Agent G's own note (no model call);
      //     EN is a chat message — observed and recorded, see the test.fail() below.
      await say(page, S.music58[locale]);
      if (locale === 'en') {
        await expect.poll(() => calls.chat.length, { timeout: 15_000 }).toBe(2);
        await expect(page.getByText(REPLY)).toHaveCount(2, { timeout: 15_000 });
        recordFinding(info, 'intent-en-music-58', `EN "${S.music58.en}" (nothing attached) is a chat message: the model answered it. KA/RU equivalents get Agent G's own note (lib/agent/intentReply.ts:158). lib/agent/params.ts START_PATTERNS mine "at 58 seconds" / "from the 58th second", not "at second 58".`);
      } else {
        await expect(page.getByText(SAY58[locale])).toBeVisible({ timeout: 15_000 });
        expect(calls.chat).toHaveLength(1);
      }
      const chatAfter58 = calls.chat.length;

      // 5 · „the video must be exactly 29.7 seconds" (no make-verb): a chat message in every language — recorded.
      await say(page, S.exact297[locale]);
      await expect.poll(() => calls.chat.length, { timeout: 15_000 }).toBe(chatAfter58 + 1);
      expect(calls.storyboard).toHaveLength(storyboardCalls);
      await expect(page.getByTestId('video-duration-plan')).toHaveCount(0);
      recordFinding(info, `intent-exact-297-${locale}`, `"${S.exact297[locale]}" alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.`);

      // 6 · The same length WITH a make-verb: 29.7 s → rendered 32 s (4 × 8 s) → final 29.7 s = 891 frames, said in full.
      await say(page, S.make297[locale]);
      await openedVideoTool(page, calls, locale, { sceneCount: 4 }, plansSoFar);
      const p297 = page.getByTestId('video-duration-plan');
      await expect(p297).toHaveText(PLAN.p297[locale]);
      await expect(p297).toHaveAttribute('data-final', '29.7');
      await expect(p297).toHaveAttribute('data-native', '32');
      await expect(p297).toHaveAttribute('data-frames', '891');
      await expect(page.getByText(PLAN.p297[locale]).first()).toBeVisible(); // the chat said it too
      expect(calls.chat).toHaveLength(chatAfter58 + 1);
      if (locale === 'ka') await shot(page, `video-tool-duration-plan-${info.project.name}`);
    });

    test(`[${locale}] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes`, async ({ page }, info) => {
      const calls = await openStudio(page, { locale, reply: REPLY });
      await page.waitForTimeout(ROUTE_CHECK_MS);
      await attachClipsAndTrack(page, NAMES);
      await say(page, S.last5[locale]);
      const cards = page.getByTestId('agent-montage-card');
      await expect(cards.first()).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
      expect(calls.quote).toHaveLength(1);
      const q0 = calls.quote[0]!;
      expect(q0.action).toBe('quote');
      expect(q0.prompt).toBe(S.last5[locale]);
      expect(q0.names).toEqual(NAMES);
      expect(Array.isArray(q0.files) && (q0.files as unknown[]).length).toBe(3);
      expect(calls.storyboard).toHaveLength(0);
      expect(calls.chat).toHaveLength(0);
      await expect(page.getByTestId('agent-montage-start')).toBeVisible();

      // The change while the plan waits for Start.
      await say(page, S.music58[locale]);
      if (locale === 'en') {
        // EN "at second 58" is not read as a change: the model answers, the quoted card stays as it was.
        await expect.poll(() => calls.chat.length, { timeout: 15_000 }).toBe(1);
        expect(calls.quote).toHaveLength(1);
        await expect(cards.first()).toHaveAttribute('data-phase', 'quoted');
        recordFinding(info, 'intent-en-music-58-requote', `EN "${S.music58.en}" said over a waiting montage plan is a chat message (model answered); KA/RU re-quote the plan with the music start. lib/agent/params.ts START_PATTERNS lack "at second N".`);
      } else {
        await expect.poll(() => calls.quote.length, { timeout: 15_000 }).toBe(2);
        const q1 = calls.quote[1]!;
        expect(q1.action).toBe('quote');
        expect(q1.prompt).toBe(`${S.last5[locale]}\n${S.music58[locale]}`);
        expect(q1.names).toEqual(NAMES);
        expect(Array.isArray(q1.files) && (q1.files as unknown[]).length).toBe(3);
        await expect(cards).toHaveCount(2);
        await expect(cards.nth(0)).toHaveAttribute('data-phase', 'dismissed');
        await expect(cards.nth(1)).toHaveAttribute('data-phase', 'quoted', { timeout: 10_000 });
        await expect(page.getByText(REPLACED[locale])).toBeVisible();
        expect(calls.chat).toHaveLength(0);
      }
      expect(calls.run).toHaveLength(0); // nothing ran: every plan waits for Start
    });

    test(`[${locale}] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool`, async ({ page }, info) => {
      const calls = await openStudio(page, { locale, reply: REPLY });
      await page.waitForTimeout(ROUTE_CHECK_MS);
      await attachClipsAndTrack(page, NAMES);
      await say(page, S.mv24[locale]);
      const cards = page.getByTestId('agent-montage-card');
      await expect(cards.first()).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
      expect(calls.quote).toHaveLength(1);
      expect(calls.quote[0]!.prompt).toBe(S.mv24[locale]);
      expect(calls.quote[0]!.names).toEqual(NAMES);
      expect(calls.storyboard).toHaveLength(0);
      await expect(page.getByText(ROUTE_NOTE[locale])).toHaveCount(0);
      expect(calls.chat).toHaveLength(0);
      // The waiting plan is let go, then the bare constraint sentence with new files: observed.
      await page.getByTestId('agent-montage-cancel').click();
      await expect(cards.first()).toHaveAttribute('data-phase', 'dismissed', { timeout: 10_000 }); // a plan let go before Start is "dismissed"
      await attachClipsAndTrack(page, ['one.webm', 'two.webm', 'beat.wav']);
      const [chatN, quoteN, sbN] = [calls.chat.length, calls.quote.length, calls.storyboard.length];
      await say(page, S.exact297[locale]);
      await page.waitForTimeout(4_000);
      const notice = await page.locator('[data-testid="agent-montage-card"], [data-testid="video-duration-plan"]').count();
      recordFinding(info, `intent-exact-297-files-${locale}`, `"${S.exact297[locale]}" with two clips and a track attached: chat calls +${calls.chat.length - chatN}, quote calls +${calls.quote.length - quoteN}, storyboard calls +${calls.storyboard.length - sbN}; cards+plans on screen: ${notice}; composer now "${await page.getByTestId('composer-input').inputValue()}".`);
      expect(calls.storyboard).toHaveLength(sbN); // never the Video tool
    });
  }

  test('[en] the brief\'s "start the music at second 58" gets the same Agent G note as KA/RU', async ({ page }) => {
    test.fail(true, 'lib/agent/params.ts START_PATTERNS mine "at 58 seconds" / "from the 58th second" but not "at second 58": the EN sentence falls through to the chat model while KA/RU get Agent G\'s note (lib/agent/intentReply.ts:158).');
    const calls = await openStudio(page, { locale: 'en', reply: REPLY });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await say(page, S.music58.en);
    await expect(page.getByText(SAY58.en)).toBeVisible({ timeout: 10_000 });
    expect(calls.chat).toHaveLength(0);
  });

  for (const locale of LOCALES) {
    test(`[${locale}] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan`, async ({ page }) => {
      test.fail(true, `"${S.exact297[locale]}" has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "${S.make297[locale]}" opens the tool (that path passes above).`);
      const calls = await openStudio(page, { locale, reply: REPLY });
      await page.waitForTimeout(ROUTE_CHECK_MS);
      await say(page, S.exact297[locale]);
      await expect(page.getByText(ROUTE_NOTE[locale])).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(PLAN.p297[locale]).first()).toBeVisible();
      expect(calls.chat).toHaveLength(0);
    });
  }

  test('[ka] the 24-second music-video sentence plans its storyboard in music-video mode', async ({ page }) => {
    test.fail(true, 'components/studio/OmniStudio.tsx open step: setVideoMode(musicvideo) and createStoryboard() run in the same tick, and createStoryboard (line ~4647) reads videoMode from the render closure — the plan POST carries musicVideoMode=false for a music-video sentence.');
    const calls = await openStudio(page, { locale: 'ka' });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await say(page, S.mv24.ka);
    await expect(page.getByText(ROUTE_NOTE.ka)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => calls.storyboard.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(calls.storyboard[0]!.musicVideoMode).toBe(true);
  });

  test('[ka] AC-23 — a music delay this version cannot honour is said on the quote card in a note starting „ამ ვერსიაში არ არის მხარდაჭერილი"', async ({ page }, info) => {
    const calls = await openStudio(page, { locale: 'ka', quote: { ...QUOTE, musicStartSec: 0, unsupported: ['music_delay'] } });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await attachClipsAndTrack(page, NAMES);
    const ask = 'მუსიკა ვიდეოს მე-5 წამიდან დაიწყოს';
    await say(page, ask);
    const card = page.getByTestId('agent-montage-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.quote).toHaveLength(1);
    expect(calls.quote[0]!.prompt).toBe(ask);
    // The quote's own line for the unsupported parameter (lib/agent/media/montageChat unsupportedNotes), in the plan
    // paragraph above the card: a line that STARTS with „ამ ვერსიაში არ არის მხარდაჭერილი".
    const NOTE = 'ამ ვერსიაში არ არის მხარდაჭერილი: მუსიკის მოგვიანებით ჩართვა ტაიმლაინზე.';
    const plan = page.getByText(NOTE).first();
    await expect(plan).toBeVisible();
    await expect(plan).toContainText('მუსიკა პირველივე კადრიდან იწყება და ტრეკის საწყისი წერტილი არ შემიცვლია');
    const lines = (await plan.evaluate((el) => el.textContent ?? '')).split('\n').map((l) => l.trim());
    expect(lines.some((l) => l.startsWith('ამ ვერსიაში არ არის მხარდაჭერილი'))).toBe(true);
    await expect(page.getByTestId('agent-montage-start')).toBeVisible(); // still the user's call: nothing ran
    expect(calls.run).toHaveLength(0);
    if (info.project.name === 'desktop') await shot(page, 'ac23-unsupported-note');
  });

  test('[ka] AC-23 — „add these two" after a delivered montage is refused in words: zero new quotes, nothing sent, words and files stay', async ({ page }) => {
    const calls = await openStudio(page, { locale: 'ka' });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await attachClipsAndTrack(page, NAMES);
    await say(page, 'cut these to the music');
    const card = page.getByTestId('agent-montage-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await page.getByTestId('agent-montage-start').click();
    await expect(page.getByTestId('agent-montage-result').locator(`video[src^="${MASTER_URL}"]`)).toBeAttached({ timeout: 25_000 });
    await expect(card).toHaveAttribute('data-phase', 'done');
    expect(calls.quote).toHaveLength(1);
    expect(calls.run).toHaveLength(1);

    await attachClips(page, ['third.webm', 'fourth.webm']);
    const follow = 'ეს ორიც დაამატე';
    await say(page, follow);
    await expect(page.getByText(followUpUnsupportedText('add_clips', 'ka'))).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_500);
    expect(calls.quote).toHaveLength(1); // ZERO new quote calls
    expect(calls.run).toHaveLength(1);
    expect(calls.chat).toHaveLength(0);
    await expect(page.getByTestId('agent-montage-card')).toHaveCount(1);
    await expect(page.getByTestId('composer-input')).toHaveValue(follow); // the words stay in the box…
    await expect(page.getByTitle('third.webm')).toBeVisible(); // …and so do the files
    await expect(page.getByTitle('fourth.webm')).toBeVisible();
  });
});
