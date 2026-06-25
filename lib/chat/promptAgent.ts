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
  /** Stable role id when a brief has several people ("mother" | "father" | "child"). */
  id?: string;
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
  /** The PRIMARY character (kept for single-subject continuity + back-compat). */
  character: MasterFilmCharacter;
  /** ALL distinct people in the brief (≥1). For a single-subject film this is just
   *  [character]; for an ensemble (mother + father + child) each is locked separately
   *  and every scene imagePrompt describes whoever is on screen with EXACT clothing. */
  characters: MasterFilmCharacter[];
  /** True when the brief features more than one recurring person. */
  isMultiCharacter: boolean;
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
1. CHARACTER LOCK: Detect EVERY recurring person in the brief and create ONE detailed,
   locked description for EACH (age, ethnicity, hair color+length+style, eye color,
   EXACT clothing with colours + accessories, expression). Give each a stable id
   ("mother" | "father" | "child" | "protagonist"). The FIRST/primary person is the
   "character"; ALL people (including the primary) go in the "characters" array. Set
   "isMultiCharacter" true when there is more than one recurring person.

2. VISUAL LOCK: Define ONE color grade, lighting style, and camera aesthetic.
   Apply to ALL scenes.

3. IMAGE PROMPTS: Each scene.imagePrompt must be production-ready and include:
   - [EVERY CHARACTER ON SCREEN] — copy-paste each present person's locked description
     VERBATIM (same clothing colours every time). A two-person scene names BOTH people
     with their exact wardrobe.
   - [SCENE ACTION + LOCATION]
   - [VISUAL STYLE: color grade, lighting]
   - [CAMERA: shot type + angle]
   - "photorealistic, 8k, cinematic, sharp focus"
   - "Negative: blur, distortion, low quality, different face, inconsistent appearance"

SCENE SPECIFICITY RULES (every scene.imagePrompt MUST obey):
   - NEVER write vague actions like "standing", "walking", "doing something".
   - ALWAYS specify: WHO (+ exact clothing) + WHAT GESTURE + WHERE EXACTLY + EXPRESSION.
   - GOOD: "25-year-old Georgian woman in a red wool coat and gold earrings turning
     toward camera with a slight warm smile, narrow old-Tbilisi cobblestone alley lit by
     glowing iron lanterns, soft dusk light"
   - BAD: "a woman standing in a street"
   - Specify the EXACT location detail (not "outdoors" but "suburban street with red-brick
     houses and parked cars"), and a real emotional expression ("concerned", "laughing").

CLOTHING CONTINUITY:
   - In EVERY scene imagePrompt, repeat each present person's EXACT clothing — same colour,
     same style, same accessories. NEVER omit or change wardrobe between scenes.

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
    "id": "protagonist",
    "description": "detailed appearance",
    "imagePromptFragment": "ready-to-paste SD prompt fragment"
  },
  "characters": [
    {
      "id": "mother",
      "description": "detailed appearance + EXACT clothing",
      "imagePromptFragment": "ready-to-paste SD prompt fragment"
    }
  ],
  "isMultiCharacter": false,
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

  const primary: MasterFilmCharacter = {
    ...(str(ch.id) ? { id: str(ch.id) } : {}),
    description: str(ch.description) || fragment,
    imagePromptFragment: fragment,
  };
  // Parse the optional ensemble cast; keep only entries with a usable fragment, and
  // ALWAYS include the primary so `characters` is never empty (back-compat default).
  const castRaw = Array.isArray(o.characters) ? o.characters : [];
  const cast: MasterFilmCharacter[] = castRaw
    .map((c) => {
      const cc = (c ?? {}) as Record<string, unknown>;
      const frag = str(cc.imagePromptFragment) || str(cc.description);
      if (!frag) return null;
      return { ...(str(cc.id) ? { id: str(cc.id) } : {}), description: str(cc.description) || frag, imagePromptFragment: frag } satisfies MasterFilmCharacter;
    })
    .filter((c): c is MasterFilmCharacter => c !== null);
  const dedup = (arr: MasterFilmCharacter[]): MasterFilmCharacter[] => {
    const seen = new Set<string>();
    return arr.filter((c) => { const k = (c.id || c.imagePromptFragment).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  };
  const characters = dedup(cast.length ? [primary, ...cast] : [primary]);
  // Keep the flag consistent with what we actually LOCKED — never claim multi-character
  // when only one usable character survived parsing (the model's hint is advisory).
  const isMultiCharacter = characters.length > 1;

  return {
    character: primary,
    characters,
    isMultiCharacter,
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
 * (fail-open). Capped at PROMPT_AGENT_TIMEOUT_MS (default 45s) — a full MasterFilmBrief
 * (locked character + style + N scene prompts ≈ 1.5k tokens) takes Sonnet ~20-30s, so
 * the original 20s cap timed it out every run and it always fell open to haiku. Both
 * routes that call this declare maxDuration=300, and the call is off the user's
 * board-open hot-path (it runs in the background scriptsOnly step).
 */
export async function runPromptAgent(input: PromptAgentInput): Promise<MasterFilmBrief | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const sceneCount = Math.max(2, Math.min(12, Math.round(input.sceneCount)));
  const timeoutMs = Number(process.env.PROMPT_AGENT_TIMEOUT_MS) || 45_000;
  let settled = false;

  // Primary = Sonnet (best extraction); FALLBACK = the haiku model already proven on
  // prod (the storyboard's Script Agent uses it). The fallback covers BOTH failure
  // modes I can't introspect from here: a slow/timed-out Sonnet AND a Sonnet that
  // isn't entitled on this key — either way the character lock still engages.
  const primary = process.env.ANTHROPIC_PROMPT_AGENT_MODEL ?? 'claude-sonnet-4-6';
  const fallback = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
  const userContent =
    `Brief: ${input.brief.trim().slice(0, 1800)}\n` +
    `Mode: ${input.mode}\n` +
    `Scenes: ${sceneCount}\n` +
    `Length: ${input.length}s\n` +
    `Effect: ${input.effect}\n` +
    `Language: ${input.language}` +
    (input.dialogue && input.dialogue.trim() ? `\nDialogue: ${input.dialogue.trim()}` : '') +
    `\n\nProduce EXACTLY ${sceneCount} scenes.`;

  const tryModel = async (model: string, perCallMs: number): Promise<MasterFilmBrief | null> => {
    const t0 = Date.now();
    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: perCallMs });
    // Scale the output budget with scene count: a 12-scene ENSEMBLE brief repeats each
    // on-screen person's full wardrobe in every scene.imagePrompt, which overflows a flat
    // 3000 cap → truncated JSON → wasted Sonnet call + haiku fallback. Sonnet/Haiku 4.x
    // support far more, so size the cap to the request (small briefs stay cheap).
    const msg = await client.messages.create({
      model, max_tokens: Math.min(8000, 1500 + sceneCount * 400), system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    const brief = coerceBrief(extractJson(text), sceneCount);
    // eslint-disable-next-line no-console
    console.log(`[promptAgent] ${model} ${brief ? 'ok' : 'unparseable'} in ${Date.now() - t0}ms (${brief?.scenes.length ?? 0} scenes)`);
    return brief;
  };

  const work = (async (): Promise<MasterFilmBrief | null> => {
    let brief: MasterFilmBrief | null = null;
    try {
      brief = await tryModel(primary, timeoutMs - 4_000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[promptAgent] primary ${primary} failed → trying ${fallback}:`, err instanceof Error ? err.message : err);
    }
    if (!brief && primary !== fallback) {
      try { brief = await tryModel(fallback, Math.min(20_000, timeoutMs)); }
      catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[promptAgent] fallback failed (fail-open):', err instanceof Error ? err.message : err);
      }
    }
    settled = true;
    return brief;
  })();

  // Backstop race: the per-call timeouts already bound each request, but this guards
  // against the SDK hanging past them so the caller never waits unbounded.
  return Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => {
      // eslint-disable-next-line no-console
      if (!settled) console.warn(`[promptAgent] hard backstop hit after ${timeoutMs + 22_000}ms (fail-open)`);
      resolve(null);
    }, timeoutMs + 22_000)),
  ]);
}
