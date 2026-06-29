/**
 * lib/audio/georgianSong.ts
 * =========================
 * Real GEORGIAN vocals for a music video. ElevenLabs Music v1 can't sing Georgian,
 * so we build the song ourselves: Georgian rap/hook lyrics → the cloned Georgian
 * voice (KA clone via textToHostedSpeech) → mixed OVER a funk instrumental bed
 * (ElevenLabs Music instrumental, MusicGen fallback) with the vocal up front. The
 * resulting hosted MP3 is handed to the pipeline as the master soundtrack, so the
 * assemble + lip-sync + composite all run unchanged — and the lips track a REAL
 * Georgian vocal.
 *
 * Strictly fail-open: any miss returns null and the caller falls back to the normal
 * (English) ElevenLabs Music path.
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { KA_VOICE_MALE, KA_VOICE_FEMALE } from '@/lib/audio/georgian-voice';
import { composeElevenLabsMusic, hasElevenLabsMusicKey } from '@/lib/elevenlabs/music';
import { generateMusic } from '@/lib/ai/replicate';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

const exec = promisify(execFile);

/** Compose a short Georgian rap/hook from the brief's theme. Deterministic (no LLM
 *  dependency, which is dead in this env) so it always returns real Georgian lyrics. */
export function generateGeorgianLyrics(brief: string): string {
  const b = (brief || '').toLowerCase();
  const tbilisi = /tbilisi|თბილის/.test(b);
  const night = /night|ღამ/.test(b);
  const love = /love|სიყვარ/.test(b);
  const place = tbilisi ? 'თბილისი' : 'ქალაქი';
  // A confident funk/hip-hop hook + two short verses (Georgian). Repetition + a clear
  // hook reads as a real song hook; the cloned voice carries the rhythm over the beat.
  const hook = [
    `${place} მთვლემარე, შუქები ანათებს,`,
    `გული მცემს, ეს რიტმი მაცეკვებს.`,
    `თავდაჯერებული, არაფრის მეშინია,`,
    `ეს ჩემი ხმაა, ეს ჩემი ღამეა.`,
  ];
  const verse1 = [
    `ბასი მძიმე, გრუვი ცოცხალია,`,
    `${night ? 'ღამის' : 'ცის'} ფერი ოქროსფერია.`,
    `მე მოვდივარ ჩემი ნაბიჯით,`,
    `მუსიკა მღერის, სული ფრთხილია.`,
  ];
  const verse2 = [
    love ? `სიყვარული მღერის ამ ჰანგებში,` : `ენერგია მღერის ამ ჰანგებში,`,
    `ცეცხლი ანთია ჩემს გულში.`,
    `${place} ჩემია, განწყობა მაღალი,`,
    `ეს ფანკი მარადიული.`,
  ];
  return [...hook, ...verse1, ...hook.slice(0, 2), ...verse2].join(' ');
}

/** Funk instrumental prompt for the bed (no vocals). */
function instrumentalPrompt(brief: string, totalSec: number): string {
  return (
    `A ${totalSec}-second instrumental Funk / R&B / Hip-Hop groove at ~90 BPM in F minor: ` +
    `driving electric bass, tight drums, wah guitar, warm Rhodes, smooth and confident. ` +
    `Fully instrumental — NO vocals, no lyrics, no singing. Brief: ${brief.slice(0, 200)}`
  );
}

/** Resolve the funk instrumental bed → hosted URL (EL Music instrumental, MusicGen fallback). */
async function instrumentalBed(brief: string, totalSec: number, signal?: AbortSignal): Promise<string | null> {
  if (hasElevenLabsMusicKey()) {
    try {
      const { audio, contentType } = await composeElevenLabsMusic({
        prompt: instrumentalPrompt(brief, totalSec), lengthMs: totalSec * 1000, instrumental: true, signal,
      });
      const path = `films/kabed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
      const url = await uploadAndSign('uploads', path, audio.toString('base64'), contentType, 604_800);
      if (url) return url;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ka-song] EL instrumental failed → MusicGen:', err instanceof Error ? err.message : err);
    }
  }
  try {
    const score = await generateMusic(`${instrumentalPrompt(brief, totalSec)}`, totalSec);
    return score.audioUrl ?? null;
  } catch {
    return null;
  }
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
  const lyrics = generateGeorgianLyrics(brief);
  out.lyricsLen = lyrics.length;
  const voiceId = gender === 'male' ? KA_VOICE_MALE : KA_VOICE_FEMALE;
  try { out.vocal = !!(await textToHostedSpeech(lyrics, voiceId)); }
  catch (e) { out.vocal = false; out.vocalErr = (e instanceof Error ? e.message : String(e)).slice(0, 250); }
  out.elMusicKey = hasElevenLabsMusicKey();
  if (hasElevenLabsMusicKey()) {
    try {
      const r = await composeElevenLabsMusic({ prompt: instrumentalPrompt(brief, totalSec), lengthMs: totalSec * 1000, instrumental: true, signal });
      out.elMusic = !!(r.audio && r.audio.length > 1024);
    } catch (e) { out.elMusic = false; out.elMusicErr = (e instanceof Error ? e.message : String(e)).slice(0, 250); }
  }
  try { const s = await generateMusic(instrumentalPrompt(brief, totalSec), totalSec); out.musicGen = !!s.audioUrl; }
  catch (e) { out.musicGen = false; out.musicGenErr = (e instanceof Error ? e.message : String(e)).slice(0, 250); }
  return out;
}

/**
 * Build the full Georgian song (vocal mixed over the funk bed) → hosted MP3 URL.
 * @param gender steers the cloned voice (male = deeper soul/rap timbre).
 */
export async function generateGeorgianSong(
  brief: string,
  gender: 'male' | 'female',
  totalSec = 30,
  signal?: AbortSignal,
): Promise<string | null> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) return null;
  // 1. Georgian vocal (cloned KA voice) + 2. funk instrumental bed, concurrently.
  // Each leg is bounded by its OWN timeout: ElevenLabs TTS / Music have no native
  // timeout, so a single slow leg used to pin the route until its 240s maxDuration
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
  const lyrics = generateGeorgianLyrics(brief);
  const voiceId = gender === 'male' ? KA_VOICE_MALE : KA_VOICE_FEMALE;
  const [vocalUrl, bedUrl] = await Promise.all([
    withTimeout(textToHostedSpeech(lyrics, voiceId).catch(() => null), 'vocal'),
    withTimeout(instrumentalBed(brief, totalSec, signal), 'instrumental-bed'),
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
      // negotiates a mono layout and collapses the stereo funk bed to mono.
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
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
