/**
 * lib/video/director/planner.ts — planStoryboard's LLM step: one brief → one DRAFT storyboard (V2).
 *
 * The draft is what the user reviews and edits before approval, so this is the only place an LLM writes words that
 * may reach Veo — and only through the user's approval. Each shot's `prompt` is the final Veo prompt: once frozen it
 * is sent byte-for-byte (V3), so the model is told to write the complete shot (subject, action, setting, camera,
 * light, style, audio) in it, and to repeat the SAME character and style wording in every shot (V4: Veo 3.1 has no
 * style reference, so style consistency lives in the prompts the user approves).
 *
 * What the model does NOT decide: the frame (locked from the input), the length and tier of every shot, the seed and
 * the character reference (both in the consistency lock), the order (1…n as listed), the ids, the approval. The model
 * writes text; the draft's structure comes from the user's input.
 *
 * The LLM is an injected `generate` — this module never touches a provider, a key or the network. ./server.ts binds
 * it to lib/ai/llmText (Gemini only). A reply that is not a usable storyboard throws StoryboardPlanningError;
 * nothing has been charged at this stage, so failing is cheap and the user can plan again.
 */
import { STUDIO_DEFAULT_VEO_TIER } from '@/lib/credits/videoPricing';
import { parseModelJson } from '@/lib/video/longform/director';
import { VEO_REFERENCE_DURATION } from './storyboard';
import type { Shot, Storyboard, StoryboardPlanInput, StoryboardPlanner } from './types';

export const PLANNER_DEFAULT_SHOTS = 3;
export const PLANNER_MAX_SHOTS = 12;
const DEFAULT_SHOT_SECONDS = 8;

export interface PlannerCallOptions {
  system: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  /** Always true: ask for a JSON document. */
  json: true;
}

export type PlannerGenerate = (prompt: string, opts: PlannerCallOptions) => Promise<string | null>;

export class StoryboardPlanningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardPlanningError';
  }
}

export interface GeminiPlannerOptions {
  generate: PlannerGenerate;
  clock?: () => Date;
  newId?: () => string;
  timeoutMs?: number;
}

/** Control characters other than tab and newline: never useful in a prompt, and invisible in the review UI. */
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** A model-written field, cleaned for the draft: control characters removed and the ends trimmed (the inside kept). */
function draftText(v: unknown): string {
  return typeof v === 'string' ? v.replace(CONTROL_CHARS, '').trim() : '';
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function clampShots(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(PLANNER_MAX_SHOTS, Math.max(1, Math.round(n))) : PLANNER_DEFAULT_SHOTS;
}

const SYSTEM = [
  'You are the storyboard planner for a Google Veo 3.1 video pipeline. You write a DRAFT shot list that a human will review, edit and approve.',
  'After approval every shot prompt is sent to Veo exactly as you wrote it — nobody will improve, translate or extend it — so each prompt must be complete on its own.',
  'Rules for every "prompt":',
  '- English, one paragraph, present tense, concrete and visual.',
  '- Cover: subject, action, setting, camera (shot size, angle, movement), lighting, visual style, and sound (dialogue in quotes, sound effects, ambience).',
  '- Describe each recurring character with IDENTICAL wording in every shot they appear in, and repeat the same style wording in every shot.',
  '- No text overlays, captions, logos or brand names unless the brief asks for them.',
  'Each "description" is a one-sentence summary for the user, written in the language of the brief.',
  'Answer with JSON only: {"title": string, "shots": [{"description": string, "prompt": string, "negativePrompt"?: string, "cameraMotion"?: string, "notes"?: string}]}.',
  '"negativePrompt" lists things to avoid as nouns ("blurry footage, extra limbs"), never "no …". Omit it when nothing needs excluding.',
].join('\n');

function userPrompt(input: StoryboardPlanInput, shots: number, seconds: number): string {
  const lines = [
    `Brief: ${input.brief.trim()}`,
    `Shots: exactly ${shots}, each ${seconds} seconds, aspect ratio ${input.aspectRatio}.`,
  ];
  if (input.language) lines.push(`Language of the brief (for the descriptions): ${input.language}`);
  if (input.characterReference) lines.push('A character reference image is attached to every shot by the system: describe that character consistently, do not invent a different look.');
  if (input.styleReference) lines.push(`Style reference from the user (apply it to every prompt): ${input.styleReference}`);
  return lines.join('\n');
}

/**
 * A planner over any text LLM that returns JSON. The draft it builds always has: ids shot-1…n, orders 1…n, the
 * input's frame / length / tier on every shot, seed and character reference in the consistency lock (never per shot,
 * so a shot override stays the user's own act), approvedByUser false, createdBy agent_planner.
 */
export function createGeminiStoryboardPlanner(opts: GeminiPlannerOptions): StoryboardPlanner {
  const clock = opts.clock ?? (() => new Date());
  const newId = opts.newId ?? (() => globalThis.crypto.randomUUID());

  return async (input: StoryboardPlanInput): Promise<Storyboard> => {
    if (!input || typeof input.brief !== 'string' || !input.brief.trim()) throw new StoryboardPlanningError('a brief is required');
    const shotCount = clampShots(input.shotCount);
    // Veo renders a reference image only in an 8 s clip, so 8 s is the default whenever one is set.
    const seconds = input.durationSeconds ?? (input.characterReference ? VEO_REFERENCE_DURATION : DEFAULT_SHOT_SECONDS);
    const quality = input.quality ?? STUDIO_DEFAULT_VEO_TIER;

    let reply: string | null;
    try {
      reply = await opts.generate(userPrompt(input, shotCount, seconds), {
        system: SYSTEM,
        maxTokens: Math.min(8000, 800 + 500 * shotCount),
        temperature: 0.6,
        timeoutMs: opts.timeoutMs ?? 60_000,
        json: true,
      });
    } catch {
      reply = null;
    }
    const parsed = parseModelJson(reply);
    const rawShots = isRecord(parsed) && Array.isArray(parsed.shots) ? parsed.shots : null;
    if (!rawShots) throw new StoryboardPlanningError('the planner returned no storyboard');

    const shots: Shot[] = [];
    for (const raw of rawShots.slice(0, shotCount)) {
      if (!isRecord(raw)) continue;
      const prompt = draftText(raw.prompt);
      if (!prompt) continue;
      const order = shots.length + 1;
      const negativePrompt = draftText(raw.negativePrompt);
      const cameraMotion = draftText(raw.cameraMotion);
      const notes = draftText(raw.notes);
      shots.push({
        id: `shot-${order}`,
        order,
        description: draftText(raw.description),
        prompt,
        ...(negativePrompt ? { negativePrompt } : {}),
        durationSeconds: seconds,
        aspectRatio: input.aspectRatio,
        quality,
        ...(cameraMotion ? { cameraMotion } : {}),
        ...(notes ? { notes } : {}),
      });
    }
    if (shots.length === 0) throw new StoryboardPlanningError('the planner returned no usable shot');

    return {
      id: newId(),
      title: input.title?.trim() || draftText(isRecord(parsed) ? parsed.title : undefined) || 'Untitled storyboard',
      totalDurationSeconds: shots.reduce((sum, s) => sum + s.durationSeconds, 0),
      shots,
      consistencyLock: {
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        ...(input.characterReference ? { characterReference: input.characterReference } : {}),
        ...(input.styleReference ? { styleReference: input.styleReference } : {}),
        aspectRatio: input.aspectRatio,
        enforceAcrossShots: true,
      },
      createdAt: clock().toISOString(),
      createdBy: 'agent_planner',
      approvedByUser: false,
    };
  };
}
