/**
 * lib/orchestrator/saveEditorOutput.ts — make an editor result show up in the Library.
 *
 * THE BUG THIS FIXES: all three editor routes already persisted their output — into a `creations` table
 * that NOTHING IN THIS APP EVER READS. Those three inserts are the only references to it in the entire
 * repo. The Library reads `generation_jobs`. So every trim, grade, crop and audio edit was written to a
 * dead end and vanished the moment the panel closed, while the client dutifully dispatched
 * `myavatar:library-updated` to refetch a list the result had never been added to.
 *
 * The `creations` write is kept — it costs nothing and may back analytics — but the Library row is now
 * written too, through the same `recordCompletedAsset` the rest of the platform uses.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { reportError } from '@/lib/observability/report-error';
import type { ProduceKind } from '@/lib/orchestrator/rate-limit';

export type EditorMedia = 'video' | 'image' | 'audio';

/**
 * Editor media → the `service_type` the Library will accept.
 *
 * ⚠️ AUDIO MAPS TO 'music', NEVER 'voice'. The Library query filters `.neq('service_type','voice')`
 * because trained voice models are not playable media — an audio edit filed as 'voice' would be written
 * successfully and then hidden forever, which is exactly the trap dubbing fell into.
 */
const SERVICE_TYPE: Record<EditorMedia, ProduceKind> = {
  video: 'film',
  image: 'image',
  audio: 'music',
};

export interface SaveEditorOutputInput {
  userId: string;
  url: string;
  media: EditorMedia;
  /** The specific operation, e.g. 'grade', 'trim', 'pitch'. Surfaced as params.subtype. */
  action: string;
}

/**
 * Write the Library row. NEVER THROWS and never blocks the response: a failed bookkeeping write must not
 * turn a successfully rendered file into an error for the user — they still get the URL back.
 *
 * Returns whether the row landed, so a caller that wants to tell the user "saved to Library" can be
 * honest about it instead of claiming it unconditionally.
 */
export async function saveEditorOutput(input: SaveEditorOutputInput): Promise<boolean> {
  const { userId, url, media, action } = input;
  if (!userId || !url) return false;
  try {
    return await recordCompletedAsset({
      id: randomUUID(),
      userId,
      serviceType: SERVICE_TYPE[media],
      url,
      prompt: `${media} edit · ${action}`,
      source: 'editor',
      // service_type carries a DB CHECK constraint, so the real operation rides in params.subtype —
      // the same convention product/swap/motion/dubbing already use.
      subtype: `edit-${media}`,
    });
  } catch (err) {
    reportError(err, { where: 'saveEditorOutput', media, action });
    return false;
  }
}
