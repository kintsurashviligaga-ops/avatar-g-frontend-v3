/**
 * lib/video/premiereXml.ts — a montage as a Premiere Pro project (GG 2026-11-07 08:02Z, card „ორივე“: Premiere has no web
 * app, so Agent G hands over a sequence Premiere opens on the user's computer).
 *
 * The format is Final Cut Pro 7 XML (`xmeml` version 4), which Premiere Pro imports with File → Import and turns into a
 * sequence: the clips in order on V1/A1, each cut to its in/out, an optional music bed on A2. Media is referenced by
 * file name (`file://localhost/<name>`): the user keeps the clips in one folder with the .xml, and Premiere's Link Media
 * finds every clip once the first one is located.
 *
 * Pure: no I/O. The spec is checked here before anything is written.
 */
import { z } from 'zod';

export const PREMIERE_FPS = [24, 25, 30, 50, 60] as const;
export const PREMIERE_MAX_CLIPS = 48;

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const label = (max: number) => z.string().transform((s) => s.replace(CONTROL, '').trim()).pipe(z.string().min(1).max(max));
/** A media file name or workspace path; only its last segment ends up in the project. */
const mediaRef = label(200).refine((s) => /\.(mp4|mov|m4v|webm|mp3|wav|m4a|aac|png|jpe?g)$/i.test(s), 'a video, sound or picture file');
const sec = z.number().finite().min(0).max(3600);

const clipSchema = z.object({
  file: mediaRef,
  name: label(120).optional(),
  /** The source file's full length. */
  durationSec: z.number().finite().positive().max(3600),
  inSec: sec.optional(),
  outSec: sec.optional(),
}).refine((c) => (c.inSec ?? 0) < (c.outSec ?? c.durationSec) && (c.outSec ?? c.durationSec) <= c.durationSec + 1e-6, 'in < out ≤ durationSec');

export const premiereSpecSchema = z.object({
  title: label(120),
  fps: z.number().int().refine((f) => (PREMIERE_FPS as readonly number[]).includes(f), 'fps: 24, 25, 30, 50 or 60').default(30),
  width: z.number().int().min(16).max(7680).default(1920),
  height: z.number().int().min(16).max(4320).default(1080),
  clips: z.array(clipSchema).min(1).max(PREMIERE_MAX_CLIPS),
  music: z.object({ file: mediaRef, durationSec: z.number().finite().positive().max(3600), startSec: sec.optional() }).optional(),
});
export type PremiereSpec = z.output<typeof premiereSpecSchema>;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const mediaName = (ref: string) => ref.split('/').filter(Boolean).pop() ?? ref;
const isStill = (ref: string) => /\.(png|jpe?g)$/i.test(ref);
const isSound = (ref: string) => /\.(mp3|wav|m4a|aac)$/i.test(ref);

/** The clips' places on the timeline, in frames (pure; pinned by the test). */
export function timeline(spec: PremiereSpec): Array<{ start: number; end: number; in: number; out: number; srcFrames: number }> {
  const f = (s: number) => Math.round(s * spec.fps);
  let at = 0;
  return spec.clips.map((c) => {
    const i = f(c.inSec ?? 0);
    const o = f(c.outSec ?? c.durationSec);
    const slot = { start: at, end: at + (o - i), in: i, out: o, srcFrames: f(c.durationSec) };
    at = slot.end;
    return slot;
  });
}

/** The xmeml document Premiere Pro imports as one sequence. */
export function premiereXml(spec: PremiereSpec): string {
  const rate = `<rate><timebase>${spec.fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const slots = timeline(spec);
  const total = slots.length ? slots[slots.length - 1]!.end : 0;
  // One <file> per distinct media name: the first mention carries it in full, later ones point back by id.
  const fileIds = new Map<string, string>();
  const fileEl = (ref: string, frames: number) => {
    const name = mediaName(ref);
    const known = fileIds.get(name);
    if (known) return `<file id="${known}"/>`;
    const id = `file-${fileIds.size + 1}`;
    fileIds.set(name, id);
    const media = isSound(ref)
      ? '<media><audio><channelcount>2</channelcount></audio></media>'
      : `<media><video><samplecharacteristics>${rate}<width>${spec.width}</width><height>${spec.height}</height></samplecharacteristics></video>${isStill(ref) ? '' : '<audio><channelcount>2</channelcount></audio>'}</media>`;
    return `<file id="${id}"><name>${esc(name)}</name><pathurl>file://localhost/${esc(encodeURIComponent(name))}</pathurl>${rate}<duration>${frames}</duration>${media}</file>`;
  };
  const item = (id: string, name: string, s: (typeof slots)[number], file: string, audioTrack?: number) =>
    `<clipitem id="${id}"><name>${esc(name)}</name><enabled>TRUE</enabled><duration>${s.srcFrames}</duration>${rate}` +
    `<start>${s.start}</start><end>${s.end}</end><in>${s.in}</in><out>${s.out}</out>${file}` +
    (audioTrack ? `<sourcetrack><mediatype>audio</mediatype><trackindex>${audioTrack}</trackindex></sourcetrack>` : '') +
    '</clipitem>';

  const video = spec.clips.map((c, i) => item(`clipitem-v${i + 1}`, c.name ?? mediaName(c.file), slots[i]!, fileEl(c.file, slots[i]!.srcFrames)));
  const audio = spec.clips.flatMap((c, i) => (isStill(c.file)
    ? []
    : [item(`clipitem-a${i + 1}`, c.name ?? mediaName(c.file), slots[i]!, fileEl(c.file, slots[i]!.srcFrames), 1)]));
  let music = '';
  if (spec.music) {
    const src = Math.round(spec.music.durationSec * spec.fps);
    const from = Math.round((spec.music.startSec ?? 0) * spec.fps);
    const len = Math.max(1, Math.min(total, src - from));
    music = `<track>${item('clipitem-m1', mediaName(spec.music.file), { start: 0, end: len, in: from, out: from + len, srcFrames: src }, fileEl(spec.music.file, src), 1)}</track>`;
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4">' +
    `<sequence id="sequence-1"><name>${esc(spec.title)}</name><duration>${total}</duration>${rate}` +
    '<timecode><string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>' +
    `<media><video><format><samplecharacteristics>${rate}<width>${spec.width}</width><height>${spec.height}</height>` +
    '<pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>' +
    `<track>${video.join('')}</track></video>` +
    `<audio><track>${audio.join('')}</track>${music}</audio></media></sequence></xmeml>\n`;
}

/** The media names the project expects next to it (for the "put these in one folder" note). */
export function premiereMedia(spec: PremiereSpec): string[] {
  return [...new Set([...spec.clips.map((c) => mediaName(c.file)), ...(spec.music ? [mediaName(spec.music.file)] : [])])];
}
