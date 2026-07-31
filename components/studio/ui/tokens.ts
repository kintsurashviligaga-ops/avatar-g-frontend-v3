/**
 * THE canonical control class strings for every service panel.
 *
 * WHAT THIS REPLACES. Each panel hand-rolled its own controls, and they had quietly drifted apart:
 * four different `field` strings that differ only in radius (rounded-lg vs rounded-xl), padding
 * (px-2.5 py-1.5 vs px-3 py-2.5) and text size (text-sm vs text-[13px] vs unset); pills at 26px tall;
 * icon buttons at 28px; chips at 36px. So the same control looked slightly different depending on which
 * service you had opened, and on a phone half of them were too small to hit reliably — Apple's floor is
 * 44px and nothing here met it.
 *
 * These are exported as STRINGS, not only as components, on purpose. Most panels already do
 * `className={pill}` with a local const; swapping that const for an import is a one-line change per file
 * with no JSX rewrite, so the whole surface can converge without a risky refactor. New code should prefer
 * the components in ./controls.
 *
 * Every value below is the variant that was ALREADY the most common, except where it failed the 44px
 * floor — the one place divergence was resolved by fixing rather than by voting.
 */

/** Minimum tap target, in px. iOS HIG / WCAG 2.5.5. Applies to anything a finger can press. */
export const TAP_MIN_PX = 44;

/**
 * A 44×44 hit area that does not change the visual size, via a centred pseudo-element (see `.tap-44` in
 * globals.css).
 *
 * USE THIS ONLY ON A CONTROL WITH 44px OF CLEARANCE AROUND IT. The halo is invisible, so it silently
 * overlaps close neighbours and steals their taps — which is exactly what happened when the chips and
 * icon buttons used it (see CHIP_BASE). Its one legitimate caller is AppToggle, a lone switch inside a
 * min-h-[44px] row. Anything that sits in a tight row or grid must be honestly 44px instead.
 */
export const TAP = 'tap-44';

// ── SURFACES ────────────────────────────────────────────────────────────────────────────────────────
/** The panel card. Every service panel sits in one of these. */
export const PANEL = 'rounded-2xl border border-app-border/15 bg-app-surface/70 p-3 sm:p-4';
/** A group inside a panel — one logical cluster of parameters. */
export const GROUP = 'rounded-xl border border-app-border/15 bg-app-elevated/40 p-3';
/** A row that must never push the page sideways: wraps instead of overflowing. */
export const ROW = 'flex flex-wrap items-center gap-1.5';

// ── TEXT ────────────────────────────────────────────────────────────────────────────────────────────
export const LABEL = 'mb-1 block text-[11px] font-medium text-app-muted';
export const SECTION_TITLE = 'text-[12.5px] font-semibold text-app-text';
export const HINT = 'text-[11px] leading-snug text-app-muted';

// ── INPUTS ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * Two things about this string are decided by a rule OUTSIDE it — the global
 * `input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select` block in
 * globals.css, whose selector has specificity (0,3,1) and therefore beats any single utility class:
 *
 *   · `!text-app-text` is load-bearing. Without the important flag the colour silently reverts.
 *   · There is deliberately NO font-size utility. That global sets `font-size: max(16px, 1em)` — the
 *     guard against iOS Safari zooming the page when a sub-16px input takes focus — and it wins, so a
 *     `text-[13px]` here would be dead weight that merely LOOKS like it is doing something. Measured:
 *     a Field in the running app computes to exactly 16px.
 *
 * `min-h-[44px]` is the floor guard; the field IS its own tap target, so it never needs `.tap-44`.
 */
export const FIELD =
  'w-full min-h-[44px] rounded-xl border border-app-border/15 bg-app-elevated px-3 py-2.5 !text-app-text ' +
  'outline-none transition-colors placeholder:text-app-muted/50 focus:border-app-accent/60 ' +
  'disabled:cursor-not-allowed disabled:opacity-45';
/**
 * `min-h-[84px]` fits THREE lines at the 17px the global font-size floor forces. With `rows={2}` the
 * Georgian placeholders here were clipped mid-word — measured scrollHeight 104px against a 77px box.
 */
export const TEXTAREA = `${FIELD} min-h-[84px] resize-none leading-relaxed`;
/**
 * A native `<select>`, made to match the fields around it.
 *
 * `appearance-none` is what removes the platform's own dropdown chrome — the reason these controls used
 * to look like they belonged to a different application than everything beside them. `pr-9` reserves the
 * space the arrow occupies, so a long Georgian option label never runs underneath it.
 *
 * The arrow is a REAL ELEMENT rendered by the `Select` component in ./controls, not a background image.
 * Both background-image routes were tried and both failed, in different ways:
 *
 *   · Tailwind `bg-[url('data:image/svg+xml,…')]` compiled to NOTHING. Arbitrary values need `_` in
 *     place of spaces, so the literal spaces in the inline SVG made the class invalid and it was dropped
 *     at build time — measured as `background-image: none` in the running app.
 *   · The same data URI in a plain globals.css rule broke the BUILD: webpack's css-loader tries to
 *     resolve `url(...)` and choked on the unencoded spaces ("Module not found: Can't resolve './...'").
 *
 * An SVG element sidesteps both. It cannot silently fail to compile and it cannot break the bundler.
 */
export const SELECT = `${FIELD} cursor-pointer appearance-none pr-9`;

// ── CHIPS (the single-choice / multi-choice control this app uses everywhere) ────────────────────────
/**
 * ⚠️ NO `.tap-44` HERE, DELIBERATELY — it made adjacent chips steal each other's taps.
 *
 * The first version kept a 33px chip and bolted a 44px transparent halo onto it to hit the tap floor
 * without costing density. Measured in the running app: the halo overhangs the chip by 5.31px on each
 * side, against a 6px row gap. Two stacked chip rows therefore have 10.6px of halo competing for 6px of
 * gutter, so a tap that lands between two rows is claimed by whichever chip is later in the DOM — you
 * press "9:16" and get "16:9". A wrong selection is worse than a tall row, so the chip is now honestly
 * 44px (py-2.5 + the 13px text) and the halo is gone. Rows wrap, so the only cost is vertical space.
 *
 * `.tap-44` survives exactly one caller — AppToggle — where the switch sits alone inside a min-h-[44px]
 * row, so its halo has nothing to collide with.
 */
export const CHIP_BASE =
  'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1 rounded-full px-3.5 py-2.5 ' +
  'text-[13px] font-medium transition-colors active:scale-[0.97] focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:pointer-events-none disabled:opacity-40';
export const CHIP_ON = 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent/40';
export const CHIP_OFF = 'bg-app-elevated text-app-muted ring-1 ring-app-border/15 hover:text-app-text';

// ── BUTTONS ─────────────────────────────────────────────────────────────────────────────────────────
const BTN_BASE =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold ' +
  'transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40';
export const BTN_PRIMARY = `${BTN_BASE} bg-app-accent text-app-bg hover:brightness-110`;
export const BTN_SECONDARY = `${BTN_BASE} border border-app-border/20 bg-app-elevated text-app-text hover:border-app-accent/50 hover:text-app-accent`;
export const BTN_GHOST = `${BTN_BASE} text-app-muted hover:text-app-text`;
/**
 * Square icon button — honestly 44×44, for the same reason as CHIP_BASE.
 *
 * These sit in tight horizontal clusters (↑ ↓ ✕ on a montage shot card, gap-1 = 4px). A 36px button
 * wearing a 44px halo overhangs 4px per side, so the halos of two neighbours meet in the middle of that
 * gap and the arrow you press is not necessarily the arrow that fires. It was 28px before any of this.
 */
export const ICON_BTN =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ' +
  'border-app-border/20 text-app-muted transition-colors hover:border-app-accent/50 hover:text-app-accent ' +
  'active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ' +
  'disabled:pointer-events-none disabled:opacity-30';

// ── FEEDBACK ────────────────────────────────────────────────────────────────────────────────────────
export const NOTE_BASE = 'rounded-lg px-2.5 py-1.5 text-[11.5px] leading-snug ring-1';
export const NOTE_TONE = {
  info: 'bg-app-accent/10 text-app-accent ring-app-accent/20',
  warn: 'bg-amber-400/10 text-amber-300/90 ring-amber-400/20',
  error: 'bg-red-500/10 text-red-300 ring-red-500/25',
  success: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
} as const;
export type NoteTone = keyof typeof NOTE_TONE;

// ── DROPZONE ────────────────────────────────────────────────────────────────────────────────────────
export const DROPZONE =
  'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed ' +
  'px-4 py-6 text-center transition-colors';
export const DROPZONE_IDLE = 'border-app-border/25 bg-app-surface/40 hover:border-app-accent/40';
export const DROPZONE_OVER = 'border-app-accent bg-app-accent/10';
export const DROPZONE_FILLED = 'border-app-accent/40 bg-app-accent/[0.04]';
