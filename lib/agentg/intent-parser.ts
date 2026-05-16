/**
 * Agent G Intent Parser — Gemini 2.5 Flash powered
 * Extracts a structured pipeline plan from a free-form Georgian/English/Russian prompt.
 * Falls back to keyword-based heuristic planner when AI is unavailable.
 */
import 'server-only';

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

export type PipelineStep = {
  /** Internal service identifier matching AgentGSubtask['agent'] extended set */
  agent: string;
  /** What the agent should do */
  action: string;
  /** Structured input for the agent */
  input: Record<string, unknown>;
  /** Whether this step can run in parallel with other parallel steps */
  parallel?: boolean;
  /** Estimated seconds to complete */
  estimatedSeconds?: number;
};

export type IntentPlan = {
  /** Original user goal */
  main_goal: string;
  /** Detected locale of the prompt */
  locale: 'ka' | 'en' | 'ru';
  /** Detected primary intent category */
  category: 'creative' | 'business' | 'social' | 'voice' | 'avatar' | 'hybrid' | 'chat';
  /** Ordered pipeline steps */
  steps: PipelineStep[];
  /** Estimated total seconds (sequential) */
  estimatedSeconds: number;
  /** Total credit cost */
  creditCost: number;
  /** One-sentence Georgian summary of what will happen */
  summaryKa: string;
};

// Credit costs per service
const STEP_CREDITS: Record<string, number> = {
  'chat':            1,
  'image':           10,
  'voice':           5,
  'music':           15,
  'video':           50,
  'avatar':          20,
  'content-writer':  2,
  'terminal':        5,
  'prompt-builder':  1,
  'business-agent':  3,
  'social-media':    2,
  'voice-lab':       5,
  'avatar-builder':  20,
  'marketplace':     3,
};

// Average seconds per service
const STEP_SECONDS: Record<string, number> = {
  'chat':            5,
  'image':           20,
  'voice':           20,
  'music':           75,
  'video':           90,
  'avatar':          30,
  'content-writer':  8,
  'terminal':        5,
  'prompt-builder':  3,
  'business-agent':  10,
  'social-media':    8,
  'voice-lab':       20,
  'avatar-builder':  25,
  'marketplace':     10,
};

const INTENT_SYSTEM_PROMPT = `You are Agent G's Intent Parser. Given a user prompt (in Georgian, English, or Russian), extract a structured pipeline plan as JSON.

Return ONLY valid JSON with this exact shape:
{
  "locale": "ka" | "en" | "ru",
  "category": "creative" | "business" | "social" | "voice" | "avatar" | "hybrid" | "chat",
  "steps": [
    {
      "agent": "<agent-id>",
      "action": "<action-name>",
      "input": { "<key>": "<value>" },
      "parallel": false
    }
  ],
  "summaryKa": "<one sentence Georgian summary of what will be done>"
}

Available agents and their actions:
- "image" / "generate_image" — create an image from a description
- "voice" / "synthesize_voice" — text-to-speech or voice clone
- "music" / "generate_music" — create a music track
- "video" / "generate_video" — create a short video
- "avatar" / "generate_avatar" — create a talking avatar video
- "content-writer" / "write_content" — write articles, posts, scripts
- "terminal" / "run_code" — write or run code
- "prompt-builder" / "build_prompt" — build optimized AI prompts
- "business-agent" / "create_plan" — business plan, strategy, analysis
- "social-media" / "generate_posts" — social media content
- "voice-lab" / "generate_voice" — voice generation with specific options
- "avatar-builder" / "generate_avatar_brief" — avatar concept and brief
- "marketplace" / "prepare_listing" — marketplace listing
- "chat" / "reply" — conversational response only

Rules:
1. Only include steps that the user's prompt actually needs.
2. If the prompt is just a question or conversation (no creative generation needed), use only "chat" step.
3. For Georgian prompts, use locale "ka".
4. Keep input objects minimal and relevant.
5. The summaryKa must be a natural Georgian sentence.
6. Maximum 5 steps.`;

function detectLocale(text: string): 'ka' | 'en' | 'ru' {
  // Count Georgian characters (U+10D0–U+10FF)
  const georgianChars = (text.match(/[ა-ჿ]/g) || []).length;
  // Count Cyrillic characters
  const cyrillicChars = (text.match(/[Ѐ-ӿ]/g) || []).length;

  if (georgianChars > 2) return 'ka';
  if (cyrillicChars > 2) return 'ru';
  return 'en';
}

function heuristicPlan(goal: string): Omit<IntentPlan, 'main_goal' | 'estimatedSeconds' | 'creditCost'> {
  const g = goal.toLowerCase();
  const locale = detectLocale(goal);

  const hasImage  = /(image|picture|photo|draw|paint|sketch|illustrat|render|სურათ|დახატე|ფოტო|изображен|нарисуй|рисунок)/.test(g);
  const hasVoice  = /(voice|audio|narrat|ხმ|speak|произнес|озвуч)/.test(g);
  const hasMusic  = /(music|song|track|მუსიკ|мелодия|трек)/.test(g);
  const hasVideo  = /(video|movie|clip|ვიდეო|видео)/.test(g);
  const hasAvatar = /(avatar|character|persona|ავატარ|персонаж)/.test(g);
  const hasBiz    = /(business|plan|strategy|ბიზნეს|бизнес|analysis)/.test(g);
  const hasSocial = /(social|post|instagram|content|კონტენტ|пост)/.test(g);
  const hasCode   = /(code|function|script|კოდ|код|program)/.test(g);

  const steps: PipelineStep[] = [];

  if (hasImage)  steps.push({ agent: 'image',          action: 'generate_image',         input: { goal } });
  if (hasVoice)  steps.push({ agent: 'voice',          action: 'synthesize_voice',        input: { goal, language: locale } });
  if (hasMusic)  steps.push({ agent: 'music',          action: 'generate_music',          input: { goal } });
  if (hasVideo)  steps.push({ agent: 'video',          action: 'generate_video',          input: { goal } });
  if (hasAvatar) steps.push({ agent: 'avatar-builder', action: 'generate_avatar_brief',   input: { goal } });
  if (hasBiz)    steps.push({ agent: 'business-agent', action: 'create_plan',             input: { goal, depth: 'full' } });
  if (hasSocial) steps.push({ agent: 'social-media',   action: 'generate_posts',          input: { goal, count: 5 } });
  if (hasCode)   steps.push({ agent: 'terminal',       action: 'run_code',                input: { goal } });

  if (steps.length === 0) {
    steps.push({ agent: 'chat', action: 'reply', input: { goal } });
  }

  const creative  = hasImage || hasVoice || hasMusic || hasVideo || hasAvatar;
  const business  = hasBiz || hasSocial;

  let category: IntentPlan['category'] = 'chat';
  if (creative && business) category = 'hybrid';
  else if (creative)  category = 'creative';
  else if (hasBiz)    category = 'business';
  else if (hasSocial) category = 'social';
  else if (hasVoice)  category = 'voice';
  else if (hasAvatar) category = 'avatar';

  const summaryKa = steps.length === 1 && steps[0]?.agent === 'chat'
    ? 'Agent G-ი შენს კითხვაზე გიპასუხებს.'
    : `Agent G-ი ${steps.length} სერვისს გაუშვებს: ${steps.map(s => s.agent).join(', ')}.`;

  return { locale, category, steps, summaryKa };
}

export async function parseIntent(goal: string): Promise<IntentPlan> {
  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const locale = detectLocale(goal);

  let parsed: Omit<IntentPlan, 'main_goal' | 'estimatedSeconds' | 'creditCost'> | null = null;

  // Try Gemini 2.5 Flash for smart intent extraction
  if (geminiKey) {
    try {
      const google = createGoogleGenerativeAI({ apiKey: geminiKey });
      // Use env-configurable model; default to gemini-2.5-flash (same as chat route)
      const intentModel = process.env.GEMINI_INTENT_MODEL ?? 'gemini-2.5-flash';
      const result = await generateText({
        model: google(intentModel),
        system: INTENT_SYSTEM_PROMPT,
        prompt: goal,
        maxOutputTokens: 512,
        maxRetries: 0,
        temperature: 0,
      });

      const jsonText = result.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const obj = JSON.parse(jsonText) as {
        locale?: string;
        category?: string;
        steps?: PipelineStep[];
        summaryKa?: string;
      };

      if (obj && Array.isArray(obj.steps) && obj.steps.length > 0) {
        parsed = {
          locale: (obj.locale === 'ka' || obj.locale === 'en' || obj.locale === 'ru') ? obj.locale : locale,
          category: (obj.category as IntentPlan['category']) ?? 'hybrid',
          steps: obj.steps.slice(0, 5),
          summaryKa: obj.summaryKa ?? 'Agent G-ი შეასრულებს დავალებას.',
        };
      }
    } catch {
      // Gemini failed → fall through to heuristic
    }
  }

  // Heuristic fallback
  if (!parsed) {
    parsed = heuristicPlan(goal);
  }

  const creditCost = parsed.steps.reduce((sum, s) => sum + (STEP_CREDITS[s.agent] ?? 5), 0);
  const estimatedSeconds = parsed.steps.reduce((sum, s) => sum + (STEP_SECONDS[s.agent] ?? 10), 0);

  return {
    main_goal: goal,
    ...parsed,
    estimatedSeconds,
    creditCost,
  };
}
