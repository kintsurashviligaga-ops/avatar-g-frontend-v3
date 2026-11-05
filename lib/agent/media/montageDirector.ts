/**
 * lib/agent/media/montageDirector.ts — the montage's "thinking" step: before the plan, one Gemini call LOOKS at every
 * video and READS the user's words, and decides what a human editor would (GG 2026-11-05 17:29Z).
 *
 * GG sent three files — the presenter (10 s), a 1.9 s intro and a 2.1 s logo scene — with „დაამონტაჟე და ეკრანი შუაში
 * უნდა იყოს გაყოფილი რომ წამყვანმა ქვევით ილაპარაკოს და ზედა ეკრანზე რეალური ფაქტობრივი და მიზნობრივი ვიდეო გაუშვი".
 * The word readers (./assemblyAsk, ./cutawayAsk) knew neither the phrasing nor three files, so the clips were joined in
 * upload order with no split screen. He asked that the agent itself work out what the user left unsaid (the intro goes
 * first, the logo scene last, the presenter in between) and SHOW its reasoning, as chat agents do.
 *
 * So the director returns, for the files it was shown:
 *   · what each one is (presenter / intro / outro / logo scene / b-roll / other) and one line on what it saw;
 *   · the roles of an intro + body + outro edit, in that order whatever order the files were sent in;
 *   · whether the words ask for (or clearly imply) a split screen with real footage over the speaker;
 *   · its reasoning and what it decided on the user's behalf, in the user's language, for the chat and the card.
 *
 * Pure apart from the injected transport (the same Vertex-only one as ./cutawaySpot, wired by ./cutawayLive). Its
 * answer is checked here: a role outside the files, a body that is also the intro, or an edit that leaves a video
 * without a role is not an assembly. A failed call is no decision at all: the word readers decide, as before.
 */
import type { AnalyzeDeps } from './analyzeExec';

export interface DirectorVideo {
  /** 0-based position in the files sent. */
  file: number;
  url: string;
  mime: string;
  durationSec: number;
  name?: string;
}

export type DirectorKind = 'presenter' | 'intro' | 'outro' | 'logo' | 'broll' | 'other';

export interface DirectorDecision {
  files: Array<{ file: number; kind: DirectorKind; summary: string }>;
  /** File positions (0-based); null = not an intro/body/outro edit (or not one every video fits). */
  roles: { intro?: number; body: number; outro?: number } | null;
  /** The words ask for footage over the speaker in a split screen (said or clearly meant). */
  splitScreen: boolean;
  /** The file of the person speaking, when there is one. */
  speaker?: number;
  /** 1–5 short sentences in the user's language: what it saw and why it planned what it did. */
  reasoning: string[];
  /** What the user did not say that it decided for them („the logo scene goes last"). */
  filled: string[];
  model: string;
}

const KINDS: readonly DirectorKind[] = ['presenter', 'intro', 'outro', 'logo', 'broll', 'other'];

export const DIRECTOR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    language: { type: 'STRING' },
    files: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          file: { type: 'INTEGER' },
          kind: { type: 'STRING', enum: [...KINDS] },
          summary: { type: 'STRING' },
        },
        required: ['file', 'kind', 'summary'],
      },
    },
    edit: { type: 'STRING', enum: ['assembly', 'join'] },
    intro: { type: 'INTEGER' },
    body: { type: 'INTEGER' },
    outro: { type: 'INTEGER' },
    splitScreen: { type: 'BOOLEAN' },
    speaker: { type: 'INTEGER' },
    reasoning: { type: 'ARRAY', items: { type: 'STRING' } },
    filled: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['files', 'edit', 'splitScreen', 'reasoning'],
} as const;

export function directorPrompt(words: string, videos: readonly DirectorVideo[]): string {
  const list = videos.map((v, k) => `File ${k + 1}${v.name ? ` „${v.name.slice(0, 80)}“` : ''}: ${v.durationSec.toFixed(1)} s`).join('; ');
  return [
    'You are the senior video editor of a chat assistant. The user attached these videos, in this order:',
    `${list}. The video parts above are those files, in the same order.`,
    `The user's request: «${words.slice(0, 1200)}»`,
    'Watch every file and decide the edit a professional would make, including what the user forgot to say.',
    'files: for each file (1-based number), kind = presenter (a person speaking to camera), intro (an opening title or',
    'bumper), outro (a closing card), logo (a logo or brand end scene), broll (footage without a speaker) or other;',
    'summary = one short line on what you see in it.',
    'edit: "assembly" when the files are an intro and/or outro around one main video (the presenter), else "join".',
    'For an assembly: body = the main video number; intro = the file that opens it; outro = the file that closes it',
    '(a logo or end scene is an outro; 0 = none). Every file must have one of these roles. Intro first, body second,',
    'outro last, whatever order the files were sent in. A bumper used both to open and to close has both numbers.',
    'splitScreen: true when the user asks for, or clearly means, real footage of what the speaker says laid over him',
    '(a split screen, b-roll, „რეალური კადრები“, „ეკრანის გაყოფა“). speaker = the presenter file number (0 = none).',
    'reasoning: 2 to 5 short sentences IN THE LANGUAGE OF THE USER\'S REQUEST (Georgian when it is Georgian), first',
    'person, plain words: what you saw in the files and why you plan the edit this way.',
    'filled: short sentences in the same language for anything you decided that the user did not say (empty if none).',
    'Never invent files or content you did not see.',
  ].join(' ');
}

const int = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) ? x : null);
const line = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const lines = (a: unknown, n: number, max: number) => (Array.isArray(a) ? a.map((s) => line(s, max)).filter(Boolean).slice(0, n) : []);

/** The model's JSON → a checked decision, or null when it is not one. `videos` are the files it was shown. */
export function parseDirector(raw: unknown, videos: readonly DirectorVideo[], model: string): DirectorDecision | null {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const n = videos.length;
  // 1-based on the wire → the file positions sent; 0 / out of range = none.
  const pos = (x: unknown): number | undefined => {
    const k = int(x);
    return k !== null && k >= 1 && k <= n ? videos[k - 1]!.file : undefined;
  };
  const files: DirectorDecision['files'] = [];
  for (const f of Array.isArray(o.files) ? o.files.slice(0, 20) : []) {
    const r = f as Record<string, unknown>;
    const file = pos(r.file);
    if (file === undefined || files.some((x) => x.file === file)) continue;
    const kind = KINDS.includes(r.kind as DirectorKind) ? (r.kind as DirectorKind) : 'other';
    files.push({ file, kind, summary: line(r.summary, 160) });
  }
  const reasoning = lines(o.reasoning, 5, 240);
  if (!reasoning.length) return null;
  let roles: DirectorDecision['roles'] = null;
  if (o.edit === 'assembly') {
    const body = pos(o.body), intro = pos(o.intro), outro = pos(o.outro);
    const used = new Set([intro, body, outro].filter((x): x is number => x !== undefined));
    const everyVideo = videos.every((x) => used.has(x.file));
    if (body !== undefined && body !== intro && body !== outro && (intro !== undefined || outro !== undefined) && everyVideo) {
      roles = { ...(intro !== undefined ? { intro } : {}), body, ...(outro !== undefined ? { outro } : {}) };
    }
  }
  const speaker = pos(o.speaker) ?? roles?.body ?? files.find((f) => f.kind === 'presenter')?.file;
  return {
    files,
    roles,
    splitScreen: o.splitScreen === true,
    ...(speaker !== undefined ? { speaker } : {}),
    reasoning,
    filled: lines(o.filled, 4, 200),
    model,
  };
}

export type DirectorResult = { ok: true; decision: DirectorDecision } | { ok: false; error: string };

/** ~300 tokens a second of video at default resolution, the sound included. */
const TOKENS_PER_SEC = 300;

/** Watch the videos, read the words, decide. Never throws. */
export async function directMontage(
  deps: Pick<AnalyzeDeps, 'model' | 'generate' | 'budgetAllows' | 'book'>,
  input: { words: string; videos: readonly DirectorVideo[]; userId: string; signal?: AbortSignal },
): Promise<DirectorResult> {
  const model = deps.model();
  if (!model) return { ok: false, error: 'no analysis model is configured' };
  if (!input.videos.length) return { ok: false, error: 'no video' };
  const seconds = input.videos.reduce((t, v) => t + Math.max(1, v.durationSec), 0);
  if (!(await deps.budgetAllows(Math.ceil(seconds * TOKENS_PER_SEC) + 2_000, model).catch(() => false))) {
    return { ok: false, error: 'the AI budget refused the analysis' };
  }
  const body = {
    contents: [{
      role: 'user',
      parts: [
        ...input.videos.map((v) => ({ fileData: { mimeType: v.mime, fileUri: v.url } })),
        { text: directorPrompt(input.words, input.videos) },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: DIRECTOR_SCHEMA, temperature: 0.2 },
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  const onAbort = () => ctl.abort();
  input.signal?.addEventListener('abort', onAbort);
  try {
    const res = await deps.generate(model, body, ctl.signal);
    const json = (await res.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    } | null;
    const u = json?.usageMetadata;
    if (u) {
      await deps.book({ model, userId: input.userId, inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) }).catch(() => {});
    }
    if (!res.ok) return { ok: false, error: `the analysis failed (${res.status})` };
    const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const decision = parseDirector(text, input.videos, model);
    return decision ? { ok: true, decision } : { ok: false, error: 'the analysis did not return a decision' };
  } catch (e) {
    return { ok: false, error: ctl.signal.aborted ? 'the analysis timed out' : e instanceof Error ? e.message : 'analysis failed' };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onAbort);
  }
}

/** The mime Gemini is told for a link (the same guess ./montageLive makes for the cutaway read). */
export function videoMime(url: string): string {
  return /\.mov(?:\?|$)/i.test(url) ? 'video/quicktime' : /\.webm(?:\?|$)/i.test(url) ? 'video/webm' : 'video/mp4';
}
