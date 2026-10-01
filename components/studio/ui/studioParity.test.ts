/** @jest-environment node */
/**
 * The standalone studios must offer what the in-chat panel already does.
 *
 * ⚠️ THE SHARED PIECES EXISTED AND ALMOST NOTHING USED THEM. An inventory of components/studio/ui/
 * found GenerationProgress wired into 2 of 9 studios and ResultActions into none — while the in-chat
 * ServiceParamsPanel drove the SAME routes with a full stage/percentage/remaining card. So the identical
 * render showed a rich progress card in chat and a 1px indeterminate bar with one static label on its own
 * page, for a job measured in minutes. Against that, a bar is indistinguishable from a hang, and the
 * reasonable response — reload, or press it again — either loses the render or pays for a second one.
 *
 * This asserts the parity rather than the pixels: a studio that shows progress uses the shared card, and
 * a studio that can fail offers a way to retry.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..');
const src = (f: string) => readFileSync(join(dir, f), 'utf8');

/** Studios migrated to the shared progress card. Grow this list; never shrink it. */
const WITH_PROGRESS = ['LipsyncStudio.tsx'];
// The standalone Montage / Dubbing / Slides / 3D / Music studio PAGES were deleted with the old shell (2026-10-01,
// docs/DESIGN.md §13); their work happens in the studio's ServiceParamsPanel, which is held to the same bar below.

describe('progress parity', () => {
  it.each(WITH_PROGRESS)('%s uses the shared GenerationProgress card', (f) => {
    expect(src(f)).toContain('<GenerationProgress');
  });

  it.each(WITH_PROGRESS)('%s drives it from a real elapsed clock', (f) => {
    // A card with a frozen `elapsed` is the same lie as the bar it replaced. Assert the CONTRACT — the
    // value comes from a wall-clock delta — not one spelling of it: Music floors to whole seconds on a
    // 250ms interval and is just as correct, and an over-specific regex failed it for no reason.
    expect(src(f)).toMatch(/setElapsed\([^)]*Date\.now\(\)\s*-/);
  });

  it.each(WITH_PROGRESS)('%s resets the clock when the run ends', (f) => {
    // Otherwise the next run starts its estimate from the previous run's total.
    expect(src(f)).toMatch(/if \(!busy\) \{ setElapsed\(0\); return; \}/);
  });
});

describe('the in-studio service panels (successor of the deleted standalone studios)', () => {
  const panel = () => src('ServiceParamsPanel.tsx');

  it('show the shared progress card', () => {
    expect(panel()).toContain('<GenerationProgress');
  });

  it('take files through a picker and the shared upload hook — never a typed URL on a phone', () => {
    expect(panel()).toContain('<Dropzone');
    expect(panel()).toContain('useUpload(');
  });
});

describe('the history a user can actually reach', () => {
  /**
   * ⚠️ THERE IS NOW EXACTLY ONE. OmniStudio used to carry a second history panel behind a trigger with
   * `className="hidden"` — unreachable, and I polished it before noticing. It is deleted: the list a
   * user sees is ChatChrome's sidebar, and OmniStudio keeps only the handlers the sidebar drives through
   * window events. Two UIs for one thing meant every future fix had a coin-flip chance of landing in
   * the invisible one.
   */
  const chrome = () => readFileSync(join(dir, 'ChatChrome.tsx'), 'utf8');

  it('the sidebar groups by date', () => {
    expect(chrome()).toContain('convGroups');
  });

  it('the sidebar can be searched', () => {
    expect(chrome()).toContain('convQuery');
    expect(chrome()).toContain('convMatches');
  });

  it('the sidebar filters BEFORE grouping', () => {
    // Grouping the unfiltered list would show empty date headings for a query that matches nothing.
    expect(chrome()).toContain('for (const c of convMatches)');
  });

  it('the sidebar delete stays tappable without hover', () => {
    // opacity-100 by default, hidden only from md up — the inverse of the trap in the hidden panel.
    expect(chrome()).toMatch(/opacity-100[^"]*md:opacity-0/);
  });
});

describe('no studio is left with a bare spinner', () => {
  /**
   * ⚠️ MUSIC WAS THE LAST ONE, AND IT HID BEHIND A COUNTER. It ticked the seconds inside the button
   * label — which looks like progress and is not: no stage, and no sense of whether 140s is normal for
   * a render that runs to ~250s. Against an unknown ceiling that reads as a hang, and the reasonable
   * response is to press again and pay twice.
   */
  const studios = readdirSync(dir).filter((f) => /Studio\.tsx$/.test(f));

  it('every studio with an elapsed clock also renders a shared progress card', () => {
    // Either shared card counts: GenerationProgress (the panel studios) or ResultCard (OmniStudio's feed,
    // a tile in the result's own shape — docs/DESIGN.md §8). What is forbidden is a clock with neither.
    const clockButNoCard = studios.filter((f) => {
      const s = src(f);
      return s.includes('setElapsed') && !s.includes('<GenerationProgress') && !s.includes('<ResultCard');
    });
    expect(clockButNoCard).toEqual([]);
  });

  it('OmniStudio draws its in-flight jobs with ResultCard, never a bare spinner tile', () => {
    const s = src('OmniStudio.tsx');
    expect(s).toContain('<ResultCard');
    // The batch grid used to render `<Loader2 … animate-spin />` alone in a grey tile for every pending variation.
    expect(s).not.toMatch(/items-center justify-center text-app-muted\/50"><Loader2/);
  });
});

describe('there is only one chat-history UI', () => {
  it('OmniStudio no longer renders a second panel', () => {
    // The duplicate is what made "I fixed it" and "the user sees it fixed" two different statements.
    const s = src('OmniStudio.tsx');
    expect(s).not.toContain('historyOpen');
    expect(s).not.toContain('openHistory');
  });

  it('but it keeps the handlers the sidebar drives', () => {
    // Deleting these would break the delete for real — the sidebar has no other way to reach them.
    const s = src('OmniStudio.tsx');
    expect(s).toContain('myavatar:delete-conversation');
    expect(s).toContain('myavatar:clear-conversations');
    expect(s).toContain('const removeConversation');
    expect(s).toContain('const clearAllConversations');
  });
});
