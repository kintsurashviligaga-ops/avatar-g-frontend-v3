/**
 * lib/chat/attachedFiles.ts — what a chat turn carried, kept after its bytes are gone. Pure: no DOM, no network.
 *
 * ⚠️ AFTER A RELOAD A TURN WITH FOUR FILES SAID „video, video, video, audio". Only the kinds were saved, so the bubble
 * showed nothing and the model was told „[attached earlier: video, video, video, audio]" — it could not say which clip
 * was which, and the user could not see what they had sent. A turn now keeps each file's name, size, length and, once
 * the server checked its bytes, where it is stored: the bubble lists them, the model is told them by name, and a later
 * montage can be opened from the stored copies without asking the user to attach them again.
 */

export interface AttachedFile {
  /** image · video · audio · PDF · file */
  kind: string;
  name?: string;
  size?: number;
  durationSec?: number;
  /** The checked storage path (the uploads bucket, the owner's folder) — never a URL, so it never expires or leaks. */
  path?: string;
}

/** The fields of a chat attachment this module reads. */
export interface AttachmentLike {
  mimeType: string;
  name?: string;
  size?: number;
  durationSec?: number;
  storagePath?: string;
}

/** A short word for an attachment's kind. */
export function attachedKind(mime: string): string {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'PDF';
  return 'file';
}

/** Longest name kept: a long camera name still reads, a pasted paragraph does not bloat the saved chat. */
const NAME_MAX = 120;

/** The saved record of one attachment. Only a checked storage path is kept (an `omni-uploads/…` path, no URL). */
export function toAttachedFile(m: AttachmentLike): AttachedFile {
  const name = m.name?.trim().slice(0, NAME_MAX);
  const path = m.storagePath && /^omni-uploads\/[^?#\s]+$/.test(m.storagePath) && !m.storagePath.includes('..') ? m.storagePath : undefined;
  return {
    kind: attachedKind(m.mimeType),
    ...(name ? { name } : {}),
    ...(typeof m.size === 'number' && m.size > 0 ? { size: m.size } : {}),
    ...(typeof m.durationSec === 'number' && Number.isFinite(m.durationSec) && m.durationSec > 0 ? { durationSec: Math.round(m.durationSec * 10) / 10 } : {}),
    ...(path ? { path } : {}),
  };
}

/** A saved file list read back from storage: anything malformed is dropped, never trusted. */
export function readAttachedFiles(raw: unknown): AttachedFile[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: AttachedFile[] = [];
  for (const r of raw.slice(0, 16)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.kind !== 'string' || !o.kind) continue;
    out.push(toAttachedFile({
      mimeType: o.kind === 'PDF' ? 'application/pdf' : o.kind === 'file' ? 'application/octet-stream' : `${o.kind}/x`,
      ...(typeof o.name === 'string' ? { name: o.name } : {}),
      ...(typeof o.size === 'number' ? { size: o.size } : {}),
      ...(typeof o.durationSec === 'number' ? { durationSec: o.durationSec } : {}),
      ...(typeof o.path === 'string' ? { storagePath: o.path } : {}),
    }));
  }
  return out.length ? out : undefined;
}

/** „0:09" — a clip's length. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * What the model is told about a turn whose files are no longer sent: each one by number, name, kind and length, so
 * „the second clip" still means something. Falls back to the kinds alone (a chat saved before names were kept).
 */
export function attachedEarlierNote(files: readonly AttachedFile[] | undefined, kinds: readonly string[] | undefined): string {
  if (files?.length) {
    const list = files.map((f, i) => {
      const facts = [f.kind, f.durationSec ? clock(f.durationSec) : ''].filter(Boolean).join(', ');
      return `${i + 1}. ${f.name ? `${f.name} (${facts})` : facts}`;
    }).join('; ');
    return `[attached earlier: ${list} — no longer available to you]`;
  }
  if (kinds?.length) return `[attached earlier: ${kinds.join(', ')} — no longer available to you]`;
  return '';
}
