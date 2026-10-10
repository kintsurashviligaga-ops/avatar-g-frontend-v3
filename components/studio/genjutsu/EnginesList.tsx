'use client';

/**
 * EnginesList — the "models & prices" list (Higgsfield's API playground lists every model variant with its price;
 * here it doubles as the picker): one row per engine variant, with the price the server charges for it, or the plain
 * words "live price after upload" for the provider-quoted ones, and an Open / Soon chip that is the capabilities answer.
 *
 * The scene prices are the SAME numbers the Generate button shows and the route charges — they come from
 * lib/genjutsu/pricing, never from a literal here. A row is a button (44 px): tapping it picks that op and quality.
 * Only the rows of the modes the panel offers (`ops`) are listed, so a closed mode is not advertised here either.
 */
import { Check } from 'lucide-react';
import { Disclosure } from '@/components/studio/ui/controls';
import { modelLabel } from '@/lib/genjutsu/engines';
import { genjutsuCredits } from '@/lib/genjutsu/pricing';
import { toLang, type GenjutsuOp, type GenjutsuQuality } from '@/lib/genjutsu/types';
import { copyFor } from './copy';

interface Row { op: GenjutsuOp; quality: GenjutsuQuality }
const ROWS: readonly Row[] = [
  { op: 'scene', quality: 'fast' },
  { op: 'scene', quality: 'standard' },
  { op: 'motion', quality: 'standard' },
  { op: 'motion', quality: 'pro' },
  { op: 'swap', quality: 'standard' },
];

export interface EnginesListProps {
  locale: string;
  op: GenjutsuOp;
  quality: GenjutsuQuality;
  /** null = capabilities not answered yet (no chip shown, nothing promised). */
  open: Record<GenjutsuOp, boolean | null>;
  onSelect: (op: GenjutsuOp, quality: GenjutsuQuality) => void;
  /** The modes the panel offers; rows of any other mode are not listed. */
  ops: readonly GenjutsuOp[];
}

export function EnginesList({ locale, op, quality, open, onSelect, ops }: EnginesListProps) {
  const c = copyFor(locale);
  const lang = toLang(locale);
  return (
    <div data-testid="vfx-engines">
      <Disclosure label={c.engines}>
        <ul className="space-y-1">
          {ROWS.filter((r) => ops.includes(r.op)).map((r) => {
            const credits = genjutsuCredits({ op: r.op, quality: r.quality });
            const on = r.op === op && r.quality === quality;
            const state = open[r.op];
            return (
              <li key={`${r.op}-${r.quality}`}>
                <button
                  type="button"
                  data-engine={`${r.op}-${r.quality}`}
                  aria-pressed={on}
                  onClick={() => onSelect(r.op, r.quality)}
                  className={`flex min-h-[48px] w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/70 ${on ? 'bg-app-accent/10 ring-1 ring-app-accent/30' : 'hover:bg-app-elevated/60'}`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">{on && <Check size={14} className="text-app-accent" aria-hidden="true" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-app-text">{modelLabel(r.op, r.quality, lang)}</span>
                    <span className="block text-[11px] leading-snug text-app-muted">{c.mode[r.op]} · {credits === null ? c.liveQuote : c.creditsWord(credits)}</span>
                  </span>
                  {state !== null && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${state ? 'bg-app-success/10 text-app-success ring-app-success/25' : 'bg-app-elevated text-app-muted ring-app-border/15'}`}>
                      {state ? c.enginesOpen : c.enginesSoon}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Disclosure>
    </div>
  );
}
