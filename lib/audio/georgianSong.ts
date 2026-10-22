/**
 * lib/audio/georgianSong.ts
 * =========================
 * Real GEORGIAN vocals for a music video. ElevenLabs Music v1 can't sing Georgian,
 * so we build the song ourselves: Georgian lyrics written from the brief → a Georgian Cloud TTS
 * voice (textToHostedSpeech) → mixed OVER an instrumental bed in the brief's genre
 * (ElevenLabs Music instrumental; there is no MusicGen fallback) with the vocal up front. The
 * resulting hosted MP3 is handed to the pipeline as the master soundtrack, so the
 * assemble + lip-sync + composite all run unchanged — and the lips track a REAL
 * Georgian vocal.
 *
 * Strictly fail-open: any miss returns null and the caller falls back to the normal
 * (English) ElevenLabs Music path.
 */
import 'server-only';
import { reportError } from '@/lib/observability/report-error';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { composeElevenLabsMusic, hasElevenLabsMusicKey, genreBpm, sceneAlignedBpm, songGenreFromBrief } from '@/lib/elevenlabs/music';
import { generateWithGemini } from '@/lib/gemini/client';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

const exec = promisify(execFile);

/**
 * What the lyric writer is told. The lyrics ARE the song the singer performs, so they must be about what the user asked
 * for — the person, place, story and mood of the brief — in Georgian script only, with nothing the brief did not ask for.
 */
const LYRICS_SYSTEM = [
  'You write the lyrics of a short song for a Georgian music video.',
  'Write ONLY in Georgian (Mkhedruli script). No English or Latin letters, no transliteration.',
  'The song is about exactly what the brief asks for: its subject, the people it names, the place, the story and the mood.',
  'Never add a website, brand, product, call to action or advertising line the brief does not ask for.',
  'Short, rhythmic lines of 4 to 9 words that are easy to perform over a beat, with a hook line that repeats.',
  'Answer with the lyric lines only, one per line: no title, no section labels, no numbering, no quotes, no commentary.',
].join(' ');

/** Georgian letters in a line (Mkhedruli). */
const KA = /[\u10D0-\u10FF]/g;

/**
 * Keep the lines of a lyric-writer answer that a Georgian voice can sing: Georgian lines only (a Latin-heavy, labelled or
 * empty line is dropped), at most `maxLines`. Null when fewer than 4 such lines remain — a song that thin is a miss.
 */
export function cleanGeorgianLyrics(raw: string, maxLines: number): string | null {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s>*#\-–—•\d.)\]]+/, '').replace(/["“”„«»*_]/g, '').trim())
    .filter((l) => {
      if (!l || /^\[.*\]$/.test(l) || /^\(.*\)$/.test(l)) return false; // [Chorus] / (x2)
      if (/https?:|www\.|\.(?:ge|com|net|org)\b/i.test(l)) return false;   // no addresses, ever
      const ka = (l.match(KA) || []).length;
      const latin = (l.match(/[A-Za-z]/g) || []).length;
      return ka >= 3 && latin === 0;
    })
    .slice(0, Math.max(4, maxLines));
  return lines.length >= 4 ? lines.join('\n') : null;
}

/**
 * Write Georgian lyrics FROM THE BRIEF (Gemini). These used to be a fixed funk template — "თბილისი მთვლემარე, შუქები
 * ანათებს…" with a word or two swapped on "tbilisi" / "night" / "love" — so every Georgian music video sang the same song
 * whatever the user asked for (Production 2026-10-16: "the brief is ignored"). Null on any miss: the caller then has no
 * Georgian song, and the film's own song is composed from the brief instead — never a canned one.
 */
export async function writeGeorgianLyrics(brief: string, totalSec: number): Promise<string | null> {
  const text = (brief || '').trim();
  if (!text) return null;
  // About one performed line every 3.5 s of song, so the vocal fits inside the song and is not cut off at its end.
  const lines = Math.max(6, Math.min(40, Math.round(totalSec / 3.5)));
  try {
    const r = await generateWithGemini({
      prompt: `Brief (any language):\n${text.slice(0, 1500)}\n\nThe song lasts ${Math.round(totalSec)} seconds: write ${lines} lines.`,
      systemPrompt: LYRICS_SYSTEM,
      tier: 'flash',
      maxTokens: 1200,
      temperature: 0.8,
      thinkingBudget: 0,
      timeoutMs: 20_000,
    });
    return cleanGeorgianLyrics(r.text || '', lines);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ka-song] lyric writer failed → no Georgian song:', e instanceof Error ? e.message.slice(0, 160) : e);
    return null;
  }
}

/**
 * The instrumental bed's prompt: the genre the brief names (funk / R&B / hip-hop groove when it names none), at the tempo
 * where every scene cut lands on a bar line (lib/elevenlabs/music sceneAlignedBpm), and the brief's theme in English.
 */
export function instrumentalPrompt(brief: string, totalSec: number, opts: { theme?: string; sceneSec?: number } = {}): string {
  const theme = (opts.theme || '').trim() || brief;
  const named = songGenreFromBrief(`${brief}\n${theme}`);
  const bpm = sceneAlignedBpm(genreBpm(named ?? 'hip-hop'), opts.sceneSec ?? 8);
  const style = named
    ? `${named} instrumental`
    : 'Funk / R&B / Hip-Hop groove: driving electric bass, tight drums, wah guitar, warm Rhodes, smooth and confident';
  return (
    `A ${totalSec}-second ${style} at a steady ${bpm} BPM in 4/4, one continuous piece with no breaks. ` +
    `Fully instrumental — NO vocals, no lyrics, no singing. Theme: ${theme.slice(0, 200)}`
  );
}

/**
 * Resolve the instrumental bed → hosted URL. ONE ENGINE: ElevenLabs Music when its key is present, and no bed on a
 * deployment without one (MusicGen on Replicate stood in there; it has no Google engine, MASTER TASK v3.1).
 * ⚠️ NO SILENT FALLBACK (the owner, 2026-10-09: "აკრძალული პროვაიდერის ჩუმი fallback არ დაუშვა"). An ElevenLabs miss used to
 * fall through to MusicGen, an outside engine nobody chose; it is now a miss (null — the caller reports it).
 */
export async function instrumentalBed(brief: string, totalSec: number, signal?: AbortSignal, opts: { theme?: string; sceneSec?: number } = {}): Promise<string | null> {
  if (hasElevenLabsMusicKey()) {
    try {
      const { audio, contentType } = await composeElevenLabsMusic({
        prompt: instrumentalPrompt(brief, totalSec, opts), lengthMs: totalSec * 1000, instrumental: true, signal,
      });
      const path = `films/kabed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
      return await uploadAndSign('uploads', path, audio.toString('base64'), contentType, 604_800);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ka-song] EL instrumental failed (no other engine is tried):', err instanceof Error ? err.message : err);
      return null;
    }
  }
  // No ElevenLabs Music key → no bed, which the song builder already handles as a miss. MusicGen (Replicate) used to
  // stand in; it has no Google engine (MASTER TASK v3.1) and is never called, whatever MEDIA_GOOGLE_ONLY says.
  return null;
}

/**
 * Diagnostic — run each leg in isolation and report which succeeds + the error.
 * Gated behind the route's `diag` flag; lets us localize a prod failure (the main
 * path fail-opens to null and hides the cause). Never throws.
 */
export async function diagnoseGeorgianSong(
  brief: string,
  gender: 'male' | 'female',
  totalSec = 30,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const bin = ffmpegStatic as unknown as string | null;
  out.ffmpegBin = !!bin;
  if (bin) {
    try { await exec(bin, ['-version'], { timeout: 10_000 }); out.ffmpegRuns = true; }
    catch (e) { out.ffmpegRuns = false; out.ffmpegErr = (e instanceof Error ? e.message : String(e)).slice(0, 200); }
  }
  const lyrics = await writeGeorgianLyrics(brief, totalSec);
  out.lyricsLen = lyrics?.length ?? 0;
  if (lyrics) {
    try { out.vocal = !!(await textToHostedSpeech(lyrics, gender)); }
    catch (e) { out.vocal = false; out.vocalErr = (e instanceof Error ? e.message : String(e)).slice(0, 250); }
  } else out.vocal = 'skipped (no lyrics)';
  out.elMusicKey = hasElevenLabsMusicKey();
  if (hasElevenLabsMusicKey()) {
    try {
      const r = await composeElevenLabsMusic({ prompt: instrumentalPrompt(brief, totalSec), lengthMs: totalSec * 1000, instrumental: true, signal });
      out.elMusic = !!(r.audio && r.audio.length > 1024);
    } catch (e) { out.elMusic = false; out.elMusicErr = (e instanceof Error ? e.message : String(e)).slice(0, 250); }
  }
  out.musicGen = 'off (no Google engine)';
  return out;
}

/**
 * Build the full Georgian song (vocal mixed over the instrumental bed) → hosted MP3 URL. Null on any miss, the lyric
 * writer's included.
 * @param gender steers the voice (male = deeper soul/rap timbre).
 */
export async function generateGeorgianSong(
  brief: string,
  gender: 'male' | 'female',
  totalSec = 30,
  signal?: AbortSignal,
  opts: { sceneSec?: number } = {},
): Promise<string | null> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) return null;
  // 0. The words, from the brief — before anything is composed, so a miss here costs no voice or music render. The bed's
  //    theme reaches its engine in English (it reads English), worked out alongside.
  const themeP = promptToEnglish(brief, 'music').catch(() => brief);
  const lyrics = await writeGeorgianLyrics(brief, totalSec);
  if (!lyrics) return null;
  const theme = await themeP;
  // 1. Georgian vocal (Cloud TTS) + 2. instrumental bed in the brief's genre, concurrently.
  // Each leg is bounded by its OWN timeout: the long vocal is read in several Cloud TTS parts and the
  // ElevenLabs Music call has no native timeout, so a single slow leg used to pin the route until its 240s maxDuration
  // (the georgian-song timeout). Now a slow leg resolves to null within budget and
  // the route degrades gracefully (caller falls back to the assemble EL-Music bed).
  const LEG_TIMEOUT_MS = 110_000;
  const withTimeout = <T,>(p: Promise<T>, label: string): Promise<T | null> =>
    Promise.race([
      p,
      new Promise<null>((resolve) => setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn(`[ka-song] ${label} leg timed out after ${LEG_TIMEOUT_MS}ms → degrading`);
        resolve(null);
      }, LEG_TIMEOUT_MS)),
    ]);
  const [vocalUrl, bedUrl] = await Promise.all([
    withTimeout(textToHostedSpeech(lyrics, gender).catch(() => null), 'vocal'),
    withTimeout(instrumentalBed(brief, totalSec, signal, { theme, ...(opts.sceneSec ? { sceneSec: opts.sceneSec } : {}) }), 'instrumental-bed'),
  ]);
  if (!vocalUrl || !bedUrl) {
    // eslint-disable-next-line no-console
    console.warn('[ka-song] missing leg → fallback:', { vocal: !!vocalUrl, bed: !!bedUrl });
    return null;
  }
  // 3. Mix: vocal up front, instrumental ducked under it, normalised, capped to totalSec.
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'kasong-'));
    const [vRes, bRes] = await Promise.all([fetch(vocalUrl, { signal }), fetch(bedUrl, { signal })]);
    if (!vRes.ok || !bRes.ok) return null;
    const vPath = join(dir, 'vocal.mp3');
    const bPath = join(dir, 'bed.mp3');
    await writeFile(vPath, Buffer.from(await vRes.arrayBuffer()));
    await writeFile(bPath, Buffer.from(await bRes.arrayBuffer()));
    const out = join(dir, 'song.mp3');
    await exec(bin, [
      '-y', '-i', vPath, '-i', bPath,
      '-filter_complex',
      // vocal lifted, bed ducked to ~0.5; mix, pad/trim to totalSec, broadcast loudness.
      // aformat=stereo on BOTH legs first: the TTS vocal is mono, so without this amix
      // negotiates a mono layout and collapses the stereo bed to mono.
      `[0:a]volume=1.25,aformat=channel_layouts=stereo[v];[1:a]volume=0.5,aformat=channel_layouts=stereo[b];` +
        `[v][b]amix=inputs=2:duration=longest:normalize=0,` +
        `apad,atrim=0:${totalSec},loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
      '-map', '[a]', '-c:a', 'libmp3lame', '-b:a', '192k', out,
    ], { maxBuffer: 1 << 26, timeout: 90_000, signal });
    const buf = await readFile(out);
    if (buf.byteLength < 1_024) return null;
    const path = `films/kasong-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const url = (await uploadAndSign('uploads', path, buf.toString('base64'), 'audio/mpeg', 604_800)) ?? null;
    // eslint-disable-next-line no-console
    console.log('[ka-song] Georgian song ready:', url ? 'yes' : 'no');
    return url;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ka-song] mix failed:', err instanceof Error ? err.message : err);
    reportError(err, { where: 'georgianSong.mix' });
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
