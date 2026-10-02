'use client';

/**
 * The Create screen's top row (ref2): "Advanced ▾" over the balance in the middle — a Simple / Advanced switch — and the
 * engine pill at the right ("v6-mini ▾" in the reference; ours names the REAL engine, or "Auto").
 *
 * The balance is the shell's own (store/useCreditsBalance, the figure ChatChrome shows); a guest sees a sign-in prompt in
 * its place, not a zero. The pill opens the engines the server would actually run (components/studio/create/EngineList).
 */
import { useCallback, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { formatCreditBalance } from '@/lib/billing/gel';
import type { MusicEnginePref, MusicEnginesStatus } from '@/lib/studio/musicEngines';
import { EngineList } from './EngineList';
import { musicCreateCopy } from './musicCreateCopy';
import { Dropdown, FloatingPanel, cx } from './primitives';

export type MusicUiMode = 'simple' | 'advanced';

export function MusicTitleBar({
  locale, uiMode, onUiMode, balance, guest, onSignIn, engine,
}: {
  locale: string;
  uiMode: MusicUiMode;
  onUiMode: (m: MusicUiMode) => void;
  /** Credits, or null while unknown (or for a guest). */
  balance: number | null;
  guest: boolean;
  onSignIn: () => void;
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
  const [modeOpen, setModeOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const modeBtn = useRef<HTMLButtonElement>(null);
  const engineBtn = useRef<HTMLButtonElement>(null);
  const closeMode = useCallback(() => { setModeOpen(false); modeBtn.current?.focus(); }, []);
  const closeEngine = useCallback(() => { setEngineOpen(false); engineBtn.current?.focus(); }, []);

  const modes: ReadonlyArray<{ id: MusicUiMode; name: string; hint: string }> = [
    { id: 'simple', name: cc.modeSimple, hint: cc.modeSimpleHint },
    { id: 'advanced', name: cc.modeAdvanced, hint: cc.modeAdvancedHint },
  ];
  const current = modes.find((m) => m.id === uiMode)!;

  return (
    <div data-testid="music-title" className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
      <span aria-hidden="true" />

      <Dropdown open={modeOpen} onClose={closeMode} className="text-center">
        <button
          ref={modeBtn}
          type="button"
          data-testid="music-mode-toggle"
          aria-haspopup="menu"
          aria-expanded={modeOpen}
          aria-label={`${cc.modeMenu}: ${current.name}`}
          onClick={() => setModeOpen((v) => !v)}
          className="mx-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-[19px] font-medium text-app-text transition-colors hover:bg-app-elevated/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          <span>{current.name}</span>
          <ChevronDown size={16} aria-hidden="true" className={cx('shrink-0 text-app-muted transition-transform', modeOpen && 'rotate-180')} />
        </button>
        <div className="-mt-1.5 min-h-[18px] text-[13px] leading-[18px] text-app-muted" data-testid="music-balance">
          {guest ? (
            <button type="button" onClick={onSignIn} className="rounded px-1 font-medium text-app-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
              {cc.signInToCreate}
            </button>
          ) : balance !== null ? (
            <span className="tabular-nums">{formatCreditBalance(balance, locale)}</span>
          ) : null}
        </div>
        {modeOpen && (
          <FloatingPanel label={cc.modeMenu} align="center" testId="music-mode-menu">
            <div role="menu" aria-label={cc.modeMenu}>
              {modes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={m.id === uiMode}
                  data-testid={`music-mode-${m.id}`}
                  onClick={() => { onUiMode(m.id); closeMode(); }}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-app-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-app-text">{m.name}</span>
                    <span className="block text-[12px] leading-snug text-app-muted">{m.hint}</span>
                  </span>
                  {m.id === uiMode && <Check size={16} aria-hidden="true" className="shrink-0 text-app-accent" />}
                </button>
              ))}
            </div>
          </FloatingPanel>
        )}
      </Dropdown>

      <Dropdown open={engineOpen} onClose={closeEngine} className="flex justify-end">
        <button
          ref={engineBtn}
          type="button"
          data-testid="music-engine-pill"
          aria-haspopup="dialog"
          aria-expanded={engineOpen}
          aria-label={`${cc.engine}: ${engine.label}`}
          onClick={() => setEngineOpen((v) => !v)}
          className="inline-flex min-h-[44px] max-w-[9.5rem] items-center gap-1.5 rounded-full bg-app-elevated/40 px-3.5 text-[14px] text-app-text ring-1 ring-app-accent/35 transition-colors hover:bg-app-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/70"
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
      </Dropdown>
    </div>
  );
}
