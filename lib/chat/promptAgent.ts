/**
 * lib/chat/promptAgent.ts
 * =======================
 * The MASTER PROMPT AGENT — runs BEFORE every other film agent and produces one
 * coherent `MasterFilmBrief` that all downstream agents share.
 *
 * Why it exists (root-cause fix): the legacy pipeline locked continuity only with
 * a deterministic seed + a GENERIC "the same primary character" text clause
 * (lib/chat/filmPipeline.ts) — the detailed appearance lived only in the raw
 * brief, so each scene's diffusion re-invented the person → characters drifted
 * shot-to-shot. This agent EXTRACTS one detailed, locked character description and
 * one visual style, then writes a ready-to-use `imagePrompt` per scene that embeds
 * the character VERBATIM — so the same identity is asserted in every prompt, with
 * or without an uploaded selfie.
 *
 * Strictly fail-open: any miss (no key, timeout, bad JSON) returns `null` and the
 * caller falls back to the existing deterministic plan — a render NEVER breaks
 * because the Prompt Agent had a bad day.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { extractJson } from '@/lib/orchestrator/script-breakdown';

export interface MasterFilmCharacter {
  /** Detailed, human-readable appearance: age, ethnicity, hair, eyes, clothing, expression. */
  description: string;
  /** Ready-to-paste Stable-Diffusion fragment — prepended IDENTICALLY to every scene prompt. */
  imagePromptFragment: string;
}

export interface MasterFilmVisualStyle {
  colorGrade: string;
  lighting: string;
  cameraStyle: string;
  /** What to avoid — appended after "Negative:" in every prompt. */
  negativePrompt: string;
}

export interface MasterFilmScene {
  sceneNumber: number;
  location: string;
  action: string;
  cameraShot: string;
  mood: string;
  /** FULL ready-to-use image prompt — MUST include the character fragment + style. */
  imagePrompt: string;
}

export interface MasterFilmAudio {
  musicGenre: string;
  musicMood: string;
  narratorScript: string;
}

export interface MasterFilmBrief {
  character: MasterFilmCharacter;
  visualStyle: MasterFilmVisualStyle;
  scenes: MasterFilmScene[];
  audio: MasterFilmAudio;
}

export interface PromptAgentInput {
  brief: string;
  mode: string;
  /** Scenes to plan (2 → ~10s · 6 → ~30s · 12 → ~60s). */
  sceneCount: number;
  length: number;
  effect: string;
  language: string;
  dialogue?: string | null;
}

const SYSTEM_PROMPT = `You are a Master Film Director.

Your job: analyze the brief and create a complete MasterFilmBrief JSON.

CRITICAL RULES:
1. CHARACTER LOCK: Create ONE detailed character description.
   Use it IDENTICALLY in every single scene imagePrompt.
   Include: age, ethnicity, hair (color+length+style), eyes (color),
   clothing (exact description), expression.

2. VISUAL LOCK: Define ONE color grade, lighting style, and camera aesthetic.
   Apply to ALL scenes.

3. IMAGE PROMPTS: Each scene.imagePrompt must be production-ready and include:
   - [CHARACTER DESCRIPTION] (copy-paste identical each time)
   - [SCENE ACTION + LOCATION]
   - [VISUAL STYLE: color grade, lighting]
   - [CAMERA: shot type + angle]
   - "photorealistic, 8k, cinematic, sharp focus"
   - "Negative: blur, distortion, low quality, different face, inconsistent appearance"

4. SCENE STRUCTURE for 30s/6 scenes:
   Scene 1: Wide establishing shot (location context)
   Scene 2: Medium shot (character introduction)
   Scene 3: Close-up (emotion/detail)
   Scene 4: Dynamic angle (peak/action)
   Scene 5: Medium-wide (resolution)
   Scene 6: Pull-back or symbolic close (outro)
   For other scene counts, keep the same establish → develop → peak → resolve arc.

5. For Georgian content: include authentic Georgian visual elements
   (architecture, lighting, culture).

Return ONLY valid JSON. No markdown. No explanation.

JSON structure:
{
  "character": {
    "description": "detailed appearance",
    "imagePromptFragment": "ready-to-paste SD prompt fragment"
  },
  "visualStyle": {
    "colorGrade": "...",
    "lighting": "...",
    "cameraStyle": "...",
    "negativePrompt": "..."
  },
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "...",
      "action": "...",
      "cameraShot": "wide/medium/close-up/drone",
      "mood": "...",
      "imagePrompt": "FULL ready-to-use prompt"
    }
  ],
  "audio": {
    "musicGenre": "...",
    "musicMood": "...",
    "narratorScript": "..."
  }
}`;

/** Coerce an arbitrary parsed object into a strict MasterFilmBrief, or null. */
function coerceBrief(raw: unknown, sceneCount: number): MasterFilmBrief | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ch = (o.character ?? {}) as Record<string, unknown>;
  const vs = (o.visualStyle ?? {}) as Record<string, unknown>;
  const au = (o.audio ?? {}) as Record<string, unknown>;
  const scenesRaw = Array.isArray(o.scenes) ? o.scenes : [];
  const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v.trim() : fb);

  const fragment = str(ch.imagePromptFragment) || str(ch.description);
  // A brief is only useful if it produced a character anchor AND at least one scene
  // with a usable image prompt — otherwise the deterministic fallback is better.
  const scenes: MasterFilmScene[] = scenesRaw
    .map((s, i) => {
      const sc = (s ?? {}) as Record<string, unknown>;
      const imagePrompt = str(sc.imagePrompt) || str(sc.action);
      if (!imagePrompt) return null;
      return {
        sceneNumber: typeof sc.sceneNumber === 'number' ? sc.sceneNumber : i + 1,
        location: str(sc.location),
        action: str(sc.action),
        cameraShot: str(sc.cameraShot, 'medium'),
        mood: str(sc.mood),
        imagePrompt,
      } satisfies MasterFilmScene;
    })
    .filter((s): s is MasterFilmScene => s !== null)
    .slice(0, sceneCount);

  if (!fragment || scenes.length === 0) return null;

  return {
    character: { description: str(ch.description) || fragment, imagePromptFragment: fragment },
    visualStyle: {
      colorGrade: str(vs.colorGrade),
      lighting: str(vs.lighting),
      cameraStyle: str(vs.cameraStyle),
      negativePrompt: str(vs.negativePrompt, 'blur, distortion, low quality, different face, inconsistent appearance'),
    },
    scenes,
    audio: {
      musicGenre: str(au.musicGenre),
      musicMood: str(au.musicMood),
      narratorScript: str(au.narratorScript),
    },
  };
}

/**
 * Run the Master Prompt Agent. Returns a coherent `MasterFilmBrief` or `null`
 * (fail-open). Hard 20s cap so it never stalls the dispatch hot-path.
 */
export async function runPromptAgent(input: PromptAgentInput): Promise<MasterFilmBrief | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_PROMPT_AGENT_MODEL ?? 'claude-sonnet-4-6';
  const sceneCount = Math.max(2, Math.min(12, Math.round(input.sceneCount)));

  const work = (async (): Promise<MasterFilmBrief | null> => {
    try {
      const client = new Anthropic({ apiKey });
      const userContent =
        `Brief: ${input.brief.trim().slice(0, 1800)}\n` +
        `Mode: ${input.mode}\n` +
        `Scenes: ${sceneCount}\n` +
        `Length: ${input.length}s\n` +
        `Effect: ${input.effect}\n` +
        `Language: ${input.language}` +
        (input.dialogue && input.dialogue.trim() ? `\nDialogue: ${input.dialogue.trim()}` : '') +
        `\n\nProduce EXACTLY ${sceneCount} scenes.`;
      const msg = await client.messages.create({
        model,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return coerceBrief(extractJson(text), sceneCount);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[promptAgent] failed (fail-open):', err instanceof Error ? err.message : err);
      return null;
    }
  })();

  return Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
  ]);
}
