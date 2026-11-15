/**
 * lib/services/montage/smart/server.ts — the Smart Editor's server side (Phase 8.7 PR B): who may use it, which media
 * it may read, and the three jobs the routes run — find pauses, recognise words, lay the smart layers on a master.
 *
 * Every job takes its I/O as DEPS (ffmpeg, Chirp, storage), so the routes' tests run with fakes: no ffmpeg, no Google,
 * no database. `liveSmartDeps()` is the real wiring.
 *
 * MONEY: only `runCaptions` costs anything (Chirp 3, $0.016/min). It reports `billedSec` — the audio actually SENT —
 * and the route charges ✦2 per started minute of THAT after the words came back (GG D1). Pauses, beats and the render
 * are free (D2).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { User } from '@supabase/supabase-js';
import ffmpegStatic from 'ffmpeg-static';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { ffmpegExec } from '@/lib/video/ffmpegExec';
import { getVertexAccessToken, vertexAiConfig } from '@/lib/veo/vertexAuth';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { firstUnreadableOwnUrl, resolveCallerMedia } from '@/lib/security/callerMedia';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import type { CaptionWord } from '@/lib/pipeline/compositing/word-synced-captions';
import { smartEditorAllowed } from './flag';
import { billedAudioSec, buildCards, captionFrames, CAPTION_STYLES, chirpCaptionBody, concatList, isCaptionStyle, mergeChunkWords, parseChirpWords, planCaptionChunks, MAX_CAPTION_FRAMES, type CaptionLang, type CaptionPos, type CaptionStyleId, type Span } from './captions';
import { parseSilenceLog, silenceDetectArgs } from './silence';
import { buildFxChain } from './effects';
import { blankFrameSvg, buildCaptionFrameSvg } from './captionSvg';
import { coerceTracks, type SmartTracks, type TextItem } from './timeline';
import { isTemplateId, TEMPLATES, type SafeZone } from './templates';

const BIN = ffmpegStatic as unknown as string | null;
const WEEK_SEC = 604_800;
/** Chirp 3 sits at `us`, the GA multi-region nearest Vercel's iad1 (as lib/voice-v2v/chirpStt). */
export const CHIRP_LOCATION = 'us';

export async function smartOpenTo(user: User | null, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  return !!user && smartEditorAllowed(await isAdminUserAsync(user), env);
}

export const smartFail = (code: string, message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error: code, message, ...extra }, { status });

/**
 * A media reference from the editor → a URL ffmpeg may fetch, or null. A bare storage path is signed only for its owner;
 * an http(s) URL must be public (SSRF) and, when it is one of ours, readable by this caller.
 */
export async function resolveMedia(raw: unknown, userId: string): Promise<{ ok: true; url: string } | { ok: false; reason: 'invalid' | 'not_yours' }> {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return { ok: false, reason: 'invalid' };
  let url = s;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    const r = await resolveCallerMedia(s, userId, 3600);
    if (!r.ok) return { ok: false, reason: r.reason === 'not_owner' ? 'not_yours' : 'invalid' };
    url = r.url;
  }
  if (!isPublicHttpUrl(url)) return { ok: false, reason: 'invalid' };
  if ((await firstUnreadableOwnUrl([url], userId)) >= 0) return { ok: false, reason: 'not_yours' };
  return { ok: true, url };
}

// ── DEPS ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SmartDeps {
  /** ffmpeg's stderr for these args (it exits 0 for `-f null`). */
  ffmpegLog(args: string[]): Promise<string>;
  /** 16 kHz mono WAV of [startSec, endSec] of the source. */
  extractWav(url: string, startSec: number, endSec: number): Promise<Uint8Array>;
  /** One Chirp 3 Recognize call; the raw JSON answer. */
  recognize(body: Record<string, unknown>): Promise<unknown>;
  /** SVG → PNG (resvg + FiraGO); null when it cannot. */
  rasterize(svg: string, w: number, h: number): Promise<Buffer | null>;
  /** Runs ffmpeg with the given args inside `dir` (files written there first). */
  ffmpegRun(args: string[]): Promise<void>;
  upload(bytes: Buffer): Promise<string | null>;
}

// ── PAUSES (free) ────────────────────────────────────────────────────────────────────────────────────────────────

export async function detectSilences(deps: Pick<SmartDeps, 'ffmpegLog'>, url: string, window: Span): Promise<Span[]> {
  const log = await deps.ffmpegLog(silenceDetectArgs(url, window));
  // times in the log are relative to the seek point → shift back to source seconds
  return parseSilenceLog(log, window.endSec - window.startSec, window.startSec);
}

// ── WORDS (Chirp 3, the only paid job) ───────────────────────────────────────────────────────────────────────────

export interface CaptionSource { sourceId: string; url: string; startSec: number; endSec: number }

export interface CaptionRun {
  wordsBySource: Record<string, CaptionWord[]>;
  /** Audio seconds actually sent to Chirp (what is charged). */
  billedSec: number;
  /** Pieces that failed (their words are missing); the route refuses to charge when all failed. */
  failedPieces: number;
  pieces: number;
}

/**
 * Recognise every source window: pauses found first (free), the window split at them into pieces under a minute, each
 * piece one Recognize call, the words shifted back into source seconds and merged. Sources are done one after another,
 * pieces of one source two at a time (Chirp's quota is per minute; a 5-minute edit is at most ~6 calls).
 */
export async function runCaptions(deps: Pick<SmartDeps, 'ffmpegLog' | 'extractWav' | 'recognize'>, sources: readonly CaptionSource[], lang: CaptionLang): Promise<CaptionRun> {
  const wordsBySource: Record<string, CaptionWord[]> = {};
  const sent: Span[] = [];
  let failed = 0, total = 0;
  for (const src of sources) {
    const window = { startSec: src.startSec, endSec: src.endSec };
    const silences = await detectSilences(deps, src.url, window).catch(() => [] as Span[]);
    const rel = silences.map((s) => ({ startSec: s.startSec - window.startSec, endSec: s.endSec - window.startSec }));
    const chunks = planCaptionChunks(window.endSec - window.startSec, rel).map((c) => ({ startSec: c.startSec + window.startSec, endSec: c.endSec + window.startSec }));
    const results: CaptionWord[][] = [];
    for (let i = 0; i < chunks.length; i += 2) {
      const pair = chunks.slice(i, i + 2);
      const got = await Promise.all(pair.map(async (c) => {
        total += 1;
        try {
          const wav = await deps.extractWav(src.url, c.startSec, c.endSec);
          sent.push(c);
          const raw = await deps.recognize(chirpCaptionBody(Buffer.from(wav).toString('base64'), lang));
          return parseChirpWords(raw, c.startSec).words;
        } catch {
          failed += 1;
          return [] as CaptionWord[];
        }
      }));
      results.push(...got);
    }
    wordsBySource[src.sourceId] = mergeChunkWords(results);
  }
  return { wordsBySource, billedSec: billedAudioSec(sent), failedPieces: failed, pieces: total };
}

// ── THE SMART LAYERS ON A MASTER (free) ──────────────────────────────────────────────────────────────────────────

export interface SmartLayers {
  tracks: SmartTracks;
  captions?: { words: CaptionWord[]; style: CaptionStyleId; pos?: CaptionPos } | null;
  safe?: SafeZone;
}

/** Most words one render lays (a 5-minute edit at ~3 words/s); the rest are dropped, never an error. */
export const MAX_CAPTION_WORDS = 1200;

/**
 * The `smart` field of a render request, made safe: tracks through coerceTracks, caption words clipped to the edit and
 * capped, an unknown style → standard, the safe zone from a known template only. Anything malformed becomes "no layer".
 */
export function coerceSmartLayers(raw: unknown, totalSec: number): SmartLayers | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const tracks = coerceTracks(r.tracks, totalSec);
  let captions: SmartLayers['captions'] = null;
  const c = r.captions as Record<string, unknown> | undefined;
  if (c && typeof c === 'object' && Array.isArray(c.words)) {
    const words: CaptionWord[] = [];
    for (const w of c.words) {
      if (words.length >= MAX_CAPTION_WORDS) break;
      const o = w as Record<string, unknown> | null;
      const text = typeof o?.text === 'string' ? o.text.trim().slice(0, 40) : '';
      const s = Number(o?.startSec), e = Number(o?.endSec);
      if (!text || !Number.isFinite(s) || !Number.isFinite(e) || e <= s || s >= totalSec || e <= 0) continue;
      words.push({ text, startSec: Math.max(0, s), endSec: Math.min(totalSec, e) });
    }
    words.sort((a, b) => a.startSec - b.startSec);
    if (words.length) {
      const pos = c.pos === 'top' || c.pos === 'middle' || c.pos === 'bottom' ? c.pos : undefined;
      captions = { words, style: isCaptionStyle(c.style) ? c.style : 'standard', ...(pos ? { pos } : {}) };
    }
  }
  const safe = isTemplateId(r.template) ? TEMPLATES[r.template].safe : undefined;
  const layers: SmartLayers = { tracks, captions, ...(safe ? { safe } : {}) };
  return hasSmartLayers(layers) ? layers : null;
}

export const hasSmartLayers = (l: SmartLayers | null | undefined): l is SmartLayers =>
  !!l && (l.tracks.texts.length > 0 || l.tracks.effects.length > 0 || (l.captions?.words.length ?? 0) > 0);

const TEXT_STYLE: Record<TextItem['look'], CaptionStyleId> = { title: 'bold-word', subtitle: 'standard', label: 'boxed' };

/**
 * ONE extra ffmpeg pass over the joined master: the effects chain, then the captions as ONE image stream (the frame PNGs
 * concatenated with their durations, ./captions concatList), then each title as its own PNG switched on over its span.
 * Audio is copied untouched. Returns the new master's URL, or null (the caller fails the job: an edit without the
 * captions the person asked for is a wrong edit).
 */
export async function renderSmartLayers(deps: Pick<SmartDeps, 'rasterize' | 'ffmpegRun' | 'upload'>, masterUrl: string, layers: SmartLayers, w: number, h: number, totalSec: number, workDir?: string): Promise<string | null> {
  const dir = workDir ?? (await mkdtemp(join(tmpdir(), 'smart-')));
  try {
    const inputs: string[] = ['-i', masterUrl];
    const graph: string[] = [];
    let cur = '0:v';
    let n = 1;
    const fx = buildFxChain(layers.tracks.effects, w, h);
    if (fx) { graph.push(`[${cur}]${fx}[fx]`); cur = 'fx'; }

    if (layers.captions && layers.captions.words.length) {
      const style = CAPTION_STYLES[layers.captions.style] ?? CAPTION_STYLES.standard;
      const cards = buildCards(layers.captions.words, style);
      const frames = captionFrames(cards, style).slice(0, MAX_CAPTION_FRAMES);
      const blank = await deps.rasterize(blankFrameSvg(w, h), w, h);
      if (!blank) return null;
      await writeFile(join(dir, 'blank.png'), blank);
      for (let i = 0; i < frames.length; i += 1) {
        const f = frames[i]!;
        const png = await deps.rasterize(buildCaptionFrameSvg({ card: cards[f.card]!, frame: f, style: style.id, ...(layers.captions.pos ? { pos: layers.captions.pos } : {}), w, h, ...(layers.safe ? { safe: layers.safe } : {}) }), w, h);
        if (!png) return null;
        await writeFile(join(dir, `c${i}.png`), png);
      }
      await writeFile(join(dir, 'captions.ffconcat'), concatList(frames, (i) => join(dir, `c${i}.png`), join(dir, 'blank.png'), totalSec));
      inputs.push('-f', 'concat', '-safe', '0', '-i', join(dir, 'captions.ffconcat'));
      graph.push(`[${cur}][${n}:v]overlay=0:0:format=auto:eof_action=pass[cap]`);
      cur = 'cap';
      n += 1;
    }

    for (const [k, t] of layers.tracks.texts.entries()) {
      const words = t.text.split(/\s+/).map((text, i) => ({ text, startSec: t.t0 + i * 0.001, endSec: t.t1 }));
      const style = CAPTION_STYLES[TEXT_STYLE[t.look]];
      const card = { startSec: t.t0, endSec: t.t1, words, lines: buildCards(words, { ...style, maxWords: 99, maxLines: 4 })[0]?.lines ?? [words.map((_, i) => i)] };
      const png = await deps.rasterize(buildCaptionFrameSvg({ card, frame: { active: -1 }, style: TEXT_STYLE[t.look], pos: t.pos, w, h, ...(layers.safe ? { safe: layers.safe } : {}) }), w, h);
      if (!png) return null;
      const p = join(dir, `t${k}.png`);
      await writeFile(p, png);
      inputs.push('-loop', '1', '-t', totalSec.toFixed(3), '-i', p);
      graph.push(`[${cur}][${n}:v]overlay=0:0:enable='between(t\\,${t.t0}\\,${t.t1})'[t${k}]`);
      cur = `t${k}`;
      n += 1;
    }

    const out = join(dir, 'out.mp4');
    const args = [
      '-y', '-v', 'error', ...inputs,
      '-filter_complex', graph.length ? graph.join(';') : '[0:v]null[v]',
      '-map', graph.length ? `[${cur}]` : '[v]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
      '-c:a', 'copy', '-t', totalSec.toFixed(3), '-movflags', '+faststart', out,
    ];
    await deps.ffmpegRun(args);
    return await deps.upload(await readFile(out));
  } catch {
    return null;
  } finally {
    if (!workDir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ── THE REAL WIRING ──────────────────────────────────────────────────────────────────────────────────────────────

export function liveSmartDeps(): SmartDeps {
  const bin = (): string => {
    if (!BIN) throw new Error('ffmpeg is not available');
    return BIN;
  };
  return {
    async ffmpegLog(args) {
      try {
        return (await ffmpegExec(bin(), args, { maxBuffer: 1 << 24, timeout: 120_000 })).stderr;
      } catch (e) {
        return String((e as { stderr?: unknown })?.stderr ?? '');
      }
    },
    async extractWav(url, startSec, endSec) {
      const dir = await mkdtemp(join(tmpdir(), 'smart-wav-'));
      try {
        const out = join(dir, 'a.wav');
        await ffmpegExec(bin(), ['-y', '-v', 'error', '-ss', startSec.toFixed(3), '-t', Math.max(0.1, endSec - startSec).toFixed(3), '-i', url, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out], { maxBuffer: 1 << 22, timeout: 120_000 });
        return new Uint8Array(await readFile(out));
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
    async recognize(body) {
      const config = vertexAiConfig();
      if (!config) throw new Error('Vertex AI is not configured');
      const token = await getVertexAccessToken(false);
      const url = `https://${CHIRP_LOCATION}-speech.googleapis.com/v2/projects/${encodeURIComponent(config.projectId)}/locations/${CHIRP_LOCATION}/recognizers/_:recognize`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, redirect: 'manual', body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
      if (!res.ok) throw new Error(`Chirp 3 failed (${res.status})`);
      return res.json();
    },
    async rasterize(svg) {
      try {
        const [{ Resvg }, { overlayFontFiles }] = await Promise.all([import('@resvg/resvg-js'), import('@/lib/pipeline/compositing/ffmpeg-overlay')]);
        const r = new Resvg(svg, { font: { fontFiles: overlayFontFiles(), loadSystemFonts: false, defaultFontFamily: 'FiraGO' } });
        return Buffer.from(r.render().asPng());
      } catch {
        return null;
      }
    },
    async ffmpegRun(args) {
      await ffmpegExec(bin(), args, { maxBuffer: 1 << 24, timeout: 400_000 });
    },
    async upload(bytes) {
      return uploadBufferAndSign('renders', `montage/smart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`, bytes, 'video/mp4', WEEK_SEC);
    },
  };
}
