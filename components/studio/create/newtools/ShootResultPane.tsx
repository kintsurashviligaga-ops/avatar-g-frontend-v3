'use client';

/**
 * ShootResultPane — the CENTRE of the Interior designer and the Photographer: the latest outputs, each with the studio's
 * existing result actions (ResultCard: open · download · use as reference; ResultActions: download · share · save to the
 * Library), and — for the interior — the two secondary actions, each with ITS OWN price on ITS OWN button.
 *
 * Before the first press it is the tool's welcome: what it does in three steps, and the models-and-prices list (the owner's
 * ref6: a table of what each thing costs). On a desktop it sits between the navigation and the settings column; on a phone it
 * is the feed the settings sheet closes onto.
 *
 * Presentation only. It owns no job and polls nothing: the runs, their tiles and every handler come from useShootStudio.
 * Honest by construction — a failed tile says why and offers one retry; a tile that was cancelled says so; „3D plan" is
 * disabled (with its reason) for a run that began from nothing; and the 3D plan's caption says what it is (the room's layout,
 * not the redesign).
 */
import { useEffect, useState } from 'react';
import { Clapperboard, Loader2, Move3d, RefreshCw, SlidersHorizontal, Sparkle, Trash2, X } from 'lucide-react';
import { ResultCard, type ResultState } from '@/components/studio/ui/ResultCard';
import { ResultActions } from '@/components/studio/ui/ResultActions';
import { NOTE_BASE, NOTE_TONE } from '@/components/studio/ui/tokens';
import { creditsLabel } from '@/lib/credits/quote';
import { shootTargetSec, type ShootAspect } from '@/lib/studio/shootQuote';
import type { ShootKind } from '@/lib/studio/shootWire';
import { SHOOT_COPY, shootLang, type ShootCopy } from './copy';
import { runBusy, type PlanState, type ShootRun, type ShootTile } from './shootRuns';
import { PlanView } from './PlanView';

export interface ShootPaneProps {
  tool: ShootKind;
  locale: string;
  runs: readonly ShootRun[];
  /** What each thing costs, from the functions its route charges with (lib/studio/shootQuote). */
  prices: { image: number; plan3d: number; walkthrough: number };
  onOpenImage: (url: string) => void;
  onRetry: (runId: string, tileId: string) => void;
  onCancel: (jobId: string | undefined) => void;
  onAnother: (runId: string, tileId: string) => void;
  onPlan3d: (runId: string, tileId: string) => void;
  onWalkthrough: (url: string) => void;
  onUseAsReference: (tool: ShootKind, url: string, aspect: ShootAspect) => void;
  onDismissRun: (runId: string) => void;
  onDismissTile: (runId: string, tileId: string) => void;
  onClear: (tool: ShootKind) => void;
  /** Phone: bring the settings sheet back (the composer's tool chip does the same). */
  onOpenSettings: () => void;
}

/** The price on a button: a sparkle and the number, like the Generate pill. */
function Price({ credits }: { credits: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums" aria-hidden="true">
      <Sparkle size={12} fill="currentColor" strokeWidth={0} />{credits}
    </span>
  );
}

const ACTION_BTN =
  'inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-app-border/20 bg-app-elevated px-3 text-left text-[13px] font-semibold leading-tight text-app-text transition-colors hover:border-app-accent/50 hover:text-app-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60';

// ─── The 3D plan under a tile ─────────────────────────────────────────────────────────────────────────────────────

function PlanCard({ plan, copy }: { plan: PlanState; copy: ShootCopy }) {
  if (plan.status === 'running') {
    return (
      <div data-testid="plan-running" role="status" className="space-y-2 rounded-2xl bg-app-elevated/50 p-4 ring-1 ring-app-border/10">
        <p className="flex items-center gap-2 text-[13px] font-medium text-app-text"><Loader2 size={15} className="animate-spin" aria-hidden="true" />{copy.plan3dBusy}</p>
        <div className="h-[3px] overflow-hidden rounded-full bg-app-border/20" role="progressbar" aria-label={copy.plan3dBusy} aria-valuemin={0} aria-valuemax={100} aria-valuenow={plan.pct}>
          <div className="h-full bg-app-accent transition-[width] duration-700 ease-out" style={{ width: `${Math.max(4, plan.pct)}%` }} />
        </div>
      </div>
    );
  }
  if (plan.status === 'error') return <p role="alert" data-testid="plan-error" className={`${NOTE_BASE} ${NOTE_TONE.error}`}>{plan.error}</p>;
  return <PlanView geometry={plan.geometry} style={plan.style} copy={copy} />;
}

// ─── One tile ────────────────────────────────────────────────────────────────────────────────────────────────────

function Tile({ run, tile, now, copy, locale, p }: { run: ShootRun; tile: ShootTile; now: number; copy: ShootCopy; locale: string; p: ShootPaneProps }) {
  const state: ResultState = tile.status === 'ready' ? 'ready' : tile.status === 'error' ? 'error' : tile.status === 'queued' ? 'queued' : 'rendering';
  const lang = shootLang(locale);
  const hasSource = tile.photoIndex >= 0 && !!run.photos[tile.photoIndex];
  const elapsed = tile.startedAt ? Math.max(0, Math.round((now - tile.startedAt) / 1000)) : 0;
  const planBusy = tile.plan?.status === 'running';
  return (
    <div data-testid="shoot-tile" data-state={tile.status} className="min-w-0 space-y-2">
      <ResultCard
        kind="image" aspect={tile.aspect} state={state} locale={lang} size="tile" elapsedSec={elapsed} capSec={shootTargetSec(run.quality)}
        {...(tile.url ? { media: { type: 'image' as const, url: tile.url } } : {})}
        {...(tile.error ? { error: tile.error } : {})}
        onCancel={() => p.onCancel(tile.jobId)}
        onRetry={() => p.onRetry(run.id, tile.id)}
        onDismiss={() => p.onDismissTile(run.id, tile.id)}
        {...(tile.url ? { onOpen: () => p.onOpenImage(tile.url!), onUseAsRef: () => p.onUseAsReference(run.tool, tile.url!, tile.aspect) } : {})}
      />
      {tile.status === 'ready' && tile.url && (
        <div className="space-y-2">
          <ResultActions url={tile.url} kind="image" locale={lang} prompt={run.prompt} />
          <button type="button" onClick={() => p.onAnother(run.id, tile.id)} title={copy.anotherTip} data-testid="tile-another" className={ACTION_BTN}>
            <span className="inline-flex min-w-0 items-center gap-2"><RefreshCw size={15} aria-hidden="true" className="shrink-0" /><span>{copy.another}</span></span>
            <Price credits={p.prices.image} />
          </button>
          {run.tool === 'interior' && (
            <>
              <button type="button" onClick={() => p.onPlan3d(run.id, tile.id)} disabled={!hasSource || planBusy} data-testid="tile-plan3d"
                title={hasSource ? copy.plan3dTip : copy.plan3dNeedsPhoto} aria-label={`${copy.plan3d} — ${creditsLabel(p.prices.plan3d, locale)}${hasSource ? '' : ` — ${copy.plan3dNeedsPhoto}`}`}
                className={ACTION_BTN}>
                <span className="inline-flex min-w-0 items-center gap-2"><Move3d size={15} aria-hidden="true" className="shrink-0" /><span>{copy.plan3d}</span></span>
                <Price credits={p.prices.plan3d} />
              </button>
              <button type="button" onClick={() => p.onWalkthrough(tile.url!)} data-testid="tile-walkthrough" title={copy.walkthroughTip}
                aria-label={`${copy.walkthrough} — ${creditsLabel(p.prices.walkthrough, locale)}. ${copy.walkthroughNote}`} className={ACTION_BTN}>
                <span className="inline-flex min-w-0 items-center gap-2"><Clapperboard size={15} aria-hidden="true" className="shrink-0" /><span>{copy.walkthrough}</span></span>
                <Price credits={p.prices.walkthrough} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Models & prices (the owner's ref6) ──────────────────────────────────────────────────────────────────────────

export function ModelsPrices({ tool, locale, prices }: { tool: ShootKind; locale: string; prices: ShootPaneProps['prices'] }) {
  const copy = SHOOT_COPY[shootLang(locale)];
  const rows = copy.models[tool];
  const credits = [prices.image, prices.plan3d, prices.walkthrough];
  return (
    <section data-testid="models-prices" aria-labelledby="models-prices-title" className="overflow-hidden rounded-3xl bg-app-elevated/40 ring-1 ring-app-border/10">
      <h3 id="models-prices-title" className="px-5 pb-2 pt-4 text-[15px] font-semibold text-app-text">{copy.modelsTitle}</h3>
      <div className="flex items-center justify-between px-5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-app-muted">
        <span>{copy.modelCol}</span><span>{copy.priceCol}</span>
      </div>
      <ul className="divide-y divide-app-border/10">
        {rows.map((r, i) => (
          <li key={r.name} data-testid="model-row" className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="min-w-0">
              <span className="block text-[14px] font-medium leading-tight text-app-text">{r.name}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-app-muted">{r.note}</span>
            </span>
            <span className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-app-accent">
              {creditsLabel(credits[i] ?? prices.image, locale)}
              {i === 0 && <span className="block text-[11px] font-normal text-app-muted">{copy.perImage}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-5 pb-4 pt-2 text-[12px] leading-snug text-app-muted">
        {copy.qualityNote}{tool === 'interior' ? ` ${copy.walkthroughNote}` : ''}
      </p>
    </section>
  );
}

// ─── The pane ────────────────────────────────────────────────────────────────────────────────────────────────────

const timeOf = (ts: number) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function ShootResultPane(p: ShootPaneProps) {
  const copy = SHOOT_COPY[shootLang(p.locale)];
  const mine = p.runs.filter((r) => r.tool === p.tool);
  const busy = mine.some(runBusy);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  // ⚠️ NO WELCOME CARD. A hero with the tool's description, three numbered steps and a price table used to fill this pane
  // before the first run — and it stayed on screen behind the settings sheet every time the tool was opened and closed
  // (the owner: "remove these description cards"). The settings panel says what to do and its Generate pill carries the
  // price; until there is a result, the pane is empty and the composer is the way back into the panel.
  if (mine.length === 0) return <div data-testid="shoot-empty" />;

  return (
    <div data-testid="shoot-results" className="space-y-5 px-1 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-app-text">{copy.results}</h2>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={p.onOpenSettings} className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 text-[13px] font-medium text-app-muted transition-colors hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 lg:hidden">
            <SlidersHorizontal size={15} aria-hidden="true" /> {copy.settings}
          </button>
          <button type="button" onClick={() => p.onClear(p.tool)} data-testid="shoot-clear" className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 text-[13px] font-medium text-app-muted transition-colors hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
            <Trash2 size={15} aria-hidden="true" /> {copy.clear}
          </button>
        </div>
      </div>
      {mine.map((run) => {
        const n = run.tiles.length;
        const cols = n <= 1 ? 'grid-cols-1 max-w-[420px]' : n === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3';
        const plans = run.tiles.filter((t) => t.plan);
        return (
          <section key={run.id} data-testid="shoot-run" className="space-y-3">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-app-text">{copy.runCaption(run.label, n)}</p>
                <p className="text-[12px] text-app-muted">{timeOf(run.createdAt)}{run.photos.length > 0 ? ` · ${copy.fromPhotos(run.photos.length)}` : ''}</p>
              </div>
              <button type="button" onClick={() => p.onDismissRun(run.id)} aria-label={copy.close} title={copy.close}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className={`grid gap-3 ${cols}`}>
              {run.tiles.map((t) => <Tile key={t.id} run={run} tile={t} now={now} copy={copy} locale={p.locale} p={p} />)}
            </div>
            {plans.map((t) => <PlanCard key={`plan-${t.id}`} plan={t.plan!} copy={copy} />)}
          </section>
        );
      })}
    </div>
  );
}

export default ShootResultPane;
