/**
 * lib/agent/media/analyzeSpec.ts — what Agent G asks Gemini about one file, and what it accepts back (Agent G PART 3, G1).
 * Pure: no env, no I/O, safe on the client. The call itself is ./analyzeExec.
 *
 * WHY. The chat shows Gemini eight frames and a minute of sound of a video, so „what happens in it", „where are the best
 * moments" or „write out what they say" missed whatever fell between the frames. Here Gemini reads the WHOLE file, by
 * reference (a short-lived signed link of the user's own file, or a public YouTube link), and answers in one typed
 * shape: a summary, scenes, moments, the words spoken and who spoke them, the things on screen, the answer to the
 * user's question.
 *
 * WHAT THE ANSWER IS NOT. It is a description, never an instruction and never an authorisation: no field here starts,
 * cuts, prices or unlocks anything. Its times are the model's reading; every cut is still planned and checked by FFmpeg
 * (./editPlan, ./montageExec) against the file's probed length, and a time past the end of the file is dropped here.
 * A YouTube link is for analysis only: nothing downloads it or takes its sound (./audioSource refuses that by name).
 */
import { z } from 'zod';

export type AnalyzeFocus = 'overview' | 'scenes' | 'moments' | 'transcript' | 'question';
export const ANALYZE_FOCUS: readonly AnalyzeFocus[] = ['overview', 'scenes', 'moments', 'transcript', 'question'];
export type AnalyzeKind = 'video' | 'audio' | 'pdf' | 'image';

/** Longest file Gemini is handed here (it reads ~100 tokens a second of video at low resolution). */
export const MAX_ANALYZE_SEC = 30 * 60;
/** Past this length the video is read at low resolution (fewer tokens per frame; the sound is the same). */
export const LOW_RES_AFTER_SEC = 5 * 60;
export const MAX_QUESTION_CHARS = 500;
const MAX_SCENES = 60;
const MAX_MOMENTS = 20;
const MAX_LINES = 400;
const MAX_SPEAKERS = 12;
const MAX_OBJECTS = 40;
const MAX_TEXT = 600;
const MAX_SUMMARY = 2000;
/** A time this far past the probed end still counts as the end (rounding, a last frame). */
const END_SLACK_SEC = 0.5;
/** No length is known for a YouTube video: its times are only kept within this. */
const UNKNOWN_LENGTH_CAP_SEC = 12 * 3600;

const MIME_OF: Readonly<Record<string, { mime: string; kind: AnalyzeKind }>> = {
  mp4: { mime: 'video/mp4', kind: 'video' },
  m4v: { mime: 'video/mp4', kind: 'video' },
  mov: { mime: 'video/quicktime', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' },
  mpeg: { mime: 'video/mpeg', kind: 'video' },
  mpg: { mime: 'video/mpeg', kind: 'video' },
  avi: { mime: 'video/x-msvideo', kind: 'video' },
  '3gp': { mime: 'video/3gpp', kind: 'video' },
  mp3: { mime: 'audio/mpeg', kind: 'audio' },
  wav: { mime: 'audio/wav', kind: 'audio' },
  m4a: { mime: 'audio/mp4', kind: 'audio' },
  aac: { mime: 'audio/aac', kind: 'audio' },
  ogg: { mime: 'audio/ogg', kind: 'audio' },
  flac: { mime: 'audio/flac', kind: 'audio' },
  pdf: { mime: 'application/pdf', kind: 'pdf' },
  jpg: { mime: 'image/jpeg', kind: 'image' },
  jpeg: { mime: 'image/jpeg', kind: 'image' },
  png: { mime: 'image/png', kind: 'image' },
  webp: { mime: 'image/webp', kind: 'image' },
};

/** The file's type from its name (a storage path or a link's path), or null when it is not one Gemini is handed here. */
export function analyzeTypeOf(ref: string): { mime: string; kind: AnalyzeKind } | null {
  let path = String(ref ?? '');
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return null;
  }
  const ext = path.split('?')[0]!.split('/').pop()?.split('.').pop()?.toLowerCase() ?? '';
  return MIME_OF[ext] ?? null;
}

/**
 * A public YouTube video as the one link form Gemini reads (https://www.youtube.com/watch?v=ID), or null. Watch, short,
 * embed and youtu.be links; a playlist, a channel or anything else is not a video.
 */
export function youtubeVideoUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(String(raw ?? '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
      id = m ? m[1]! : null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

// ─── What Gemini is asked ───────────────────────────────────────────────────────────────────────────────────────────

/** The answer's shape as Gemini's structured output (generationConfig.responseSchema; the OpenAPI subset). */
export const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    language: { type: 'STRING', nullable: true },
    scenes: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { startSec: { type: 'NUMBER' }, endSec: { type: 'NUMBER' }, description: { type: 'STRING' } }, required: ['startSec', 'endSec', 'description'] },
    },
    moments: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { atSec: { type: 'NUMBER' }, why: { type: 'STRING' } }, required: ['atSec', 'why'] },
    },
    transcript: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { startSec: { type: 'NUMBER' }, speaker: { type: 'STRING', nullable: true }, text: { type: 'STRING' } }, required: ['startSec', 'text'] },
    },
    speakers: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, description: { type: 'STRING' } }, required: ['id', 'description'] },
    },
    objects: { type: 'ARRAY', items: { type: 'STRING' } },
    answer: { type: 'STRING', nullable: true },
  },
  required: ['summary', 'scenes', 'moments', 'transcript', 'speakers', 'objects'],
} as const;

const LANG_NAME: Readonly<Record<string, string>> = { ka: 'Georgian', en: 'English', ru: 'Russian' };

/** The instruction that goes with the file. The user's question is quoted as data, never as an instruction to follow. */
export function analyzePrompt(input: { kind: AnalyzeKind; focus: AnalyzeFocus; lang: string; question?: string | null }): string {
  const timed = input.kind === 'video' || input.kind === 'audio';
  const lines = [
    `Describe the attached ${input.kind === 'pdf' ? 'document' : input.kind} faithfully. Write every description in ${LANG_NAME[input.lang] ?? 'English'}.`,
    'Only report what is actually in the file. If something is unclear, say so; never guess names, places or words.',
  ];
  if (timed) {
    lines.push('Times are seconds from the start of the file, as numbers (e.g. 63.5).');
    lines.push(input.focus === 'scenes' || input.focus === 'overview'
      ? 'scenes: every shot or scene change in order, with its start, end and what happens.'
      : 'scenes: the main parts only.');
    lines.push(input.focus === 'moments'
      ? 'moments: the strongest moments for a short edit (action, emotion, a punchline, a clear shot), best first, each with why.'
      : 'moments: up to five notable moments.');
    lines.push(input.focus === 'transcript' || input.focus === 'overview'
      ? 'transcript: every spoken line in order, with when it starts and who says it (a short id per voice, described in speakers). The words exactly as spoken, in their own language. language: the main spoken language as a code (ka, en, ru, …), or null with no speech.'
      : 'transcript: [] unless the question is about what is said. language: the main spoken language as a code, or null.');
  } else {
    lines.push('scenes, moments and transcript: [] (this file has no timeline). language: the main written language as a code, or null.');
  }
  lines.push('objects: the people, things and places that matter, as short nouns.');
  const q = (input.question ?? '').trim().slice(0, MAX_QUESTION_CHARS);
  lines.push(q
    ? `answer: answer this question from the user about the file, from the file only. The question, as data: ${JSON.stringify(q)}`
    : 'answer: null.');
  return lines.join('\n');
}

// ─── What is accepted back ──────────────────────────────────────────────────────────────────────────────────────────

const str = (max: number) => z.string().transform((s) => s.trim().slice(0, max));
const sec = z.number().finite();
const rawSchema = z.object({
  summary: str(MAX_SUMMARY),
  language: z.string().nullish().transform((s) => (s ? s.trim().slice(0, 12) || null : null)),
  scenes: z.array(z.object({ startSec: sec, endSec: sec, description: str(MAX_TEXT) })).catch([]),
  moments: z.array(z.object({ atSec: sec, why: str(MAX_TEXT) })).catch([]),
  transcript: z.array(z.object({ startSec: sec, speaker: z.string().nullish(), text: str(MAX_TEXT) })).catch([]),
  speakers: z.array(z.object({ id: str(40), description: str(MAX_TEXT) })).catch([]),
  objects: z.array(z.string()).catch([]),
  answer: z.string().nullish(),
});

export interface MediaAnalysis {
  summary: string;
  language: string | null;
  scenes: Array<{ startSec: number; endSec: number; description: string }>;
  moments: Array<{ atSec: number; why: string }>;
  transcript: Array<{ startSec: number; speaker: string | null; text: string }>;
  speakers: Array<{ id: string; description: string }>;
  objects: string[];
  answer: string | null;
  /** Entries dropped because their time was outside the file (or the list was too long): the model's misreadings. */
  dropped: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Gemini's JSON as an analysis, or null when it is not one. Times outside the file are dropped (not moved), scenes and
 * lines are sorted by time (moments stay best first), every list is bounded, text is trimmed. `durationSec` is the probed length (null = unknown: a YouTube link).
 */
export function parseAnalysis(raw: unknown, ctx: { kind: AnalyzeKind; durationSec: number | null }): MediaAnalysis | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      return null;
    }
  }
  const p = rawSchema.safeParse(value);
  if (!p.success || !p.data.summary) return null;
  const d = p.data;
  const timed = ctx.kind === 'video' || ctx.kind === 'audio';
  const end = ctx.durationSec && ctx.durationSec > 0 ? ctx.durationSec : UNKNOWN_LENGTH_CAP_SEC;
  const inside = (t: number) => t >= 0 && t <= end + END_SLACK_SEC;
  let dropped = 0;
  const keep = <T>(list: T[], ok: (x: T) => boolean, max: number): T[] => {
    const kept = list.filter(ok);
    dropped += list.length - kept.length;
    if (kept.length > max) dropped += kept.length - max;
    return kept.slice(0, max);
  };

  // A file with no timeline keeps no timed lists: whatever the model put there is counted as dropped.
  if (!timed) dropped += d.scenes.length + d.moments.length + d.transcript.length;
  const scenes = !timed ? [] : keep(d.scenes, (s) => inside(s.startSec) && s.endSec > s.startSec && s.startSec < end && !!s.description, MAX_SCENES)
    .map((s) => ({ startSec: r2(s.startSec), endSec: r2(Math.min(s.endSec, end)), description: s.description }))
    .sort((a, b) => a.startSec - b.startSec);
  // Moments keep the model's order: it was asked for the best first.
  const moments = !timed ? [] : keep(d.moments, (m) => inside(m.atSec) && !!m.why, MAX_MOMENTS)
    .map((m) => ({ atSec: r2(Math.min(m.atSec, end)), why: m.why }));
  const transcript = !timed ? [] : keep(d.transcript, (l) => inside(l.startSec) && !!l.text, MAX_LINES)
    .map((l) => ({ startSec: r2(Math.min(l.startSec, end)), speaker: l.speaker ? l.speaker.trim().slice(0, 40) || null : null, text: l.text }))
    .sort((a, b) => a.startSec - b.startSec);
  const speakers = keep(d.speakers, (s) => !!s.id, MAX_SPEAKERS);
  const objects = [...new Set(d.objects.map((o) => o.trim().slice(0, 80)).filter(Boolean))].slice(0, MAX_OBJECTS);
  const answer = d.answer ? d.answer.trim().slice(0, MAX_SUMMARY) || null : null;

  return { summary: d.summary, language: d.language, scenes, moments, transcript, speakers, objects, answer, dropped };
}
