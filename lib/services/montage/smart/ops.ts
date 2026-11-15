/**
 * lib/services/montage/smart/ops.ts — a "smart edit" as a list of timeline operations (Phase 8.7). PURE.
 *
 * "Take these 3 clips, cut the boring parts, add Georgian captions, and put the music on the beat" is, to the editor,
 * four operations in a fixed order:
 *
 *   1 removeSilence   (free)   cut pauses (+ filler words when captions run) out of every talking clip
 *   2 aiTrim          (opt-in) ✦4/min: Gemini watches the clips and marks dull stretches (D3: off unless asked)
 *   3 beatSync        (free)   lay the clips on the song's beat (lib/services/montage/beatPlan)
 *   4 captions        (✦2/min) Chirp 3 words → cards in a style, on the FINAL timeline (after the cuts)
 *   + template / transition / aspect, which only set looks
 *
 * The ORDER matters and is fixed here, whatever order the person said it in: captions are made last so their times
 * already account for the cuts (and the audio sent to Chirp is the shorter, cut one — cheaper); beat sync runs after the
 * silence cut so the shots it lays are the tightened ones. Agent G (PR C) parses a sentence into SmartOp[]; this file
 * validates, orders and prices them; the route runs them.
 */
import type { MontageAspect, MontageTransition } from '../montagePlan';
import { isMontageAspect } from '../montagePlan';
import { isCaptionLang, isCaptionStyle, type CaptionLang, type CaptionPos, type CaptionStyleId } from './captions';
import { SENSITIVITIES, type Sensitivity } from './silence';
import { isTemplateId, TEMPLATES, type TemplateId } from './templates';
import { aiWatchCostUsd, aiWatchCredits, captionCostUsd, captionCredits } from './price';

export type SmartOp =
  | { op: 'template'; id: TemplateId }
  | { op: 'aspect'; aspect: MontageAspect }
  | { op: 'removeSilence'; sensitivity: Sensitivity; fillers: boolean }
  | { op: 'aiTrim' }
  | { op: 'beatSync' }
  | { op: 'transition'; style: MontageTransition | 'glitch' }
  | { op: 'captions'; lang: CaptionLang; style: CaptionStyleId; pos?: CaptionPos };

const ORDER: Record<SmartOp['op'], number> = { template: 0, aspect: 1, removeSilence: 2, aiTrim: 3, beatSync: 4, transition: 5, captions: 6 };
const TRANSITIONS = new Set(['cut', 'crossfade', 'fade', 'flash', 'wipe', 'slide', 'zoom', 'circle', 'pixelize', 'blur', 'glitch']);

/** Validate what came over the wire (or out of the parser): unknown ops dropped, one of each kind kept, put in order. */
export function normalizeOps(raw: unknown): SmartOp[] {
  const list = Array.isArray(raw) ? raw : [];
  const byKind = new Map<SmartOp['op'], SmartOp>();
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>;
    let op: SmartOp | null = null;
    switch (o.op) {
      case 'template': op = isTemplateId(o.id) ? { op: 'template', id: o.id } : null; break;
      case 'aspect': op = isMontageAspect(o.aspect) ? { op: 'aspect', aspect: o.aspect as MontageAspect } : null; break;
      case 'removeSilence': op = { op: 'removeSilence', sensitivity: (SENSITIVITIES as readonly unknown[]).includes(o.sensitivity) ? (o.sensitivity as Sensitivity) : 'normal', fillers: o.fillers !== false }; break;
      case 'aiTrim': op = { op: 'aiTrim' }; break;
      case 'beatSync': op = { op: 'beatSync' }; break;
      case 'transition': op = typeof o.style === 'string' && TRANSITIONS.has(o.style) ? { op: 'transition', style: o.style as MontageTransition | 'glitch' } : null; break;
      case 'captions': op = { op: 'captions', lang: isCaptionLang(o.lang) ? o.lang : 'ka', style: isCaptionStyle(o.style) ? o.style : 'bold-word', ...(o.pos === 'top' || o.pos === 'middle' || o.pos === 'bottom' ? { pos: o.pos } : {}) }; break;
      default: op = null;
    }
    if (op) byKind.set(op.op, op);
  }
  return [...byKind.values()].sort((a, b) => ORDER[a.op] - ORDER[b.op]);
}

/** A template expands into the ops it turns on (the person's own ops win over the template's). */
export function expandTemplate(ops: readonly SmartOp[], lang: CaptionLang = 'ka'): SmartOp[] {
  const t = ops.find((o): o is Extract<SmartOp, { op: 'template' }> => o.op === 'template');
  if (!t) return [...ops];
  const tpl = TEMPLATES[t.id];
  const implied: SmartOp[] = [{ op: 'aspect', aspect: tpl.aspect }, { op: 'transition', style: tpl.transition }];
  if (tpl.removeSilence) implied.push({ op: 'removeSilence', sensitivity: 'normal', fillers: true });
  if (tpl.beatSync) implied.push({ op: 'beatSync' });
  if (tpl.autoCaptions) implied.push({ op: 'captions', lang, style: tpl.captionStyle, pos: tpl.captionPos });
  return normalizeOps([...implied, ...ops]);
}

export interface SmartQuoteLine { op: SmartOp['op']; credits: number; costUsd: number }
export interface SmartQuote {
  credits: number;
  costUsd: number;
  lines: SmartQuoteLine[];
  /** Why an op was dropped before pricing (beat sync with no song, captions on a silent edit). */
  skipped: Array<{ op: SmartOp['op']; reason: 'no_music' | 'no_speech' }>;
}

/**
 * The price before anything runs. `speechSec` = the audio Chirp will hear: the edit's length after the silence cut
 * when one runs (estimated from the plan, or the full length when not yet analysed — the quote can only be HIGHER than
 * the charge, never lower; the route charges what was actually sent).
 */
export function quoteSmartEdit(ops: readonly SmartOp[], o: { editSec: number; speechSec?: number; hasMusic: boolean; hasSpeech: boolean }): SmartQuote {
  const lines: SmartQuoteLine[] = [];
  const skipped: SmartQuote['skipped'] = [];
  for (const op of ops) {
    if (op.op === 'beatSync' && !o.hasMusic) { skipped.push({ op: op.op, reason: 'no_music' }); continue; }
    if (op.op === 'captions') {
      if (!o.hasSpeech) { skipped.push({ op: op.op, reason: 'no_speech' }); continue; }
      const sec = o.speechSec ?? o.editSec;
      lines.push({ op: op.op, credits: captionCredits(sec), costUsd: captionCostUsd(sec) });
    } else if (op.op === 'aiTrim') {
      lines.push({ op: op.op, credits: aiWatchCredits(o.editSec), costUsd: aiWatchCostUsd(o.editSec) });
    } else {
      lines.push({ op: op.op, credits: 0, costUsd: 0 });
    }
  }
  return {
    credits: lines.reduce((s, l) => s + l.credits, 0),
    costUsd: Math.round(lines.reduce((s, l) => s + l.costUsd, 0) * 10_000) / 10_000,
    lines,
    skipped,
  };
}
