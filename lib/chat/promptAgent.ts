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
import { extractJson } from '@/lib/orchestrator/script-breakdown';
import { llmText } from '@/lib/ai/llmText';

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
  /** PHASE 2 L3 — a 6-second ambient SFX cue for THIS scene (no music, no speech),
   *  e.g. "city street ambience, distant cars, footsteps on cobblestone". Optional:
   *  the model may omit it; generateSceneSfxPrompts() derives a fallback from the
   *  scene's location/action/mood so the per-scene SFX bed always has a cue. */
  sfxPrompt?: string;
}

/** PHASE 2 L3 — one per-scene SFX cue, fed to the EXISTING generateFilmSfx() loop. */
export interface MasterFilmSfxCue {
  sceneNumber: number;
  sfxPrompt: string;
  /** ElevenLabs sound-generation length (capped 22s upstream); 6s per scene. */
  duration: number;
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
  /** PHASE 2 L3 — ordered per-scene SFX cues (one per scene). Derived in coerceBrief
   *  from each scene's sfxPrompt (or a fallback). The live film loops the EXISTING
   *  generateFilmSfx() over these instead of one whole-film bed. */
  sfxCues: MasterFilmSfxCue[];
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
  /** Optional primary-model override. The storyboard PREVIEW passes haiku (fast); the
   *  actual film render (filmComposite) omits it → keeps the sonnet default for quality. */
  model?: string;
  /** True when the session has an ACTIVE reference/source image driving the character (a bridged
   *  photo or an uploaded selfie). When set, the agent is FORBIDDEN from inventing a persona — the
   *  photo is the identity ground truth, so it must not guess a character from the (text-only) brief. */
  hasReferenceImage?: boolean;
  /** A vision-extracted description of the uploaded reference person ("an elderly weathered man with a thick white
   *  beard…"). When present it becomes the LITERAL character-lock the agent must carry across every scene — this is
   *  the strongest anti-hallucination signal (the agent is otherwise text-only + blind to the photo). */
  characterVisualId?: string;
}

export const SYSTEM_PROMPT = `You are a Master Film Director.

Your job: analyze the brief and create a complete MasterFilmBrief JSON.

CRITICAL RULES:
0. NO INVENTED PLACEHOLDER CHARACTERS: NEVER fabricate a stock or stereotypical character (a
   generic "older man", a "50-year-old man", a "weathered face", a national-costume figure, a
   chokha / traditional dress, or any template persona) to fill a thin or minimal brief. If the
   brief does not describe a specific person, derive the cast from the THEME/song (rule 1b) — never
   from a cultural cliché, a placeholder example, or a default stereotype.

1. CHARACTER LOCK: Detect EVERY recurring person in the brief and create ONE detailed,
   locked description for EACH (age, ethnicity, hair color+length+style, eye color,
   EXACT clothing with colours + accessories, expression). Give each a stable id
   ("mother" | "father" | "child" | "protagonist"). The FIRST/primary person is the
   "character"; ALL people (including the primary) go in the "characters" array. Set
   "isMultiCharacter" true when there is more than one recurring person.

1b. THEME → CAST: When the brief is a THEME or song rather than a described scene
   (e.g. "friendship song", "love ballad", "a mother's pride", "freedom"), POPULATE the
   cast + action to MATCH the theme — friendship → two or more friends together; love →
   a couple; family → a family; celebration → a group; loss → a solitary grieving figure.
   NEVER default to a single unrelated stranger (e.g. a random man) when the theme implies
   specific people or relationships. For mode "music_video" the brief IS the song's
   subject: EVERY scene must visually tell THAT song's story (its mood, relationships and
   imagery), not a generic portrait.

2. VISUAL LOCK: Define ONE color grade, lighting style, and camera aesthetic.
   Apply to ALL scenes.

3. IMAGE PROMPTS: Each scene.imagePrompt must be production-ready and include:
   - [EVERY CHARACTER ON SCREEN] — copy-paste each present person's locked description
     VERBATIM (same clothing colours every time). A two-person scene names BOTH people
     with their exact wardrobe.
   - [SCENE ACTION + LOCATION]
   - [VISUAL STYLE: color grade, lighting]
   - [CAMERA: shot type + angle]
   - "photorealistic, 8k resolution, crisp details, ultra-realistic texture, professional color grading, ARRI Alexa color science, neutral white balance, sharp focus"
   - "Negative: blur, distortion, low quality, different face, inconsistent appearance, yellow tint, sepia, oversaturated, muddy colours, amber cast"

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

SFX CUES (every scene):
   - Add "sfxPrompt": a 6-second AMBIENT sound-effects description for that scene —
     diegetic environment sound ONLY (no music, no melody, no speech). Describe the
     real-world sounds of the location + action, e.g. "rain on rooftops, distant
     thunder, water dripping" or "busy market crowd murmur, footsteps, vendor calls".
     Keep it under 200 characters.

3b. CINEMATIC CONTINUITY VECTOR (the single most important rule — the film must read as ONE
   continuous piece, not a slideshow of unrelated frames):
   - LINEAR VISUAL PERSISTENCE: every scene.imagePrompt MUST chain to the PREVIOUS scene's visual
     anchors — the SAME protagonist (same face, age, hair, EXACT wardrobe), the SAME world (location
     family, colour palette, lighting temperature, film stock) and a logical progression of place/time.
     Each shot is the NEXT beat of ONE story, never a random unrelated frame.
   - PROTAGONIST IS THE CORE FOCUS: the main character appears in the MAJORITY of shots. For a
     music_video (the singer IS the subject) the SAME performer appears in EVERY shot — do NOT cut to
     empty stages, empty streets or disconnected b-roll that drops her. An establishing shot must still
     include her or lead directly INTO her (e.g. the venue WITH the singer already on stage), never an
     empty room she is absent from.
   - MUSIC_VIDEO = LIVE PERFORMANCE: in a music_video, describe her actively PERFORMING in every shot —
     singing INTO the microphone, mouth open mid-lyric, expressive face and hands, breathing with the
     phrase — so the motion clearly reads as a real vocal performance (the render carries the song's
     audio; the visuals must match a singer mid-song, not a static portrait).
   - FORBIDDEN JUMPS: no structural jump that drops the active character identity, teleports to an
     unrelated setting, or resets the palette/lighting. No "close-up of the woman" → "empty stage"
     whiplash. If in doubt, keep her in frame and move the CAMERA, not the world.

4. SCENE STRUCTURE for 30s/6 scenes — give EACH scene a clear dramatic JOB, but the PROTAGONIST stays
   present and on-model through the whole arc (rule 3b):
   Scene 1: Wide establishing shot — set location + mood WITH the protagonist visible in it (on
            stage / entering frame); for a music_video she is performing from the very first beat
   Scene 2: Medium shot — the character in context, same wardrobe + world
   Scene 3: Close-up — the EMOTIONAL PEAK (the face carries the whole moment)
   Scene 4: Dynamic / tracking shot — movement, energy, momentum (still her)
   Scene 5: Dramatic angle (low-angle, high-angle or profile) — the TURNING POINT
   Scene 6: Slow pull-back or symbolic close — the cinematic resolution (she resolves the frame)
   For other scene counts, keep the establish → develop → peak → turn → resolve arc.

5. For Georgian SETTINGS: use authentic Georgian ENVIRONMENT details (architecture, streets,
   lighting, culture of the PLACE) — but this NEVER dictates or invents the character's identity,
   age, gender, ethnicity or dress. The setting is the world; it is not the person.

6. CINEMATOGRAPHY (add to EVERY scene.imagePrompt, and VARY it per scene so the film
   has motion and rhythm — do not repeat the same camera on every scene):
   - CAMERA MOVEMENT: name one per scene, e.g. slow dolly push-in, smooth tracking shot,
     gentle pan, locked-off static (composed like a photograph), slow crane/tilt up, or
     drone pull-back. Pair it with the scene's shot type from rule 4 (e.g. Scene 1 wide +
     drone descent; Scene 3 close-up + slow push-in; Scene 6 pull-back + crane up).
   - LENS + DEPTH OF FIELD: "85mm portrait lens, f/1.8 shallow depth of field, soft bokeh"
     for close-ups; "wide 24mm" for establishing shots.
   - LIGHTING: name the source + colour temperature, e.g. "warm 3200K golden-hour key from
     upper-left, soft fill" or "cool 5600K overcast daylight".
   - COMPOSITION: apply real framing — rule of thirds, leading lines, foreground depth,
     deliberate negative space; place the subject off-centre on close/medium shots.
   - ATMOSPHERE: add motivated practical lights (neon signs, lanterns, headlights, candles)
     and a touch of atmosphere (haze, mist, dust motes, rain, soft bokeh) so every frame
     has depth and mood — never a flat, empty background.
   - QUALITY TAGS: end each imagePrompt with "photorealistic, 8K resolution, crisp details,
     ultra-realistic texture, professional color grading, ARRI Alexa color science, neutral white
     balance, cinematic color grade, volumetric lighting, film grain, sharp focus, professional
     cinematography". NEVER a yellow, sepia, amber or muddy over-warm cast — keep whites clean and
     neutral even in warm scenes (warmth belongs in motivated practical lights, never a global filter).

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
      "imagePrompt": "FULL ready-to-use prompt",
      "sfxPrompt": "6s ambient SFX for this scene — no music, no speech"
    }
  ],
  "audio": {
    "musicGenre": "...",
    "musicMood": "...",
    "narratorScript": "..."
  }
}`;

/**
 * PHASE 2 L3 — derive one ambient SFX cue per scene. Prefers the model-supplied
 * scene.sfxPrompt; falls back to a deterministic cue built from the scene's
 * location/action/mood so the per-scene SFX bed ALWAYS has usable text (no extra
 * LLM call, fully fail-open). Returned in scene order.
 */
export function generateSceneSfxPrompts(scenes: MasterFilmScene[]): string[] {
  return scenes.map((s) => {
    const explicit = (s.sfxPrompt || '').trim();
    if (explicit) return explicit.slice(0, 200);
    // Deterministic fallback — ambient sound implied by where/what/mood.
    const where = (s.location || '').trim();
    const what = (s.action || '').trim();
    const mood = (s.mood || '').trim();
    const parts = [
      where ? `ambient sound of ${where}` : 'natural ambient room tone',
      what ? `subtle sounds of ${what}` : '',
      mood ? `${mood} atmosphere` : '',
      'no music, no speech',
    ].filter(Boolean);
    return parts.join(', ').slice(0, 200);
  });
}

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
      const sfxPrompt = str(sc.sfxPrompt);
      return {
        sceneNumber: typeof sc.sceneNumber === 'number' ? sc.sceneNumber : i + 1,
        location: str(sc.location),
        action: str(sc.action),
        cameraShot: str(sc.cameraShot, 'medium'),
        mood: str(sc.mood),
        imagePrompt,
        ...(sfxPrompt ? { sfxPrompt } : {}),
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
      negativePrompt: str(vs.negativePrompt, 'blur, distortion, low quality, different face, inconsistent appearance, yellow tint, sepia, oversaturated, muddy colours, amber cast'),
    },
    scenes,
    audio: {
      musicGenre: str(au.musicGenre),
      musicMood: str(au.musicMood),
      narratorScript: str(au.narratorScript),
    },
    // PHASE 2 L3 — one ordered SFX cue per surviving scene (6s each).
    sfxCues: generateSceneSfxPrompts(scenes).map((sfxPrompt, i) => ({
      sceneNumber: scenes[i]?.sceneNumber ?? i + 1,
      sfxPrompt,
      duration: 6,
    })),
  };
}

/**
 * Build the Director's user turn. Exported + pure so the reference-image identity lock (VECTOR 2)
 * and the "produce EXACTLY N scenes" contract are unit-testable without a live LLM call.
 */
export function buildDirectorUserContent(input: PromptAgentInput, sceneCount: number): string {
  return (
    // 4000 (was 1800) so an attached SCRIPT baked into the brief reaches the Director intact —
    // a short prompt is unaffected; only script-driven films use the headroom.
    `Brief: ${input.brief.trim().slice(0, 4000)}\n` +
    `Mode: ${input.mode}\n` +
    `Scenes: ${sceneCount}\n` +
    `Length: ${input.length}s\n` +
    `Effect: ${input.effect}\n` +
    `Language: ${input.language}` +
    (input.dialogue && input.dialogue.trim() ? `\nDialogue: ${input.dialogue.trim()}` : '') +
    // VISION LOCK (strongest): a description was extracted directly FROM the user's photo — use it verbatim as the
    // one true identity. This makes the text-only agent effectively vision-aware and kills the stock-persona drift.
    (input.characterVisualId && input.characterVisualId.trim()
      ? `\n\n[CORE CHARACTER VISUAL ID LOCK] The main character is EXACTLY this real person, extracted directly from the user's uploaded reference photo — this is the GROUND-TRUTH identity, it OVERRIDES any character the brief text might imply: "${input.characterVisualId.trim().slice(0, 500)}". You are STRICTLY FORBIDDEN from substituting a different person: do NOT change the age, gender, ethnicity, face, hair/beard, build or wardrobe; do NOT invent a younger/older or alternate persona (never a "30-year-old man", a skydiver, a chokha, a stock "Georgian" character) and do NOT infer identity from the brief text. In EVERY character field and EVERY scene.imagePrompt (Scene 1 through the last, without exception) describe THIS SAME person by these exact features, photorealistic live-action, never illustrated/animated. The brief text and dialogue only drive the ACTION, wardrobe changes the story explicitly states, camera and setting — never the person's core identity.`
      // FALLBACK — the agent is TEXT-ONLY (it cannot see the photo). With no extracted description it must at least
      // be told, in the strongest terms, to NOT invent a person from the brief text.
      : input.hasReferenceImage
      ? `\n\nCRITICAL — REFERENCE IMAGE ACTIVE: The main character is VISUALLY LOCKED to a reference photo of a REAL person the user already chose. You are STRICTLY FORBIDDEN from inventing, substituting or describing any ALTERNATIVE persona — do NOT invent an older man, a weathered face, a chokha, or any stock "Georgian" character; do NOT turn the subject into a cartoon, anime, illustrated, 3D-rendered or animated character; do NOT swap the subject's gender (never introduce a woman/female profile the photo does not show); and do NOT infer age / gender / ethnicity / wardrobe from the brief text. In EVERY character description and EVERY scene.imagePrompt (Scene 1 through the final scene, without exception), assert the SAME single identity: "the exact same person shown in the reference image — identical face, age, gender, hair, build and wardrobe, photorealistic live-action, never illustrated or animated". Every scene breakdown must maintain that one identity from the photo — no drift, no alternate character, no illustration style.`
      : '') +
    `\n\nProduce EXACTLY ${sceneCount} scenes.`
  );
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
  // Floor 1 (was 2) so a 6s single-scene Cinema clip can be planned. NOTE: the
  // /api/video/assemble stitch requires ≥2 segments, so a true 1-scene film must use
  // the single-clip return path — callers that go through assembly still pass ≥2.
  const sceneCount = Math.max(1, Math.min(12, Math.round(input.sceneCount)));
  // 90s default (was 45s): DeepSeek-V3 leads this chain for character-lock quality and needs
  // ~75s for a 10-scene ensemble brief; this is a background/render call (maxDuration 300).
  const timeoutMs = Number(process.env.PROMPT_AGENT_TIMEOUT_MS) || 90_000;
  const userContent = buildDirectorUserContent(input, sceneCount);
  // Output budget scales with scene count (a 12-scene ensemble repeats each person's full
  // wardrobe in every scene.imagePrompt → a flat cap truncates the JSON).
  const maxTokens = Math.min(8000, 1500 + sceneCount * 400);

  // ONE live-provider chain: DeepSeek-V3 (Atlas) → Gemini → Anthropic. This is the
  // character-lock / master-brief brain; it MUST hit a live model or the render loses
  // identity consistency (Anthropic is dead in prod, which is why this used to fail-open
  // to the deterministic plan). Backstop race guards against any provider hanging.
  const work = (async (): Promise<MasterFilmBrief | null> => {
    const t0 = Date.now();
    const text = await llmText({ system: SYSTEM_PROMPT, user: userContent, maxTokens, temperature: 0.6, timeoutMs: timeoutMs - 4_000 });
    const brief = text ? coerceBrief(extractJson(text), sceneCount) : null;
    // HARD LOCK: when the photo was vision-extracted, the character fragment threaded to the render is the GROUND
    // TRUTH — never the agent's own (text-only) guess, which can still drift. This is what the render conditions on.
    // Assign the locked object to BOTH `character` AND `characters[0]` so no downstream reader (whichever field it
    // reads) ever sees a stale, un-locked identity.
    if (brief && input.characterVisualId && input.characterVisualId.trim()) {
      const vid = input.characterVisualId.trim().slice(0, 400);
      const locked = { ...brief.character, imagePromptFragment: `${vid}, photorealistic live-action, the exact same person in every scene` };
      brief.character = locked;
      if (Array.isArray(brief.characters) && brief.characters.length > 0) brief.characters[0] = locked;
    }
    // eslint-disable-next-line no-console
    console.log(`[promptAgent] ${brief ? 'ok' : 'miss'} in ${Date.now() - t0}ms (${brief?.scenes.length ?? 0} scenes)`);
    return brief;
  })();

  return Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs + 22_000)),
  ]);
}
