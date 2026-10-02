/**
 * lib/studio/imageResults.ts — the Image tool's results, read off the conversation. Pure and isomorphic.
 *
 * The studio keeps ONE thread of messages for every tool, and an image job is just a bubble in it: in flight it is an
 * assistant message with `genKind: 'image'` and no picture yet, when it lands it carries `imageUrl`, a ×2 / ×4 batch carries
 * `batch.tiles`, and a refusal is a `⚠️` line (`topUp` when the refusal was for want of credits). The desktop Result pane
 * (components/studio/create/ImageResultPane) shows the latest of those, so this module turns the thread into that list.
 *
 * It only READS: nothing here starts, cancels or bills a job — the pane calls the studio's own handlers for that.
 *
 * ⚠️ NOT EVERY `imageUrl` IS AN IMAGE RESULT. A 3D model's reference picture rides on a message that also has `glbUrl`, and
 * a music or video bubble may carry a cover or poster; only a bubble that is JUST a picture counts.
 */

/** The structural slice of the studio's message this module reads (OmniStudio's `Msg` satisfies it). */
export interface ImageMsgLike {
  role: 'user' | 'assistant';
  text: string;
  id?: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  glbUrl?: string;
  genKind?: string;
  topUp?: boolean;
  jobId?: string;
  regen?: { kind: string; prompt?: string; aspect?: string; quality?: string };
  batch?: {
    spec: { prompt: string; aspect: string; quality: string };
    tiles: ReadonlyArray<{ status: 'pending' | 'done' | 'failed'; url?: string; error?: string; jobId?: string }>;
  };
}

export interface ImageTileView { status: 'pending' | 'done' | 'failed'; url?: string; error?: string; jobId?: string }

interface Base {
  /** Stable across renders: the message's own id when it has one, else its position. */
  key: string;
  /** Index of the message in the thread (what the studio's handlers are keyed on). */
  index: number;
  aspect: string;
  quality: string;
  prompt: string;
}

export type ImageResultView =
  | (Base & { state: 'rendering'; jobId?: string; stage: string })
  | (Base & { state: 'ready'; url: string; canReroll: boolean })
  | (Base & { state: 'batch'; tiles: readonly ImageTileView[]; pending: boolean })
  | (Base & { state: 'failed'; message: string; topUp: boolean; canReroll: boolean });

const FAIL = /^\s*⚠️\s*/u;
const DEFAULT_ASPECT = '1:1';
const DEFAULT_QUALITY = 'high';

/** The prompt a result answered: its own spec when it has one, else the user bubble right before it. */
function promptOf(m: ImageMsgLike, before: ImageMsgLike | undefined): string {
  if (m.regen?.kind === 'image' && m.regen.prompt) return m.regen.prompt;
  if (m.batch?.spec.prompt) return m.batch.spec.prompt;
  return before?.role === 'user' ? before.text : '';
}

const specOf = (m: ImageMsgLike): { aspect: string; quality: string } => ({
  aspect: (m.regen?.kind === 'image' ? m.regen.aspect : undefined) ?? m.batch?.spec.aspect ?? DEFAULT_ASPECT,
  quality: (m.regen?.kind === 'image' ? m.regen.quality : undefined) ?? m.batch?.spec.quality ?? DEFAULT_QUALITY,
});

/** Every image result in the thread, oldest first. */
export function deriveImageResults(messages: readonly ImageMsgLike[]): ImageResultView[] {
  const out: ImageResultView[] = [];
  messages.forEach((m, index) => {
    if (m.role !== 'assistant') return;
    const base = { key: m.id ?? `m${index}`, index, ...specOf(m), prompt: promptOf(m, messages[index - 1]) };
    if (m.glbUrl || m.audioUrl || m.videoUrl) return;
    if (m.batch) {
      out.push({ ...base, state: 'batch', tiles: m.batch.tiles, pending: m.batch.tiles.some((t) => t.status === 'pending') });
    } else if (m.imageUrl) {
      out.push({ ...base, state: 'ready', url: m.imageUrl, canReroll: m.regen?.kind === 'image' });
    } else if (m.genKind === 'image') {
      if (FAIL.test(m.text)) {
        out.push({ ...base, state: 'failed', message: m.text.replace(FAIL, '').trim(), topUp: !!m.topUp, canReroll: m.regen?.kind === 'image' });
      } else {
        out.push({ ...base, state: 'rendering', ...(m.jobId ? { jobId: m.jobId } : {}), stage: m.text });
      }
    }
  });
  return out;
}

/**
 * A one-line refusal that is NOT an image bubble and is newer than the latest result — a failed re-roll or upscale
 * (`⚠️ …` with no `genKind`). The pane shows it so a failure the feed would have printed is not hidden behind the
 * Conversation disclosure.
 */
export function latestNotice(messages: readonly ImageMsgLike[], results: readonly ImageResultView[]): { text: string; topUp: boolean } | null {
  const lastResult = results.length ? results[results.length - 1]!.index : -1;
  for (let i = messages.length - 1; i > lastResult; i--) {
    const m = messages[i]!;
    if (m.role === 'assistant' && !m.genKind && !m.imageUrl && FAIL.test(m.text)) return { text: m.text.replace(FAIL, '').trim(), topUp: !!m.topUp };
  }
  return null;
}
