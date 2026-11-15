/**
 * components/studio/montage/smart/smartActions.ts — the Smart Editor's calls to its routes, and what each answer does
 * to the edit (Phase 8.7). Shared by the AI panel (one button at a time) and Agent G's smart edit (runSmartOps, every
 * op of a sentence in order). The fetch is injected, so every rule is tested without a network.
 *
 * MONEY: only captions cost anything (✦2 per started minute, charged by the route after the words came back). Agent G's
 * run never makes that call by itself: the panel opens with the captions ready and their price on the button, and the
 * person taps it (GG: nothing paid starts without the person seeing its price).
 */
import { syncClipsToBeat } from '@/lib/services/montage/smart/beat';
import type { SmartOp } from '@/lib/services/montage/smart/ops';
import type { SilencePlan, Sensitivity } from '@/lib/services/montage/smart/silence';
import { newId, type Edit, type MediaSource } from '../project';
import { applyBeat, applySilence, applyTemplate, glitchEveryCut, type SmartState } from './smartEdit';

export type Fetcher = typeof fetch;

export interface RouteAnswer { ok: boolean; status: number; j: Record<string, unknown> | null }

export async function postJson(f: Fetcher, url: string, body: unknown): Promise<RouteAnswer> {
  try {
    const res = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, j: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return { ok: false, status: 0, j: null };
  }
}

const refBody = (ref: string) => (/^https?:/i.test(ref) ? { url: ref } : { path: ref });

export type PauseResult = { ok: true; plans: Array<{ clipId: string; plan: SilencePlan }> } | { ok: false; answer: RouteAnswer };

/** Pauses in every video clip of the edit (free). Filler words too when captions exist and `fillers` is on. */
export async function findPausePlans(f: Fetcher, edit: Edit, sources: Record<string, MediaSource>, smart: SmartState, sensitivity: Sensitivity, fillers: boolean): Promise<PauseResult> {
  const plans: Array<{ clipId: string; plan: SilencePlan }> = [];
  for (const c of edit.clips) {
    const s = sources[c.sourceId];
    if (!s || s.kind !== 'video' || s.status !== 'ready' || !s.ref) continue;
    const words = fillers ? smart.captions?.wordsBySource[s.id] : undefined;
    const r = await postJson(f, '/api/v2/montage/smart/silence', {
      ...refBody(s.ref), startSec: c.startSec, endSec: c.endSec, sensitivity,
      ...(words?.length ? { words, lang: smart.captions!.lang } : {}),
    });
    if (!r.ok) return { ok: false, answer: r };
    const plan = (r.j?.plan ?? null) as SilencePlan | null;
    if (plan && !plan.untouched) plans.push({ clipId: c.id, plan });
  }
  return { ok: true, plans };
}

/** Every plan applied in one edit; `tooMany` when a clip was left whole for Montage's 12-piece cap. */
export function applyPausePlans(edit: Edit, plans: ReadonlyArray<{ clipId: string; plan: SilencePlan }>, idOf: () => string = () => newId('clip')): { edit: Edit; tooMany: boolean } {
  let cur = edit;
  let tooMany = false;
  for (const { clipId, plan } of plans) {
    const r = applySilence(cur, clipId, plan, idOf);
    if (r.ok) cur = r.value; else if (r.reason === 'too_many_pieces') tooMany = true;
  }
  return { edit: cur, tooMany };
}

export type BeatResult =
  | { ok: true; edit: Edit; grid: SmartState['grid']; bpm: number | null; synced: boolean }
  | { ok: false; answer?: RouteAnswer; error?: string };

/** The music's beat (free) and the clips laid on it. */
export async function beatCut(f: Fetcher, edit: Edit, sources: Record<string, MediaSource>, idOf: () => string = () => newId('clip')): Promise<BeatResult> {
  const music = edit.musicId ? sources[edit.musicId] : undefined;
  if (!music?.ref || music.status !== 'ready') return { ok: false, error: 'no_music' };
  const r = await postJson(f, '/api/v2/montage/smart/beat', refBody(music.ref));
  if (!r.ok) return { ok: false, answer: r };
  const grid = (r.j?.grid ?? null) as SmartState['grid'];
  const res = syncClipsToBeat({
    clips: edit.clips.map((c) => {
      const s = sources[c.sourceId];
      return { id: c.id, sourceId: c.sourceId, kind: s?.kind === 'image' ? 'image' as const : 'video' as const, sourceSec: s?.durationSec && s.durationSec > 0 ? s.durationSec : c.endSec };
    }),
    musicSec: Number(r.j?.durationSec ?? music.durationSec),
    grid,
    musicFromSec: edit.musicStartSec,
    idOf,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, edit: applyBeat(edit, res.clips, res.musicStartSec), grid, bpm: res.bpm, synced: res.beatSynced };
}

// ── Agent G's smart edit ─────────────────────────────────────────────────────────────────────────────────────────

export type StepStatus = 'done' | 'nothing' | 'waits_for_tap' | 'not_built' | 'needs_music' | 'failed' | 'too_many_pieces';
export interface SmartStep { op: SmartOp['op']; status: StepStatus; detail?: string }

export interface RunResult { edit: Edit; smart: SmartState; steps: SmartStep[]; captionsOp: Extract<SmartOp, { op: 'captions' }> | null }

/**
 * Run a sentence's ops on the edit, in their fixed order (template → format → pauses → AI trim → beat → transition →
 * captions). Free ops run; captions are prepared, not bought (`waits_for_tap`); the AI watch pass is `not_built`. One
 * op failing does not stop the rest, and each step says what happened.
 */
export async function runSmartOps(f: Fetcher, ops: readonly SmartOp[], edit0: Edit, sources: Record<string, MediaSource>, smart0: SmartState, idOf: () => string = () => newId('clip')): Promise<RunResult> {
  let edit = edit0;
  let smart = smart0;
  const steps: SmartStep[] = [];
  let captionsOp: RunResult['captionsOp'] = null;
  let glitch = false;
  for (const op of ops) {
    switch (op.op) {
      case 'template': {
        const r = applyTemplate(edit, smart, op.id);
        edit = r.edit; smart = r.state;
        steps.push({ op: op.op, status: 'done', detail: op.id });
        break;
      }
      case 'aspect':
        edit = { ...edit, aspect: op.aspect };
        steps.push({ op: op.op, status: 'done', detail: op.aspect });
        break;
      case 'removeSilence': {
        const r = await findPausePlans(f, edit, sources, smart, op.sensitivity, op.fillers);
        if (!r.ok) { steps.push({ op: op.op, status: 'failed' }); break; }
        if (!r.plans.length) { steps.push({ op: op.op, status: 'nothing' }); break; }
        const a = applyPausePlans(edit, r.plans, idOf);
        edit = a.edit;
        const n = r.plans.reduce((s, x) => s + x.plan.count, 0);
        const sec = r.plans.reduce((s, x) => s + x.plan.removedSec, 0);
        steps.push({ op: op.op, status: a.tooMany ? 'too_many_pieces' : 'done', detail: `${n}|${Math.round(sec * 10) / 10}` });
        break;
      }
      case 'aiTrim':
        steps.push({ op: op.op, status: 'not_built' });
        break;
      case 'beatSync': {
        const r = await beatCut(f, edit, sources, idOf);
        if (!r.ok) { steps.push({ op: op.op, status: r.error === 'no_music' ? 'needs_music' : 'failed', ...(r.error && r.error !== 'no_music' ? { detail: r.error } : {}) }); break; }
        edit = r.edit; smart = { ...smart, grid: r.grid };
        steps.push({ op: op.op, status: 'done', detail: r.synced && r.bpm ? String(Math.round(r.bpm)) : 'even' });
        break;
      }
      case 'transition':
        if (op.style === 'glitch') glitch = true;
        else edit = { ...edit, clips: edit.clips.map((c, i) => ({ ...c, transition: i === 0 ? 'cut' : op.style as Exclude<typeof op.style, 'glitch'> })) };
        steps.push({ op: op.op, status: 'done', detail: op.style });
        break;
      case 'captions':
        captionsOp = op;
        smart = { ...smart, captions: smart.captions ? { ...smart.captions, style: op.style, ...(op.pos ? { pos: op.pos } : {}) } : smart.captions };
        steps.push({ op: op.op, status: 'waits_for_tap', detail: op.lang });
        break;
    }
  }
  // Glitch is laid on the cuts AFTER pauses and beat have made them.
  if (glitch) smart = { ...smart, tracks: glitchEveryCut(smart, edit) };
  return { edit, smart, steps, captionsOp };
}
