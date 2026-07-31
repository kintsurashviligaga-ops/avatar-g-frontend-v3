'use client';

/**
 * The shared control set for every service panel — Video, Photo, Music, 3D, Avatar, Remix, Montage,
 * Dubbing, Presentation.
 *
 * WHY THESE EXIST. Every panel used to build its own buttons, chips and fields from raw Tailwind, and
 * they had drifted: the same control had different radii, paddings and text sizes depending on which
 * service you opened, and most interactive elements were 26–36px tall on a phone, under the 44px floor.
 * The layout containers had drifted too, which is where the real damage was — an un-prefixed
 * `grid-cols-4` or a non-wrapping flex row pushes the whole page sideways on a 380px screen, and the
 * Georgian and Russian strings here run 1.5–2× longer than the English ones the layouts were eyeballed
 * against.
 *
 * Everything below is mobile-first and CANNOT overflow: rows wrap, grids start at one or two columns and
 * widen upward, and nothing carries a fixed pixel width. See ./tokens for the class strings themselves
 * and for the reasoning behind each canonical value.
 */

import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppToggle } from '@/components/ui/AppToggle';
import {
  PANEL, GROUP, ROW, LABEL, SECTION_TITLE, HINT,
  FIELD, TEXTAREA, SELECT,
  CHIP_BASE, CHIP_ON, CHIP_OFF,
  BTN_PRIMARY, BTN_SECONDARY, BTN_GHOST, ICON_BTN,
  NOTE_BASE, NOTE_TONE, type NoteTone,
  DROPZONE, DROPZONE_IDLE, DROPZONE_OVER, DROPZONE_FILLED,
} from './tokens';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

// ── LAYOUT ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * A service panel card.
 *
 * `overflow-x-hidden` is deliberate and load-bearing: it makes a stray wide child (a long unbroken
 * Georgian word, a pasted URL) clip inside the panel instead of widening the page and giving the whole
 * app a horizontal scrollbar. Vertical scrolling stays inside the panel via `maxHeight`.
 */
export function Panel({ children, className, maxHeight }: { children: ReactNode; className?: string; maxHeight?: string }) {
  return (
    <div
      className={cx(PANEL, 'overflow-x-hidden', maxHeight && 'overflow-y-auto overscroll-contain', className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}

/** One logical cluster of parameters. Grouping is what makes a panel readable without instructions. */
export function Group({ title, hint, children, className }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx(GROUP, 'min-w-0 space-y-2', className)}>
      {title != null && <div className={cx(SECTION_TITLE, 'flex min-w-0 items-center gap-1.5')}>{title}</div>}
      {hint != null && <p className={HINT}>{hint}</p>}
      {children}
    </div>
  );
}

/** Panel header: title on the left, an optional action on the right. Wraps rather than squashing. */
export function PanelHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <span className={cx(SECTION_TITLE, 'min-w-0 truncate')}>{title}</span>
      {action}
    </div>
  );
}

/**
 * A row of chips or small controls.
 *
 * Wrapping is the whole point. A `flex` row that cannot wrap is the single most common way this UI broke
 * on a phone: six chips of Georgian text will not fit 380px, and without `flex-wrap` they push the page
 * instead of moving to a second line.
 */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(ROW, 'min-w-0', className)}>{children}</div>;
}

/**
 * A responsive grid that starts NARROW and widens.
 *
 * `cols` is the widest it ever gets; it is 1 column below 480px and 2 up to 640px, regardless. Panels
 * used to hardcode `grid-cols-3` / `grid-cols-4`, which on a 380px screen gives ~85px columns — enough
 * to clip a Russian label mid-word.
 */
export function Grid({ cols = 2, children, className }: { cols?: 2 | 3 | 4; children: ReactNode; className?: string }) {
  const wide = cols === 4 ? 'md:grid-cols-4' : cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
  return <div className={cx('grid grid-cols-1 gap-2 min-[480px]:grid-cols-2', wide, className)}>{children}</div>;
}

// ── TEXT ────────────────────────────────────────────────────────────────────────────────────────────

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label className={LABEL} htmlFor={htmlFor}>{children}</label>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className={HINT}>{children}</p>;
}

// ── INPUTS ──────────────────────────────────────────────────────────────────────────────────────────

export const Field = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Field({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(FIELD, className)} {...rest} />;
  },
);

/**
 * A textarea that GROWS to fit what is in it, up to a cap.
 *
 * ⚠️ A FIXED `rows` CANNOT BE CORRECT HERE, which is why this is not just a bigger number. How many
 * lines a string occupies depends on the language and the viewport: the 75-character Georgian
 * placeholder on the music studio wraps to four lines at 375px while its English equivalent takes two,
 * and the global 16px font floor (see FIELD) makes every line 28px tall. Measured before this change:
 * a `rows={3}` box was 110px tall holding 138px of content, so the placeholder was cut mid-word — and
 * any number I picked would simply move which language it broke in.
 *
 * So the box measures itself instead. `rows` becomes the MINIMUM, `maxHeight` the ceiling, and past the
 * ceiling it scrolls. Runs on mount and on every value change, so it is correct for a controlled value
 * that was set programmatically as well as for typing.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxHeightPx?: number }>(
  function TextArea({ className, rows = 3, maxHeightPx = 220, value, onChange, ...rest }, ref) {
    const inner = useRef<HTMLTextAreaElement | null>(null);

    const fit = useCallback((el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = 'auto'; // release the previous height so scrollHeight reports the real content
      el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
      el.style.overflowY = el.scrollHeight > maxHeightPx ? 'auto' : 'hidden';
    }, [maxHeightPx]);

    // Layout effect, not effect: resize before paint so the box never flashes at the wrong height.
    useLayoutEffect(() => { fit(inner.current); }, [fit, value]);

    return (
      <textarea
        ref={(node) => {
          inner.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }}
        rows={rows}
        value={value}
        onChange={(e) => { fit(e.currentTarget); onChange?.(e); }}
        className={cx(TEXTAREA, className)}
        {...rest}
      />
    );
  },
);

/**
 * A native `<select>` with a drawn arrow.
 *
 * The arrow is an SVG ELEMENT, not a background image, because both background-image routes failed —
 * the Tailwind arbitrary value compiled to nothing and the equivalent globals.css rule broke the
 * bundler. See the note on SELECT in ./tokens. `pointer-events-none` keeps the click falling through to
 * the select underneath, so the arrow is decoration and never a dead zone.
 */
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <span className="relative block min-w-0">
        <select ref={ref} className={cx(SELECT, className)} {...rest}>{children}</select>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    );
  },
);

/**
 * A labelled field with a live character counter.
 *
 * The counter is not decoration. Several routes here silently truncate — a lip-sync script at 1200
 * characters, a caption at 200, lyrics at 360 — while the box that fed them accepted far more and said
 * nothing, so the user's words simply stopped appearing partway through the result. A visible ceiling is
 * the cheapest possible fix for that class of bug.
 */
export function LabelledField({
  label, hint, maxLength, value, children,
}: { label: ReactNode; hint?: ReactNode; maxLength?: number; value?: string; children: ReactNode }) {
  const len = typeof value === 'string' ? value.length : null;
  const near = maxLength != null && len != null && len > maxLength * 0.9;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className={cx(LABEL, 'mb-0')}>{label}</span>
        {maxLength != null && len != null && (
          <span className={cx('shrink-0 text-[10px] tabular-nums', near ? 'text-amber-400' : 'text-app-muted/60')}>
            {len}/{maxLength}
          </span>
        )}
      </div>
      {children}
      {hint != null && <p className={cx(HINT, 'mt-1')}>{hint}</p>}
    </div>
  );
}

// ── CHIPS ───────────────────────────────────────────────────────────────────────────────────────────

export function Chip({
  active, onClick, children, disabled, title,
}: { active?: boolean; onClick?: () => void; children: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cx(CHIP_BASE, active ? CHIP_ON : CHIP_OFF)}
    >
      {children}
    </button>
  );
}

/** A single-choice chip group. One control, one obvious state — no more ad-hoc `.map` per panel. */
export function ChipGroup<T extends string>({
  value, onChange, options, label, disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ id: T; label: ReactNode; title?: string }>;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0">
      {label != null && <Label>{label}</Label>}
      <Row>
        {options.map((o) => (
          <Chip key={o.id} active={value === o.id} onClick={() => onChange(o.id)} disabled={disabled} title={o.title}>
            {o.label}
          </Chip>
        ))}
      </Row>
    </div>
  );
}

// ── BUTTONS ─────────────────────────────────────────────────────────────────────────────────────────

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; full?: boolean };

function withLoading({ loading, children }: { loading?: boolean; children: ReactNode }) {
  return (
    <>
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span className="min-w-0 truncate">{children}</span>
    </>
  );
}

/** The one action a panel exists to perform. Disabled and loading are visually distinct, always. */
export function PrimaryButton({ className, loading, full, children, disabled, ...rest }: BtnProps) {
  return (
    <button type="button" disabled={disabled || loading} className={cx(BTN_PRIMARY, full && 'w-full', className)} {...rest}>
      {withLoading({ loading, children })}
    </button>
  );
}

export function SecondaryButton({ className, loading, full, children, disabled, ...rest }: BtnProps) {
  return (
    <button type="button" disabled={disabled || loading} className={cx(BTN_SECONDARY, full && 'w-full', className)} {...rest}>
      {withLoading({ loading, children })}
    </button>
  );
}

export function GhostButton({ className, loading, full, children, disabled, ...rest }: BtnProps) {
  return (
    <button type="button" disabled={disabled || loading} className={cx(BTN_GHOST, full && 'w-full', className)} {...rest}>
      {withLoading({ loading, children })}
    </button>
  );
}

export function IconButton({
  className, children, label, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx(ICON_BTN, className)} {...rest}>
      {children}
    </button>
  );
}

// ── TOGGLE ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * A labelled switch. The whole row is the target, so the 44px rule holds without the label and the
 * switch drifting apart — and the label wraps rather than pushing the switch off the panel.
 */
export function ToggleRow({
  on, onChange, label, hint, disabled,
}: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex min-h-[44px] min-w-0 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[12.5px] text-app-text">{label}</span>
        {hint != null && <span className={cx(HINT, 'block')}>{hint}</span>}
      </span>
      <AppToggle on={on} onChange={onChange} disabled={disabled} label={typeof label === 'string' ? label : undefined} />
    </div>
  );
}

// ── FEEDBACK ────────────────────────────────────────────────────────────────────────────────────────

/** An inline message. Every panel had its own colour for these; there are four tones and no others. */
export function Note({ tone = 'info', children }: { tone?: NoteTone; children: ReactNode }) {
  return <p className={cx(NOTE_BASE, NOTE_TONE[tone])}>{children}</p>;
}

/**
 * Determinate-when-known, indeterminate-when-not.
 *
 * A bar frozen at 0% reads as "nothing is happening", which is exactly what these long renders look like
 * before their first stage lands — so with no percentage it animates instead of sitting still.
 */
export function ProgressBar({ pct, label }: { pct?: number; label?: ReactNode }) {
  const known = typeof pct === 'number' && Number.isFinite(pct) && pct > 0;
  return (
    <div className="min-w-0 space-y-1">
      {label != null && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-app-muted">
          <span className="min-w-0 truncate">{label}</span>
          {known && <span className="shrink-0 tabular-nums">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-app-elevated">
        <div
          className={cx('h-full rounded-full bg-app-accent transition-[width] duration-500', !known && 'animate-progress-indeterminate')}
          style={{ width: known ? `${Math.min(100, Math.max(0, pct))}%` : '40%' }}
        />
      </div>
    </div>
  );
}

// ── DROPZONE ────────────────────────────────────────────────────────────────────────────────────────

/**
 * File picker + drop target.
 *
 * ⚠️ THE INPUT IS A SIBLING OF THE CLICKABLE ZONE, NEVER A CHILD. A nested input's programmatic
 * `.click()` bubbles back into the zone's own onClick, and iOS Safari cancels the picker outright — a
 * bug that has been introduced here twice. Callers get `File[]`, already snapshotted: `input.files` is a
 * LIVE FileList and resetting `value` empties it, which is how "the picker does nothing on mobile"
 * happened. Both traps are closed here so no caller can reopen them.
 */
export function Dropzone({
  accept, multiple, onFiles, icon, title, hint, filled, disabled, id,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  /** Something is already picked — shows the "filled" treatment. */
  filled?: boolean;
  disabled?: boolean;
  /** Required: ties the label to its sibling input without a ref. */
  id: string;
}) {
  return (
    <>
      <label
        htmlFor={id}
        className={cx(DROPZONE, filled ? DROPZONE_FILLED : DROPZONE_IDLE, disabled && 'pointer-events-none opacity-40')}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add(...DROPZONE_OVER.split(' ')); }}
        onDragLeave={(e) => { e.currentTarget.classList.remove(...DROPZONE_OVER.split(' ')); }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove(...DROPZONE_OVER.split(' '));
          const picked = Array.from(e.dataTransfer.files ?? []);
          if (picked.length) onFiles(picked);
        }}
      >
        {icon != null && <span className="flex h-10 w-10 items-center justify-center rounded-full bg-app-accent/12 text-app-accent">{icon}</span>}
        <span className="text-[13px] font-semibold text-app-text">{title}</span>
        {hint != null && <span className={HINT}>{hint}</span>}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          // Array.from BEFORE the reset — see the note above.
          const picked = Array.from(e.target.files ?? []);
          e.currentTarget.value = '';
          if (picked.length) onFiles(picked);
        }}
      />
    </>
  );
}

// ── PROGRESSIVE DISCLOSURE ──────────────────────────────────────────────────────────────────────────

/**
 * A collapsible "Advanced" drawer.
 *
 * The whole point of these panels is that a novice sees a short, obvious form and a power user can
 * still reach everything. That only works if the advanced set is genuinely CLOSED by default and its
 * trigger reads as optional — a drawer that is open on arrival is just a longer form with a heading.
 *
 * Renders its children only while open. Options inside are inert when closed, which is what makes it
 * safe to put rarely-wanted, high-consequence controls (negative prompts, seeds, bitrates) in here:
 * a value a user never opened is a value they never accidentally changed.
 *
 * `summary` shows what the drawer currently holds while it is shut ("2 changed", "seed 4471"), so
 * closing it never hides a setting the user has actually altered.
 */
export function Disclosure({
  label, summary, children, defaultOpen = false, badge,
}: {
  label: ReactNode;
  /** Short state readout shown while collapsed — never hide a NON-DEFAULT value behind a closed door. */
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Count of non-default settings inside; renders as a dot so a changed drawer is visible when shut. */
  badge?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="min-w-0 rounded-xl border border-app-border/15 bg-app-elevated/25">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-app-elevated/40 active:scale-[0.995]"
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-app-text">{label}</span>
        {!open && badge ? (
          <span className="shrink-0 rounded-full bg-app-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-app-accent">{badge}</span>
        ) : null}
        {!open && summary ? (
          <span className="min-w-0 max-w-[45%] shrink truncate text-[11px] text-app-muted">{summary}</span>
        ) : null}
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={cx('h-4 w-4 shrink-0 text-app-muted transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="space-y-2.5 border-t border-app-border/10 px-3 pb-3 pt-2.5">{children}</div>}
    </div>
  );
}

// ── PRESETS ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * One-tap presets that set SEVERAL parameters at once.
 *
 * This is the control that actually removes the jargon problem. A novice does not want to choose a
 * quality tier, an aspect ratio and a style separately — they want "Instagram Reel" or "Cinematic".
 * The preset writes all of those at once and the individual controls stay visible below, so the choice
 * is a starting point rather than a mode the user is locked into.
 *
 * `activeId` is computed by the caller from the CURRENT values, not stored separately — otherwise a
 * preset stays highlighted after the user edits one of the fields it set, which is a lie about state.
 */
export function PresetRow<T extends string>({
  label, presets, activeId, onPick,
}: {
  label?: ReactNode;
  presets: ReadonlyArray<{ id: T; label: ReactNode; hint?: string; icon?: ReactNode }>;
  /** Derive from live values so an edited preset stops looking selected. */
  activeId?: T | null;
  onPick: (id: T) => void;
}) {
  return (
    <div className="min-w-0">
      {label != null && <Label>{label}</Label>}
      {/* Wraps rather than scrolls: a horizontal scroller hides options behind an edge on the exact
          screens where discoverability matters most. */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            aria-pressed={activeId === p.id}
            title={p.hint}
            className={cx(
              'flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold transition-all active:scale-[0.97]',
              activeId === p.id
                ? 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent/40'
                : 'bg-app-elevated text-app-muted ring-1 ring-app-border/15 hover:text-app-text',
            )}
          >
            {p.icon && <span aria-hidden className="shrink-0">{p.icon}</span>}
            <span className="min-w-0 truncate">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── VISUAL CARD SELECT ──────────────────────────────────────────────────────────────────────────────

/**
 * A grid of tappable cards — the visual alternative to a `<select>` for a small, meaningful choice.
 *
 * Two columns on the narrowest phones and three from 420px. Deliberately NOT four: at 320px a
 * four-column grid gives each card about 68px, which cannot hold a Georgian word without truncating it
 * to the point of uselessness, and Georgian is this product's primary language.
 *
 * Every card is at least 44px tall (TAP_MIN_PX) and its label truncates rather than widening the grid,
 * so no combination of translations can push this off the screen edge.
 */
export function CardSelect<T extends string>({
  value, onChange, options, label, hint, cols = 3, disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ id: T; label: ReactNode; sub?: ReactNode; icon?: ReactNode; title?: string }>;
  label?: ReactNode;
  hint?: ReactNode;
  /** Max columns at >=420px. 2 or 3 only — see the note above about 4. */
  cols?: 2 | 3;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0">
      {label != null && <Label>{label}</Label>}
      <div className={cx('grid gap-1.5', cols === 2 ? 'grid-cols-2' : 'grid-cols-2 min-[420px]:grid-cols-3')}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            title={o.title}
            className={cx(
              'flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-center transition-all active:scale-[0.97] disabled:opacity-40',
              value === o.id
                ? 'bg-app-accent/15 ring-1 ring-app-accent/40'
                : 'bg-app-elevated ring-1 ring-app-border/15 hover:ring-app-border/30',
            )}
          >
            {o.icon && <span aria-hidden className="shrink-0 leading-none">{o.icon}</span>}
            <span className={cx('w-full truncate text-[12px] font-semibold', value === o.id ? 'text-app-accent' : 'text-app-text')}>
              {o.label}
            </span>
            {o.sub && <span className="w-full truncate text-[10px] text-app-muted">{o.sub}</span>}
          </button>
        ))}
      </div>
      {hint != null && <Hint>{hint}</Hint>}
    </div>
  );
}

// ── STEPPER ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * A numeric stepper: two 44px targets and a readout, instead of a native number input.
 *
 * A `<input type="number">` on a phone opens a keyboard, risks the iOS zoom-on-focus problem, and
 * accepts values the caller then has to defend against. The stepper cannot produce an out-of-range
 * value at all — min/max are enforced by the control rather than validated after the fact.
 */
export function Stepper({
  value, onChange, min = 1, max = 99, step = 1, label, hint, suffix, disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  hint?: ReactNode;
  suffix?: ReactNode;
  disabled?: boolean;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const btn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[18px] font-semibold text-app-text transition-colors hover:bg-app-elevated disabled:opacity-30';
  return (
    <div className="min-w-0">
      {label != null && <Label>{label}</Label>}
      <div className="flex items-center gap-1 rounded-xl bg-app-elevated ring-1 ring-app-border/15">
        <button type="button" className={btn} onClick={() => onChange(clamp(value - step))} disabled={disabled || value <= min} aria-label="−">−</button>
        <span className="min-w-0 flex-1 truncate text-center text-[13px] font-semibold tabular-nums text-app-text">
          {value}{suffix ? <span className="ml-1 text-[11px] font-normal text-app-muted">{suffix}</span> : null}
        </span>
        <button type="button" className={btn} onClick={() => onChange(clamp(value + step))} disabled={disabled || value >= max} aria-label="+">+</button>
      </div>
      {hint != null && <Hint>{hint}</Hint>}
    </div>
  );
}
