/**
 * lib/chat/intentDetector.ts
 * ==========================
 * Detects user intent from natural-language input.
 * Returns a typed intent + confidence so the orchestrator
 * can route to the correct provider (text LLM vs Replicate).
 */

export type IntentCategory =
  | 'text_chat'
  | 'avatar_generation'
  | 'image_generation'
  | 'photo_edit'
  | 'video_generation'
  | 'music_generation'
  | 'visual_analysis'
  | 'workflow_help'
  | 'business_help'
  | 'prompt_improvement';

export interface DetectedIntent {
  intent: IntentCategory;
  confidence: number; // 0-1
  provider: 'replicate' | 'text-llm';
  serviceHint?: string;
}

// ── Keyword / pattern banks per intent ──────────────────────────────────────

interface IntentRule {
  intent: IntentCategory;
  provider: 'replicate' | 'text-llm';
  /** Patterns tested with .test() — first match wins within the bank */
  patterns: RegExp[];
  /** Base confidence when a pattern matches */
  weight: number;
  /** If the active service context matches these, boost confidence */
  contextBoost?: string[];
}

const RULES: IntentRule[] = [
  // ── Avatar generation ──────────────────────────────────────────────
  {
    intent: 'avatar_generation',
    provider: 'replicate',
    weight: 0.85,
    contextBoost: ['avatar'],
    patterns: [
      /\bavatar\b/i,
      /\b(create|generate|make|render|build)\b.*\b(portrait|headshot|character|profile\s*pic)/i,
      /\b(face|identity)\b.*\b(transfer|swap|morph)/i,
      /\binstant[- ]?id\b/i,
      /\bface[- ]?to[- ]?many\b/i,
      /\bსახე|ავატარ|аватар|портрет/i,
    ],
  },
  // ── Image generation ───────────────────────────────────────────────
  {
    intent: 'image_generation',
    provider: 'replicate',
    weight: 0.82,
    contextBoost: ['image', 'interior'],
    patterns: [
      /\b(generate|create|make|render|design)\b.*\b(image|poster|thumbnail|banner|illustration|graphic|artwork)/i,
      /\b(image|poster|thumbnail|banner)\b.*\b(generat|creat|render)/i,
      /\bflux\b/i,
      /\bsdxl\b/i,
      /\bphoto[ -]?real/i,
      /\b3d\s*render/i,
      /\bგამოსახულება|изображение|плакат|постер/i,
    ],
  },
  // ── Photo edit / enhancement ───────────────────────────────────────
  {
    intent: 'photo_edit',
    provider: 'replicate',
    weight: 0.88,
    contextBoost: ['photo'],
    patterns: [
      /\b(upscale|enhance|improve|restore|sharpen|denoise)\b/i,
      /\b(remove|delete)\s*(the\s*)?(background|bg)\b/i,
      /\brembg\b/i,
      /\breal[- ]?esrgan\b/i,
      /\bbefore\s*(\/|and)\s*after\b/i,
      /\bretouch/i,
      /\bsuper[- ]?res/i,
      /\bგაუმჯობესება|улучш|масштаб/i,
    ],
  },
  // ── Video generation ───────────────────────────────────────────────
  {
    intent: 'video_generation',
    provider: 'replicate',
    weight: 0.84,
    contextBoost: ['video', 'editing'],
    patterns: [
      /\b(generate|create|make|render)\b.*\bvideo\b/i,
      /\bvideo\b.*\b(generat|creat|render)/i,
      /\b(promo|reel|clip|trailer|short)\b.*\b(video|film|motion)/i,
      /\btext[- ]?to[- ]?video\b/i,
      /\bimg[- ]?to[- ]?vid/i,
      /\banimate\b/i,
      /\b9\s*:\s*16\b.*\b(video|promo|reel)/i,
      /\bვიდეო|видео|ролик/i,
    ],
  },
  // ── Music generation ───────────────────────────────────────────────
  {
    intent: 'music_generation',
    provider: 'replicate',
    weight: 0.86,
    contextBoost: ['music'],
    patterns: [
      /\b(generate|create|make|compose)\b.*\b(music|beat|song|track|soundtrack|melody|instrumental)/i,
      /\b(music|beat|song|track|soundtrack)\b.*\b(generat|creat|compos)/i,
      /\bmusicgen\b/i,
      /\b(ambient|cinematic|trap|house|orchestral)\b.*\b(track|beat|music)/i,
      /\bмუსიკა|მელოდია|музыка|трек|бит/i,
    ],
  },
  // ── Visual analysis ────────────────────────────────────────────────
  {
    intent: 'visual_analysis',
    provider: 'replicate',
    weight: 0.83,
    contextBoost: ['visual-intel', 'visual-ai'],
    patterns: [
      /\b(describe|analyze|caption|explain|score|audit)\b.*\b(image|photo|picture|visual)/i,
      /\b(image|photo|picture)\b.*\b(descri|analyz|caption|explain)/i,
      /\bvisual\s*(analysis|audit|intel)/i,
      /\bblip\b/i,
      /\bbrand\s*audit\b/i,
      /\banaliz|описа|აღწერ|გაანალიზ/i,
    ],
  },
  // ── Workflow help ──────────────────────────────────────────────────
  {
    intent: 'workflow_help',
    provider: 'text-llm',
    weight: 0.75,
    contextBoost: ['workflow'],
    patterns: [
      /\b(workflow|pipeline|automat|schedul|trigger|dag)\b/i,
      /\b(build|create|set\s*up)\b.*\b(pipeline|workflow|automation)/i,
      /\bgate|retry|step/i,
    ],
  },
  // ── Business help ──────────────────────────────────────────────────
  {
    intent: 'business_help',
    provider: 'text-llm',
    weight: 0.76,
    contextBoost: ['business'],
    patterns: [
      /\b(business\s*plan|strategy|revenue|market\s*analysis|swot|forecast)/i,
      /\b(investor|pitch|memo|executive\s*summary)/i,
      /\bfinancial|roi|kpi|unit\s*economics/i,
      /\bბიზნეს|სტრატეგ|бизнес|стратег/i,
    ],
  },
  // ── Prompt improvement ─────────────────────────────────────────────
  {
    intent: 'prompt_improvement',
    provider: 'text-llm',
    weight: 0.70,
    contextBoost: ['prompt'],
    patterns: [
      /\b(improve|rewrite|optimize|enhance|refine)\b.*\bprompt\b/i,
      /\bprompt\b.*\b(improve|rewrite|optim|enhance)/i,
      /\bnegative\s*prompt/i,
      /\bprompt\s*(engineer|design)/i,
    ],
  },
];

/**
 * Detect intent from user message, optionally boosted by service context.
 */
export function detectIntent(
  message: string,
  serviceContext?: string,
): DetectedIntent {
  if (!message.trim()) {
    return { intent: 'text_chat', confidence: 1.0, provider: 'text-llm' };
  }

  let best: DetectedIntent | null = null;

  for (const rule of RULES) {
    const matched = rule.patterns.some((p) => p.test(message));
    if (!matched) continue;

    let confidence = rule.weight;

    // Boost confidence if the current service page matches
    if (serviceContext && rule.contextBoost?.includes(serviceContext)) {
      confidence = Math.min(1.0, confidence + 0.12);
    }

    if (!best || confidence > best.confidence) {
      best = {
        intent: rule.intent,
        confidence,
        provider: rule.provider,
        serviceHint: rule.contextBoost?.[0],
      };
    }
  }

  // If no pattern matched, fall through to context-based defaults
  if (!best) {
    // Service-context default: if on a generative page, hint generation
    if (serviceContext === 'avatar') return { intent: 'avatar_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'avatar' };
    if (serviceContext === 'image') return { intent: 'image_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'image' };
    if (serviceContext === 'interior') return { intent: 'image_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'interior' };
    if (serviceContext === 'photo') return { intent: 'photo_edit', confidence: 0.55, provider: 'replicate', serviceHint: 'photo' };
    if (serviceContext === 'video') return { intent: 'video_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'video' };
    if (serviceContext === 'music') return { intent: 'music_generation', confidence: 0.55, provider: 'replicate', serviceHint: 'music' };
    if (serviceContext === 'visual-ai' || serviceContext === 'visual-intel') return { intent: 'visual_analysis', confidence: 0.55, provider: 'replicate', serviceHint: 'visual-ai' };
    if (serviceContext === 'business') return { intent: 'business_help', confidence: 0.60, provider: 'text-llm', serviceHint: 'business' };
    if (serviceContext === 'workflow') return { intent: 'workflow_help', confidence: 0.60, provider: 'text-llm', serviceHint: 'workflow' };

    return { intent: 'text_chat', confidence: 0.90, provider: 'text-llm' };
  }

  return best;
}

/**
 * Dispatch-only ALLOWLIST for the AUTONOMOUS chat dispatch (OmniStudio send()). detectIntent's regex
 * banks are deliberately loose — bare model keywords ("flux"/"sdxl"), and `verb .* media-noun` — so a
 * QUESTION ("is flux better than sdxl?"), a DECLARATIVE ("my client asked for a music video"), a
 * COMPLAINT ("the app won't let me generate a video"), or a DELIBERATION ("i can't decide whether to
 * generate a poster") all classify as a generation intent. Auto-firing a PAID render for those is a
 * false-positive hijack, and a blocklist can't enumerate every non-command phrasing. So this returns
 * true ONLY for an IMPERATIVE generate COMMAND — the message must LEAD with a generate verb (optionally
 * a polite "can you …" prefix). Everything else (questions/declaratives/complaints/comparisons) falls
 * through to the text stream. Bias: over-block (a real command not phrased imperatively falls to chat =
 * safe) over over-fire (a wrong charge). NEVER changes detectIntent's classification — other callers
 * keep the raw intent; this only decides whether the message is imperative enough to auto-spend a credit.
 */
export function isGenerativeCommand(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  // Must LEAD with a generate verb, allowing a short chain of polite lead-ins first ("please generate
  // …", "can you make …", "could you please generate …"). The polite set is specific, so a question
  // that starts with how/what/is/should/which (not in the set) can't reach the verb → it isn't a command.
  const leads = /^\s*((please|can|could|would|will|you|u|kindly)\s+){0,3}(make|create|generate|render|compose|design|draw|produce|animate|paint|write\s+me)\b/i.test(s);
  if (!leads) return false;
  // EXCLUDE an EDIT of an EXISTING asset ("make MY/THIS song sound better") — a mixing request with no
  // source in chat → falls to chat. A FRESH generate with a quality descriptor ("make A poster that
  // looks better", "…make it look better than the last one") uses an article/pronoun, not a possessive,
  // so it is NOT excluded and still dispatches.
  if (/^\s*make\s+(my|this|that|the)\b[^?]*\b(sounds?|looks?)\s+(better|good|nicer|louder|clearer|worse|sharper|cleaner)\b/i.test(s)) return false;
  return true;
}

/**
 * Maps intent category to the Replicate service type
 * used by the /api/replicate/* routes.
 */
export function intentToReplicateService(intent: IntentCategory): string | null {
  switch (intent) {
    case 'avatar_generation': return 'avatar';
    case 'image_generation': return 'image';
    case 'photo_edit': return 'photo';
    case 'video_generation': return 'video';
    case 'music_generation': return 'music';
    case 'visual_analysis': return 'visual-ai';
    default: return null;
  }
}
