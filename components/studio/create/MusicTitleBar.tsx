'use client';

/**
 * The Create screen's top row: a Simple | Advanced switch on the left and the engine pill on the right.
 *
 * ⚠️ IT WAS TWO DROPDOWNS. „Advanced ▾" (a menu with two items) sat centred over the balance and the engine pill beside it —
 * two ▾ on one line, one of them hiding a binary choice behind a menu. A two-way choice is a switch you can see: both options
 * on screen, one tap. The balance is the shell's own figure (it is shown there); the price is on the Create button.
 */
import { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MusicEnginePref, MusicEnginesStatus } from '@/lib/studio/musicEngines';
import { EngineList } from './EngineList';
import { musicCreateCopy } from './musicCreateCopy';
import { Dropdown, FloatingPanel, cx } from './primitives';

export type MusicUiMode = 'simple' | 'advanced';

export function MusicTitleBar({
  locale, uiMode, onUiMode, engine, showEngine = true,
}: {
  locale: string;
  uiMode: MusicUiMode;
  onUiMode: (m: MusicUiMode) => void;
  /**
   * The engine pill. On a desktop the centre pane's „Engines & prices" table is the engine picker (with the price per length),
   * so the narrow right column does not repeat it — and the Simple | Advanced switch gets the whole row.
   */
  showEngine?: boolean;
  engine: {
    label: string;
    status: MusicEnginesStatus | null;
    pref: MusicEnginePref;
    onPick: (p: MusicEnginePref) => void;
    instrumental: boolean;
    reference: 'cover' | 'voice' | null;
  };
}) {
  const cc = musicCreateCopy(locale);
  const [engineOpen, setEngineOpen] = useState(false);
  const engineBtn = useRef<HTMLButtonElement>(null);
  const closeEngine = useCallback(() => { setEngineOpen(false); engineBtn.current?.focus(); }, []);

  const modes: ReadonlyArray<{ id: MusicUiMode; name: string; hint: string }> = [
    { id: 'simple', name: cc.modeSimple, hint: cc.modeSimpleHint },
    { id: 'advanced', name: cc.modeAdvanced, hint: cc.modeAdvancedHint },
  ];

  return (
    <div data-testid="music-title" className="flex min-w-0 items-center justify-between gap-2">
      <div role="radiogroup" aria-label={cc.modeMenu} data-testid="music-mode-toggle"
        className={cx('inline-flex min-w-0 rounded-full bg-app-elevated/50 p-0.5 ring-1 ring-app-border/10', !showEngine && 'flex-1')}>
        {modes.map((m) => {
          const on = m.id === uiMode;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={m.hint}
              data-testid={`music-mode-${m.id}`}
              onClick={() => onUiMode(m.id)}
              className={cx(
                'min-h-[44px] min-w-0 flex-1 touch-manipulation truncate rounded-full px-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60',
                on ? 'bg-app-text text-app-bg' : 'text-app-muted hover:text-app-text',
              )}
            >
              {m.name}
            </button>
          );
        })}
      </div>

      {showEngine && <Dropdown open={engineOpen} onClose={closeEngine} className="flex shrink-0 justify-end">
        <button
          ref={engineBtn}
          type="button"
          data-testid="music-engine-pill"
          aria-haspopup="dialog"
          aria-expanded={engineOpen}
          aria-label={`${cc.engine}: ${engine.label}`}
          onClick={() => setEngineOpen((v) => !v)}
          className="inline-flex min-h-[44px] max-w-[8.5rem] items-center gap-1 rounded-full bg-app-elevated/40 px-3 text-[14px] text-app-text ring-1 ring-app-border/15 transition-colors hover:bg-app-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/70"
        >
          <span className="min-w-0 truncate">{engine.label}</span>
          <ChevronDown size={14} aria-hidden="true" className={cx('shrink-0 text-app-muted transition-transform', engineOpen && 'rotate-180')} />
        </button>
        {engineOpen && (
          <FloatingPanel label={cc.engineSheetTitle} align="right" testId="music-engine-menu">
            <EngineList
              locale={locale}
              status={engine.status}
              pref={engine.pref}
              instrumental={engine.instrumental}
              reference={engine.reference}
              onPick={(p) => { engine.onPick(p); closeEngine(); }}
            />
          </FloatingPanel>
        )}
      </Dropdown>}
    </div>
  );
}
