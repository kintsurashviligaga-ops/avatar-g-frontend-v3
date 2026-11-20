/**
 * lib/agent/engine/reel.ts — „Reel Task": one Georgian sentence (and, if the user has one, a product photo) → a finished
 * 9:16 Reel, as ONE engine plan the user approves once (GG 2026-11-20, the „Gemini Tasks" analysis).
 *
 * Why a fixed template and not a free planner: Google's own Tasks product (gemini.google.com, the Gemini app) is a
 * consumer feature with no developer API, so it cannot be embedded in myavatar.ge. What can be copied is its shape —
 * goal → plan → one confirmation → background steps with live status → pause / stop / take over → delivered files. For
 * a Reel the steps are always the same kinds, so the plan is BUILT here from a checked brief, never written by a model:
 * the price the user sees is the price book's (lib/credits), not a guess, and no prompt text can add a tool, a step or
 * a link. The model only writes the script, inside the `write` step, as data.
 *
 *   understandReel(text, ctx)  →  a brief + the defaults it assumed, or at most two Georgian questions
 *   reelPlan(brief, lang)      →  a Plan (passes parsePlan) + each step's price, + the confirmation line
 *   reelPanel(run, lang)       →  what the task panel shows: steps, states, prices, which buttons work, what failed
 *   retryOf / alternativeOf    →  the next run after a failure: done steps reused (never paid twice), or a cheaper path
 *
 * Pure, no network, isomorphic. Not wired: AGENT_REEL_TASK (off | admins | everyone) is off by default, and the engine
 * itself (#308) is still a draft. Wiring needs the Phase 3.5 executors (docs/v5.1-phase3/01-wiring-plan.md).
 */
import { quoteCredits } from '@/lib/credits/quote';
import { omniClipCredits } from '@/lib/credits/priceBook';
import { parsePlan } from './plan';
import { checkpointsOf } from './scheduler';
import type { Checkpoint, EngineRun, EngineTool, Plan, PlanStep, StepStatus } from './types';

export type Lang = 'ka' | 'en' | 'ru';
const pick = (l: string | undefined): Lang => (l === 'en' ? 'en' : l === 'ru' ? 'ru' : 'ka');

/** The tools a Reel plan is made of (the engine's VALIDATE still checks each one for this user). */
export const REEL_TOOLS: readonly EngineTool[] = ['write', 'image', 'video', 'speech', 'music', 'montage', 'export'];

/** Omni Flash renders 4 / 6 / 8 / 10 s; Veo 4 / 6 / 8 s. A Reel task is one clip (longer films stay in the Video tool). */
export type ReelSeconds = 4 | 6 | 8 | 10;
export const REEL_DEFAULT_SECONDS: ReelSeconds = 8;

export interface ReelBrief {
  /** The user's own words (data for the script step, never instructions). */
  request: string;
  /** A photo the user sent (storage path or our signed link): the clip's first frame. Absent → a frame is drawn first. */
  photo?: string;
  seconds: ReelSeconds;
  resolution: '720p' | '1080p';
  /** A spoken Georgian line in the clip: rendered by Omni Flash with the characters' own voices (GG 2026-10-26). */
  georgianLine: boolean;
  /** A separate voice-over (read-aloud) mixed over the clip — only when the user asks for a narrator. */
  narration: boolean;
  music: boolean;
  /** Burned-in captions (needs the Smart Editor caption pass, #365; refused by VALIDATE until it is on). */
  captions: boolean;
}

export type Understood =
  | { ok: true; brief: ReelBrief; assumed: string[] }
  | { ok: false; questions: string[] };

const has = (re: RegExp, s: string) => re.test(s);

/** „Make me a reel / TikTok / short from this photo" — the asks this task is for (the router sends the rest elsewhere). */
export function isReelAsk(text: string): boolean {
  const s = String(text ?? '').toLowerCase();
  const reel = /\breels?\b|\bshorts?\b|tiktok|ტიკტოკ|რილს|რილის|რილზ|рилс|шортс/u;
  const make = /შემიქმენი|შექმენი|გამიკეთე|გააკეთე|მინდა|დამიმზადე|make|create|build|сделай|создай/u;
  return has(reel, s) && has(make, s);
}

const T = {
  qWhat: {
    ka: 'რის შესახებ იყოს Reel? დაწერე პროდუქტი ან თემა ერთი წინადადებით, ან გამომიგზავნე ფოტო.',
    en: 'What should the Reel be about? Name the product or topic in one sentence, or send a photo.',
    ru: 'О чём должен быть Reel? Назовите продукт или тему одним предложением или пришлите фото.',
  },
  qLine: {
    ka: 'Reel-ში ქართულად ილაპარაკოს პერსონაჟმა თუ დიქტორის ხმა დავადო ზემოდან?',
    en: 'Should a character speak Georgian in the clip, or should I lay a narrator voice over it?',
    ru: 'Персонаж должен говорить по-грузински в кадре или наложить голос диктора?',
  },
  aSeconds: { ka: (n: number) => `ხანგრძლივობა ${n} წამი`, en: (n: number) => `${n} seconds long`, ru: (n: number) => `длительность ${n} с` },
  aFormat: { ka: 'ფორმატი 9:16, 720p', en: '9:16, 720p', ru: 'формат 9:16, 720p' },
  aFrame: { ka: 'ფოტო არ არის: ჯერ კადრს დავხატავ', en: 'no photo: I will draw the first frame', ru: 'фото нет: сначала нарисую кадр' },
  aMusic: { ka: 'ფონური მუსიკა ჩართულია', en: 'background music on', ru: 'фоновая музыка включена' },
  aVeoClamp: { ka: 'ხმის გარეშე კლიპი მაქსიმუმ 8 წამია', en: 'a clip with no speech is at most 8 s', ru: 'клип без речи — не длиннее 8 с' },
} as const;

/** The seconds asked for, snapped up to the next length the engines render (10 at most). */
function secondsOf(s: string): ReelSeconds | null {
  const m = /(\d{1,2})\s*(?:წამ|sec|s\b|секунд|сек)/u.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return n <= 4 ? 4 : n <= 6 ? 6 : n <= 8 ? 8 : 10;
}

/**
 * Read a Reel ask. Asks back only what it cannot sensibly assume (at most two questions); everything else gets a stated
 * default the confirmation card lists, so the user can correct it before anything is spent.
 */
export function understandReel(text: string, ctx: { photo?: string; lang?: string } = {}): Understood {
  const lang = pick(ctx.lang);
  const request = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 2_000);
  const s = request.toLowerCase();
  // The words left once the „make me a reel" frame is taken out: is there a subject at all?
  const subject = s
    .replace(/\breels?\b|\bshorts?\b|tiktok|ტიკტოკ\S*|რილ\S*|рилс\S*|шортс\S*/gu, ' ')
    .replace(/შემიქმენი|შექმენი|გამიკეთე|გააკეთე|მინდა|დამიმზადე|ერთი|ვიდეო|video|make|create|build|me|a|an|please|сделай|создай|мне|видео/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const questions: string[] = [];
  if (!ctx.photo && subject.length < 4) questions.push(T.qWhat[lang]);

  const wantsVoice = has(/ხმა|ხმით|ხმას|გახმოვან|ილაპარაკ|ლაპარაკ|voice|speak|talk|голос|озвуч|говор/u, s);
  const wantsNarrator = has(/დიქტორ|ნარაცი|კადრს მიღმა|voice-?over|narrat|диктор|закадр/u, s);
  const wantsLine = has(/ილაპარაკ|ლაპარაკ|თქვას|ამბობ|speak|says?\b|talk|говор|скаж/u, s);
  if (wantsVoice && !wantsNarrator && !wantsLine) questions.push(T.qLine[lang]);
  if (questions.length) return { ok: false, questions: questions.slice(0, 2) };

  const georgianLine = wantsLine;
  const narration = wantsNarrator;
  const music = !has(/მუსიკის გარეშე|უმუსიკო|no music|without music|без музык/u, s);
  const captions = has(/სუბტიტრ|ტიტრ|subtitle|caption|субтитр|титр/u, s);
  const asked = secondsOf(s);
  const assumed: string[] = [];
  let seconds: ReelSeconds = asked ?? REEL_DEFAULT_SECONDS;
  if (!asked) assumed.push(T.aSeconds[lang](seconds));
  // Veo (no spoken line) renders at most 8 s; only Omni has 10.
  if (!georgianLine && seconds === 10) {
    seconds = 8;
    assumed.push(T.aVeoClamp[lang]);
  }
  const resolution: '720p' | '1080p' = has(/1080|full ?hd|მაღალი ხარისხ|высок\S* качеств/u, s) ? '1080p' : '720p';
  if (resolution === '720p') assumed.push(T.aFormat[lang]);
  if (!ctx.photo) assumed.push(T.aFrame[lang]);
  if (music) assumed.push(T.aMusic[lang]);
  return {
    ok: true,
    brief: { request, ...(ctx.photo ? { photo: ctx.photo } : {}), seconds, resolution, georgianLine, narration, music, captions },
    assumed,
  };
}

const L = {
  title: { ka: 'ქართული Reel', en: 'Georgian Reel', ru: 'Грузинский Reel' },
  script: { ka: 'სცენარის დაწერა', en: 'Write the script', ru: 'Сценарий' },
  frame: { ka: 'პირველი კადრის შექმნა', en: 'Draw the first frame', ru: 'Первый кадр' },
  clip: { ka: 'ვიდეოს შექმნა', en: 'Render the clip', ru: 'Рендер клипа' },
  voice: { ka: 'ქართული ხმა', en: 'Georgian voice-over', ru: 'Грузинский голос' },
  music: { ka: 'მუსიკის შექმნა', en: 'Compose the music', ru: 'Музыка' },
  reel: { ka: 'აწყობა 9:16', en: 'Assemble 9:16', ru: 'Сборка 9:16' },
  reelCaptions: { ka: 'აწყობა 9:16 და სუბტიტრები', en: 'Assemble 9:16 with captions', ru: 'Сборка 9:16 и субтитры' },
  save: { ka: 'ბიბლიოთეკაში შენახვა', en: 'Save to the Library', ru: 'Сохранить в библиотеку' },
} as const;

/** Each Reel step's price from the price book: the same functions the routes charge with. 0 = free (no provider). */
export function reelStepPrice(step: Pick<PlanStep, 'tool' | 'params'>): number {
  const p = step.params as Record<string, unknown>;
  const sec = typeof p.seconds === 'number' ? p.seconds : REEL_DEFAULT_SECONDS;
  switch (step.tool) {
    case 'image': return quoteCredits({ tool: 'image', count: 1 });
    case 'video':
      return p.engine === 'omni'
        ? omniClipCredits(p.resolution === '1080p' ? '1080p' : '720p', sec)
        : quoteCredits({ tool: 'video', seconds: sec });
    case 'music': return quoteCredits({ tool: 'music', seconds: sec });
    // The script (chat model), read-aloud, the montage (own ffmpeg, owner chose free 2026-10-09) and the Library save.
    default: return 0;
  }
}

export interface ReelPlanned {
  plan: Plan;
  levels: string[][];
  /** Each step's approved price: createRun(..., { approved }) holds every start to it. */
  approved: Record<string, number>;
  totalCredits: number;
  /** One confirmation line: the whole price, once, before anything runs. */
  confirm: string;
}

/** The Reel plan for a brief. Music and the voice-over run beside the clip (the engine starts them on the same level). */
export function reelPlan(brief: ReelBrief, lang: string = 'ka'): ReelPlanned {
  const lg = pick(lang);
  const steps: Array<Omit<PlanStep, 'estimateCredits'>> = [];
  steps.push({
    id: 'script', tool: 'write', title: L.script[lg], dependsOn: [],
    params: {
      kind: 'reel_script', lang: lg, seconds: brief.seconds, line: brief.georgianLine, narration: brief.narration,
      // The user's words are DATA for the script writer (the step's prompt fences them), never a system instruction.
      brief: brief.request,
    },
  });
  if (!brief.photo) {
    steps.push({ id: 'frame', tool: 'image', title: L.frame[lg], dependsOn: ['script'], params: { from: 'script', aspect: '9:16' } });
  }
  steps.push({
    id: 'clip', tool: 'video', title: L.clip[lg], dependsOn: brief.photo ? ['script'] : ['script', 'frame'],
    params: {
      engine: brief.georgianLine ? 'omni' : 'veo', seconds: brief.seconds, resolution: brief.resolution, aspect: '9:16',
      firstFrame: brief.photo ? { file: brief.photo } : { step: 'frame' }, line: brief.georgianLine ? { from: 'script' } : null,
      // With a spoken line or a voice-over, the clip's own soundtrack stays quiet under it.
      music: false,
    },
  });
  if (brief.narration) steps.push({ id: 'voice', tool: 'speech', title: L.voice[lg], dependsOn: ['script'], params: { from: 'script', lang: 'ka' } });
  if (brief.music) {
    steps.push({
      id: 'music', tool: 'music', title: L.music[lg], dependsOn: ['script'],
      params: { from: 'script', seconds: brief.seconds, instrumental: true, under: brief.georgianLine || brief.narration ? 'speech' : 'none' },
    });
  }
  const mix = ['clip', ...(brief.narration ? ['voice'] : []), ...(brief.music ? ['music'] : [])];
  steps.push({
    id: 'reel', tool: 'montage', title: brief.captions ? L.reelCaptions[lg] : L.reel[lg], dependsOn: mix,
    params: { aspect: '9:16', targetSec: brief.seconds, captions: brief.captions, duckMusic: brief.music && (brief.georgianLine || brief.narration) },
  });
  steps.push({ id: 'save', tool: 'export', title: L.save[lg], dependsOn: ['reel'], params: { to: 'library', kind: 'reel' } });

  const priced = steps.map((s) => ({ ...s, estimateCredits: reelStepPrice(s) }));
  const checked = parsePlan({ title: `${L.title[lg]}: ${brief.request.slice(0, 120) || L.title[lg]}`, steps: priced }, REEL_TOOLS);
  if (!checked.ok) throw new Error(`reelPlan: ${checked.error}`); // a template bug, pinned by reel.test.ts
  const approved = Object.fromEntries(priced.map((s) => [s.id, s.estimateCredits]));
  const totalCredits = priced.reduce((a, s) => a + s.estimateCredits, 0);
  return { plan: checked.plan, levels: checked.levels, approved, totalCredits, confirm: confirmLine(lg, priced.length, totalCredits) };
}

function confirmLine(lang: Lang, steps: number, credits: number): string {
  if (lang === 'en') return `${steps} steps, ✦${credits} in total, charged per step as each one runs. Shall I start?`;
  if (lang === 'ru') return `${steps} шагов, всего ✦${credits}, списывается по шагам. Начинаем?`;
  return `${steps} ნაბიჯი, სულ ✦${credits}, ჩამოიჭრება თითო ნაბიჯზე, როცა შესრულდება. დავიწყოთ?`;
}

// ── The task panel ───────────────────────────────────────────────────────────────────────────────────────────────

export type PanelState = 'planned' | 'working' | 'done' | 'needs_ok' | 'failed' | 'skipped' | 'stopped';

const STATE_OF: Record<StepStatus, PanelState> = {
  pending: 'planned', running: 'working', awaiting_approval: 'needs_ok', done: 'done', failed: 'failed', skipped: 'skipped', cancelled: 'stopped',
};

const STATE_WORD: Record<PanelState, Record<Lang, string>> = {
  planned: { ka: 'დაგეგმილი', en: 'Planned', ru: 'В плане' },
  working: { ka: 'მუშაობს', en: 'Working', ru: 'В работе' },
  done: { ka: 'დასრულდა', en: 'Done', ru: 'Готово' },
  needs_ok: { ka: 'საჭიროებს დადასტურებას', en: 'Needs your OK', ru: 'Нужно подтверждение' },
  failed: { ka: 'ჩავარდა', en: 'Failed', ru: 'Ошибка' },
  skipped: { ka: 'გამოტოვდა', en: 'Skipped', ru: 'Пропущено' },
  stopped: { ka: 'გაჩერდა', en: 'Stopped', ru: 'Остановлено' },
};

export interface PanelStep {
  id: string;
  label: string;
  state: PanelState;
  stateWord: string;
  /** What it will cost (approved), or what it cost once it ran. */
  credits: number;
  charged: boolean;
  reused: boolean;
  error?: string;
  /** A held quote waiting for the user's yes. */
  heldCredits?: number;
}

export interface ReelPanel {
  title: string;
  status: EngineRun['status'];
  paused: boolean;
  steps: PanelStep[];
  totalCredits: number;
  spentCredits: number;
  /** Which buttons the panel shows enabled. Retry/alternative act on a FINISHED run (a retry is a new run). */
  actions: { pause: boolean; resume: boolean; cancel: boolean; retry: boolean; alternative: boolean };
  /** The first step that failed, said plainly, with what we can offer. */
  failure?: { stepId: string; label: string; explain: string };
}

const FINAL = new Set<EngineRun['status']>(['completed', 'failed', 'cancelled', 'partially_completed']);

function explainFailure(lang: Lang, label: string, alt: boolean): string {
  if (lang === 'en') return `"${label}" did not finish. Retry runs only what is left (done steps are not paid again)${alt ? ', or take the cheaper path' : ''}.`;
  if (lang === 'ru') return `«${label}» не выполнен. Повтор запустит только оставшееся (готовые шаги не оплачиваются снова)${alt ? ' или более дешёвый вариант' : ''}.`;
  return `„${label}“ ვერ შესრულდა. ხელახლა ცდა გაუშვებს მხოლოდ დარჩენილს (დასრულებულ ნაბიჯებს თავიდან არ გადაიხდი)${alt ? ', ან ავირჩიოთ იაფი გზა' : ''}.`;
}

export function reelPanel(run: EngineRun, lang: string = 'ka'): ReelPanel {
  const lg = pick(lang);
  const steps: PanelStep[] = run.plan.steps.map((ps) => {
    const s = run.steps.find((x) => x.id === ps.id)!;
    const state = STATE_OF[s.status];
    const charged = typeof s.credits === 'number' && !s.reused;
    return {
      id: ps.id, label: ps.title, state, stateWord: STATE_WORD[state][lg],
      credits: charged ? s.credits! : s.approvedCredits, charged, reused: !!s.reused,
      ...(s.error && s.status !== 'done' ? { error: s.error } : {}),
      ...(s.heldQuote ? { heldCredits: s.heldQuote.credits } : {}),
    };
  });
  const final = FINAL.has(run.status);
  const failedStep = run.steps.find((s) => s.status === 'failed');
  const alt = final && !!alternativeOf(run);
  const failure = failedStep
    ? (() => {
      const label = run.plan.steps.find((p) => p.id === failedStep.id)!.title;
      return { stepId: failedStep.id, label, explain: explainFailure(lg, label, alt) };
    })()
    : undefined;
  return {
    title: run.plan.title,
    status: run.status,
    paused: run.paused,
    steps,
    totalCredits: steps.reduce((a, s) => a + s.credits, 0),
    spentCredits: steps.reduce((a, s) => a + (s.charged ? s.credits : 0), 0),
    actions: {
      pause: !final && !run.paused && !run.cancelRequested,
      resume: !final && run.paused,
      cancel: !final && !run.cancelRequested,
      retry: final && run.status !== 'completed' && run.steps.some((s) => s.status !== 'done'),
      alternative: alt,
    },
    ...(failure ? { failure } : {}),
  };
}

// ── After a failure ──────────────────────────────────────────────────────────────────────────────────────────────

/** The same plan again, carrying every done step's checkpoint: createRun(..., { reuse }) delivers those without paying. */
export function retryOf(run: EngineRun): { plan: Plan; reuse: Record<string, Checkpoint> } {
  return { plan: run.plan, reuse: checkpointsOf(run) };
}

/**
 * A cheaper path when one step keeps failing: the Reel without the music or without the voice-over, or the clip on Veo
 * without the spoken line (Omni down). Null when there is no honest alternative (the script or the frame failed).
 */
export function alternativeOf(run: EngineRun): { plan: Plan; reuse: Record<string, Checkpoint>; changed: string } | null {
  const failed = run.steps.find((s) => s.status === 'failed');
  if (!failed) return null;
  const plan = run.plan;
  const reuse = checkpointsOf(run);
  const without = (id: string): Plan => ({
    title: plan.title,
    steps: plan.steps.filter((s) => s.id !== id).map((s) => (s.dependsOn.includes(id)
      ? { ...s, dependsOn: s.dependsOn.filter((d) => d !== id), params: { ...s.params, ...(id === 'music' ? { duckMusic: false } : {}) } }
      : s)),
  });
  if (failed.id === 'music' || failed.id === 'voice') return { plan: without(failed.id), reuse, changed: `drop:${failed.id}` };
  const clip = plan.steps.find((s) => s.id === 'clip');
  if (failed.id === 'clip' && clip && clip.params.engine === 'omni') {
    const seconds = typeof clip.params.seconds === 'number' && clip.params.seconds > 8 ? 8 : clip.params.seconds;
    const veo: PlanStep = { ...clip, params: { ...clip.params, engine: 'veo', line: null, seconds } };
    veo.estimateCredits = reelStepPrice(veo);
    return { plan: { title: plan.title, steps: plan.steps.map((s) => (s.id === 'clip' ? veo : s)) }, reuse, changed: 'clip:veo' };
  }
  return null;
}

// ── Rollout ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type ReelAudience = 'off' | 'admins' | 'everyone';

/** AGENT_REEL_TASK: off (default, and anything unknown) | admins | everyone. */
export function reelAudience(env: Record<string, string | undefined> = process.env): ReelAudience {
  const v = String(env.AGENT_REEL_TASK ?? '').trim().toLowerCase();
  return v === 'admins' || v === 'everyone' ? v : 'off';
}

export function reelTaskOpen(user: { isAdmin: boolean }, env: Record<string, string | undefined> = process.env): boolean {
  const a = reelAudience(env);
  return a === 'everyone' || (a === 'admins' && user.isAdmin);
}
