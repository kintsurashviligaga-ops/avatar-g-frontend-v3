'use client';

/**
 * CinematicFilmStudio
 * ===================
 * The "30-Second Cinematic Film Studio" surface: three identity slots → a
 * cinematic script box → a real GEL cost ledger → a single Compile action that
 * drives the REAL production pipeline (storyboard → 5 clip renders → editor
 * stitch → score) and mounts the hosted 30-second master.
 *
 * Two modes:
 *   • real (default)   — `driveFilmStudio()` calls /api/chat/orchestrate (+poll)
 *                        and /api/video/assemble; the browser session carries
 *                        auth + the credit charge. No mock timers, no fake URL.
 *   • preview (`preview`) — a clearly-labelled, network-free sample run for the
 *                        Studio landing showcase. It animates the same stages
 *                        and then links to the real Studio instead of fabricating
 *                        a video, so nobody mistakes the demo for a real render.
 *
 * Visual language: premium minimalist — soft near-black surfaces (#090a0f),
 * hairline neutral borders, quiet uppercase micro-labels, and a single white
 * primary action. No loud gradients; the content is the focus.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Upload,
  Cpu,
  Clock,
  Play,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  X,
  ArrowRight,
} from 'lucide-react';
import { formatGEL } from '@/lib/billing/gel';
import { FILM_SCENE_COUNT } from '@/lib/chat/filmPipeline';
import {
  driveFilmStudio,
  estimateFilmCostGel,
  type FilmStudioProgress,
  type FilmStudioMatrix,
  type FilmStudioPhase,
  type FilmLegClientStatus,
} from '@/lib/chat/filmStudioClient';

interface Slot {
  dataUrl: string;
  name: string;
}

interface CinematicFilmStudioProps {
  /** Render the network-free landing showcase instead of the live tool. */
  preview?: boolean;
  locale?: string;
  /** Where the preview CTA points (the real Studio). */
  studioHref?: string;
  className?: string;
}

type DotState = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function legToDot(status: FilmLegClientStatus | undefined, active: boolean): DotState {
  if (status === 'succeeded') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'skipped') return 'skipped';
  if (active) return 'active';
  return 'pending';
}

interface DerivedStage {
  key: string;
  label: string;
  state: DotState;
  previewUrl?: string | null;
}

function deriveStages(progress: FilmStudioProgress | null): DerivedStage[] {
  const m: FilmStudioMatrix | null = progress?.matrix ?? null;
  const phase: FilmStudioPhase = progress?.phase ?? 'idle';
  const rendering = phase === 'rendering' || phase === 'dispatching';
  const total = m?.sceneCount || m?.clips.length || FILM_SCENE_COUNT;

  const stages: DerivedStage[] = [];
  stages.push({
    key: 'storyboard',
    label: 'Storyboard — scene breakdown',
    state: m ? legToDot(m.storyboard, rendering) : phase === 'dispatching' ? 'active' : 'pending',
  });

  const clips = m ? [...m.clips].sort((a, b) => a.ordinal - b.ordinal) : [];
  for (let i = 0; i < total; i++) {
    const clip = clips[i];
    stages.push({
      key: `clip_${i + 1}`,
      label: `Rendering scene ${i + 1} of ${total} — character lock`,
      state: clip ? legToDot(clip.status, rendering) : rendering ? 'active' : 'pending',
      previewUrl: clip?.url ?? null,
    });
  }

  stages.push({
    key: 'stitch',
    label: 'Editor — stitching the final cut',
    state:
      phase === 'assembled'
        ? 'done'
        : phase === 'stitching'
          ? 'active'
          : m
            ? legToDot(m.stitch, false)
            : 'pending',
  });
  stages.push({
    key: 'score',
    label: 'Audio & Foley — scoring the film',
    state: m ? legToDot(m.audio, rendering) : 'pending',
  });
  return stages;
}

// Network-free sample matrix used only by the preview showcase.
function previewMatrix(doneClips: number, audioDone: boolean): FilmStudioMatrix {
  return {
    sceneCount: FILM_SCENE_COUNT,
    seed: 0,
    storyboard: 'succeeded',
    clips: Array.from({ length: FILM_SCENE_COUNT }, (_, i) => ({
      ordinal: i + 1,
      status: (i < doneClips ? 'succeeded' : 'pending') as FilmLegClientStatus,
      url: null,
    })),
    stitch: 'pending',
    audio: audioDone ? 'succeeded' : 'pending',
  };
}

export function CinematicFilmStudio({
  preview = false,
  locale = 'en',
  studioHref = '/studio/film',
  className,
}: CinematicFilmStudioProps) {
  const [slots, setSlots] = useState<(Slot | null)[]>([null, null, null]);
  const [prompt, setPrompt] = useState('');
  const [driving, setDriving] = useState(false);
  const [progress, setProgress] = useState<FilmStudioProgress | null>(null);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewDone, setPreviewDone] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const estCost = estimateFilmCostGel();
  const canCompile = preview ? !driving : !driving && prompt.trim().length > 0;

  const handlePick = useCallback(async (idx: number, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setSlots((prev) => {
        const next = [...prev];
        next[idx] = { dataUrl, name: file.name };
        return next;
      });
    } catch {
      /* ignore unreadable file */
    }
  }, []);

  const clearSlot = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  }, []);

  const runPreview = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    setError(null);
    setMasterUrl(null);
    setPreviewUrl(null);
    setPreviewDone(false);
    setDriving(true);
    setProgress({ phase: 'dispatching', matrix: null, message: '', masterUrl: null, previewUrl: null });

    const steps: { at: number; p: FilmStudioProgress }[] = [];
    for (let i = 1; i <= FILM_SCENE_COUNT; i++) {
      steps.push({
        at: 500 + i * 650,
        p: { phase: 'rendering', matrix: previewMatrix(i, false), message: '', masterUrl: null, previewUrl: null },
      });
    }
    steps.push({
      at: 500 + (FILM_SCENE_COUNT + 1) * 650,
      p: { phase: 'stitching', matrix: previewMatrix(FILM_SCENE_COUNT, true), message: '', masterUrl: null, previewUrl: null },
    });
    steps.forEach(({ at, p }) => {
      timersRef.current.push(setTimeout(() => setProgress(p), at));
    });
    timersRef.current.push(
      setTimeout(() => {
        setProgress({
          phase: 'assembled',
          matrix: { ...previewMatrix(FILM_SCENE_COUNT, true), stitch: 'succeeded' },
          message: '',
          masterUrl: null,
          previewUrl: null,
        });
        setPreviewDone(true);
        setDriving(false);
      }, 500 + (FILM_SCENE_COUNT + 2) * 650),
    );
  }, []);

  const runReal = useCallback(async () => {
    setError(null);
    setMasterUrl(null);
    setPreviewUrl(null);
    setProgress({ phase: 'dispatching', matrix: null, message: '', masterUrl: null, previewUrl: null });
    setDriving(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await driveFilmStudio({
        prompt,
        referenceImages: slots.filter((s): s is Slot => !!s).map((s) => s.dataUrl),
        locale,
        signal: ctrl.signal,
        onProgress: (p) => setProgress(p),
      });
      setMasterUrl(res.masterUrl);
      setPreviewUrl(res.previewUrl);
      if (!res.ok && res.error) setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setDriving(false);
      abortRef.current = null;
    }
  }, [prompt, slots, locale]);

  const handleCompile = useCallback(() => {
    if (!canCompile) return;
    if (preview) runPreview();
    else void runReal();
  }, [canCompile, preview, runPreview, runReal]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    setDriving(false);
  }, []);

  const stages = deriveStages(progress);
  const showTracker = driving || (progress && progress.phase !== 'idle');
  const finished = progress?.phase === 'assembled';

  return (
    <div
      className={[
        'w-full max-w-3xl mx-auto bg-[#090a0f] border border-neutral-900 rounded-3xl overflow-hidden shadow-2xl text-neutral-200',
        className ?? '',
      ].join(' ')}
    >
      {/* ── Header (minimal) ───────────────────────────────────────── */}
      <div className="px-6 py-5 sm:px-8 bg-[#0b0c14]/50 backdrop-blur-md border-b border-neutral-900/70 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-medium tracking-wide text-white truncate">
              30-Second Cinematic Film Studio
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              Identity stitching · AI generation · beat-sync editing
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-neutral-800 bg-neutral-900/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          {preview ? 'Live Preview' : 'Live Core Pipeline'}
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-8">
        {/* ── Stage 1: Persona ingestion ───────────────────────────── */}
        <div>
          <div className="flex justify-between items-center mb-3 gap-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">
              Stage 01 · Identity Ingestion
            </label>
            <span className="text-[11px] text-neutral-600 font-medium text-right">
              Add 1–3 reference photos (optional)
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[0, 1, 2].map((idx) => {
              const slot = slots[idx];
              const roleLabel = idx === 0 ? 'Face ID — front' : idx === 1 ? 'Profile — side' : 'Lighting ref';
              return (
                <div
                  key={idx}
                  className="relative aspect-[4/5] rounded-2xl border border-neutral-900 bg-[#0d0e16]/40 overflow-hidden group hover:border-neutral-700 transition-colors"
                >
                  {slot ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={slot.dataUrl} alt={`Identity ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => clearSlot(idx)}
                        disabled={driving}
                        aria-label="Remove photo"
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center p-3 text-center h-full w-full">
                      <div className="p-2 bg-[#090a0f] rounded-lg border border-neutral-900 mb-2 group-hover:border-neutral-700 transition-colors">
                        <Upload className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                      </div>
                      <span className="text-[11px] sm:text-xs text-neutral-300 font-medium">Identity slot {idx + 1}</span>
                      <span className="text-[10px] text-neutral-600 mt-1">{roleLabel}</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={driving}
                        onChange={(e) => void handlePick(idx, e.target.files)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Stage 2: Cinematic script direction ──────────────────── */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-3">
            Stage 02 · Director Prompt Script
          </label>
          <textarea
            className="w-full min-h-[104px] bg-[#0d0e16]/40 border border-neutral-900 rounded-2xl p-4 text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-neutral-700 transition-colors resize-none leading-relaxed"
            placeholder="Specify mood parameters, camera trajectories, lighting behaviours, and scene transitions… e.g. “A warrior walking through neon-lit Tbilisi at night, cinematic, moody, slow dolly shots.”"
            value={prompt}
            disabled={driving}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {/* ── Stage 3: Resource ledger (real GEL) ──────────────────── */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-3">
            Stage 03 · Predictive Valuation &amp; Resource Ledger
          </label>
          <div className="grid grid-cols-3 gap-px bg-neutral-900/70 border border-neutral-900 rounded-2xl overflow-hidden">
            <LedgerCard icon={<Cpu className="w-3.5 h-3.5" />} label="Scenes" value={`${FILM_SCENE_COUNT}`} unit="× 6s" />
            <LedgerCard icon={<Clock className="w-3.5 h-3.5" />} label="Runtime" value="30" unit="sec" />
            <LedgerCard
              icon={<span className="w-3.5 h-3.5 rounded-full bg-neutral-800 text-neutral-300 text-[10px] flex items-center justify-center font-bold">₾</span>}
              label="Est. cost"
              value={formatGEL(estCost).replace(' ₾', '')}
              unit="GEL"
              accent
            />
          </div>
          <p className="mt-2 text-[11px] text-neutral-600">
            Estimate from the live cost matrix. The exact charge is metered server-side when the render runs.
          </p>
        </div>

        {/* ── Progress tracker (real per-leg status) ───────────────── */}
        {showTracker && (
          <div className="space-y-3 rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
            <div className="flex items-center gap-3">
              {finished ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
              )}
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  {finished ? 'Pipeline complete' : preview ? 'Preview pipeline running' : 'Pipeline executing'}
                </span>
                <p className="text-xs text-neutral-300 mt-0.5">{progress?.message || 'Working…'}</p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {stages.map((s) => (
                <li key={s.key} className="flex items-center gap-2.5 text-xs">
                  <StatusDot state={s.state} />
                  <span
                    className={
                      s.state === 'done'
                        ? 'text-neutral-300'
                        : s.state === 'active'
                          ? 'text-white'
                          : s.state === 'failed'
                            ? 'text-rose-300'
                            : 'text-neutral-600'
                    }
                  >
                    {s.label}
                  </span>
                  {s.previewUrl && (
                    <video
                      src={s.previewUrl}
                      muted
                      playsInline
                      className="ml-auto h-7 w-12 rounded object-cover border border-neutral-800"
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/25 bg-rose-950/15 p-4 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Output ───────────────────────────────────────────────── */}
        {masterUrl && !preview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
              <CheckCircle2 className="w-4 h-4" />
              <span>Master ready · 30-second film</span>
            </div>
            <div className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden border border-neutral-900">
              <video src={masterUrl} controls playsInline className="w-full h-full object-contain bg-black" />
            </div>
            <a
              href={masterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white"
            >
              Open / download master <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* First-scene fallback when the editor couldn't host the master. */}
        {!masterUrl && previewUrl && !preview && (
          <div className="space-y-2">
            <p className="text-[11px] text-amber-300/90">Editor still finishing — showing the first rendered scene.</p>
            <div className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden border border-neutral-900">
              <video src={previewUrl} controls playsInline className="w-full h-full object-contain bg-black" />
            </div>
          </div>
        )}

        {/* Preview-mode CTA — never fabricates a video. */}
        {preview && previewDone && (
          <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-5 text-center space-y-3">
            <p className="text-sm text-neutral-200 font-medium">
              This is a live preview of the pipeline. Open the Studio to generate your real 30-second film.
            </p>
            <Link
              href={studioHref}
              className="inline-flex items-center gap-2 rounded-2xl bg-white text-black hover:bg-neutral-200 px-5 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors"
            >
              Open Film Studio <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* ── Action ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCompile}
            disabled={!canCompile}
            className={[
              'flex-1 py-3.5 px-6 rounded-2xl font-semibold text-xs tracking-widest uppercase transition-all',
              !canCompile
                ? 'bg-neutral-900/40 text-neutral-600 cursor-not-allowed'
                : 'bg-white text-black hover:bg-neutral-200 shadow-lg active:scale-[0.99]',
            ].join(' ')}
          >
            {driving
              ? preview
                ? 'Running preview…'
                : 'Producing film…'
              : 'Run automated 30-second production'}
          </button>
          {driving && (
            <button
              type="button"
              onClick={handleCancel}
              className="py-3.5 px-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 text-xs font-semibold text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </button>
          )}
        </div>

        {!preview && (
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-600">
            <Play className="w-3 h-3" />
            Real render · requires sign-in · credits charged on completion
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Small presentational atoms ──────────────────────────────────────────────

function LedgerCard({
  icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="p-4 bg-[#090a0f] flex flex-col justify-center">
      <div className="flex items-center gap-2 text-neutral-600 mb-1">
        {icon}
        <span className="text-[10px] uppercase font-bold tracking-wider">{label}</span>
      </div>
      <div className={`text-base font-bold tracking-tight ${accent ? 'text-white' : 'text-neutral-200'}`}>
        {value} <span className="text-xs font-normal text-neutral-600">{unit}</span>
      </div>
    </div>
  );
}

function StatusDot({ state }: { state: DotState }) {
  if (state === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (state === 'active') return <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />;
  if (state === 'failed') return <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
  if (state === 'skipped') return <span className="w-3.5 h-3.5 rounded-full border border-neutral-700 shrink-0" />;
  return <span className="w-3.5 h-3.5 rounded-full border border-neutral-700 shrink-0" />;
}

export default CinematicFilmStudio;
