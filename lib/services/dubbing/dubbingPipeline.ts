/**
 * lib/services/dubbing/dubbingPipeline.ts — the seven legs, run end to end (Master Task §2.3.2).
 *
 *   1 extract_audio  ffmpeg           video → mono mp3
 *   2 transcribe      ElevenLabs Scribe  mp3 → timed, speaker-labelled segments
 *   3 translate       Gemini (llmText)   segments → length-matched target-language lines
 *   4 synthesize      ElevenLabs TTS     lines → speech, one voice per speaker
 *   5 sync            ffmpeg atempo      each line time-fitted to its original slot
 *   6 mix             ffmpeg amix        lines placed on the timeline over the ducked bed, muxed to picture
 *   7 lipsync         (optional)         deferred — see LIP-SYNC below
 *
 * PROGRESS is reported through the same `generation_jobs` row the rest of the platform uses, so the existing
 * job tray shows a dub without any new client plumbing.
 *
 * LIP-SYNC: leg 7 stays unwired. The repo's lip-sync path re-renders the whole picture through a provider,
 * which for a multi-minute source costs more than the other six legs together and degrades footage we did
 * not otherwise touch. `plannedSteps({lipSync:true})` still advertises it; the pipeline reports it skipped
 * rather than silently claiming it ran.
 *
 * FAILURE POLICY: legs 1–3 are load-bearing — no audio, no transcript or no translation means there is
 * nothing to dub, so the job fails with the real reason. Leg 4 is per-segment and degrades: a line that will
 * not synthesize is dropped from the mix and counted, because losing one line beats losing the film.
 */
import 'server-only';
import { extractInstrumentalStem } from '@/lib/audio/instrumentalStem';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synthesizeWithTimestamps } from '@/lib/elevenlabs/ttsTimestamps';
import { updateJobStage } from '@/lib/orchestrator/jobs';
import { reportError } from '@/lib/observability/report-error';
import {
  toSrt,
  speakerCount,
  dubbingMinutes,
  type DubbingRequest,
  type DubbingSegment,
  type DubbingStep,
} from './dubbingPlan';
import { transcribeWithScribe } from './elevenScribe';
import { assignVoices } from './voiceCast';
import { translateSegments } from './translateSegments';
import { extractAudioTrack, mixDubbedTrack, muxDubOntoVideo, hostSubtitles, type PlacedClip } from './dubbingFfmpeg';

/** Per-leg share of the progress bar. Extract and transcribe are quick; synthesis dominates. */
const PCT: Record<DubbingStep, number> = {
  extract_audio: 8, transcribe: 22, translate: 34, synthesize: 74, sync: 80, mix: 96, lipsync: 98,
};

export interface DubbingResult {
  videoUrl: string;
  audioUrl: string;
  subtitlesUrl: string | null;
  segments: DubbingSegment[];
  detectedLanguage: string | null;
  speakers: number;
  minutes: number;
  /** Legs that ran. `lipsync` never appears — see LIP-SYNC above. */
  stepsRun: DubbingStep[];
  /** Lines that could not be synthesized and are missing from the dub. 0 on a clean run. */
  droppedLines: number;
  /** Lines that came back in the source language. 0 on a clean run. */
  untranslatedLines: number;
  /**
   * True when the background bed is a SEPARATED instrumental (voices removed). False means separation
   * was unavailable or missed and the bed is the original audio ducked — so the original speakers are
   * still faintly audible under the dub. The user asked to keep the background; they deserve to know
   * WHICH background they got, because the two sound materially different.
   */
  backgroundSeparated: boolean;
}

export type DubbingOutcome =
  | { ok: true; result: DubbingResult }
  | { ok: false; step: DubbingStep; error: string };

/** Last character end-time in the alignment = how long the synthesized line actually is. */
function alignmentDuration(ends: readonly number[] | undefined): number | null {
  if (!Array.isArray(ends) || !ends.length) return null;
  const last = Number(ends[ends.length - 1]);
  return Number.isFinite(last) && last > 0 ? last : null;
}

async function stage(jobId: string | null, step: DubbingStep): Promise<void> {
  if (!jobId) return;
  await updateJobStage(jobId, step, PCT[step]).catch(() => {});
}

export async function runDubbing(
  req: DubbingRequest,
  opts: { jobId?: string | null; voiceId?: string | null } = {},
): Promise<DubbingOutcome> {
  const jobId = opts.jobId ?? null;
  const stepsRun: DubbingStep[] = [];
  let dir: string | null = null;

  try {
    // ── LEG 1 · extract ────────────────────────────────────────────────────────────────────────────
    await stage(jobId, 'extract_audio');
    const extracted = await extractAudioTrack(req.sourceVideoUrl);
    if (!extracted) return { ok: false, step: 'extract_audio', error: 'could not read audio from the video' };
    stepsRun.push('extract_audio');

    // ── LEG 2 · transcribe ─────────────────────────────────────────────────────────────────────────
    await stage(jobId, 'transcribe');
    const scribe = await transcribeWithScribe(extracted.buffer, {
      languageCode: req.sourceLanguage === 'auto' ? null : req.sourceLanguage,
      diarize: true,
    });
    if (!scribe || !scribe.segments.length) {
      return { ok: false, step: 'transcribe', error: 'no speech found in the source audio' };
    }
    stepsRun.push('transcribe');

    // Measured length wins over anything the client claimed — the mix is cut to this, so a wrong value
    // truncates the dub. The last spoken moment is the floor when the probe came back empty.
    const lastSpoken = scribe.segments.reduce((m, s) => Math.max(m, s.endSec), 0);
    const totalSec = extracted.durationSec && extracted.durationSec > 0 ? extracted.durationSec : lastSpoken + 1;

    // ── LEG 3 · translate ──────────────────────────────────────────────────────────────────────────
    await stage(jobId, 'translate');
    const { segments, untranslated } = await translateSegments(
      scribe.segments,
      req.targetLanguage,
      scribe.detectedLanguage ?? (req.sourceLanguage === 'auto' ? null : req.sourceLanguage),
    );
    // Every single line failing means the model chain is down, not that the text was untranslatable.
    if (untranslated === segments.length) {
      return { ok: false, step: 'translate', error: 'translation returned nothing usable' };
    }
    stepsRun.push('translate');

    // ── LEG 4 · synthesize ─────────────────────────────────────────────────────────────────────────
    await stage(jobId, 'synthesize');
    const voices = assignVoices(segments, opts.voiceId ?? null);
    dir = await mkdtemp(join(tmpdir(), 'dub-tts-'));

    const clips: PlacedClip[] = [];
    let dropped = 0;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      if (!seg) continue;
      const line = (seg.translated || seg.text).trim();
      const voiceId = voices.get(seg.speaker ?? '_') || '';
      if (!line || !voiceId) { dropped += 1; continue; }

      const out = await synthesizeWithTimestamps(line, voiceId);
      if (!out.ok) {
        dropped += 1;
        console.warn(`[dub/tts] segment ${i} failed: ${out.error}`);
        continue;
      }
      // ffmpeg reads these straight off disk — uploading every line just to hand it back a URL would add
      // one network round trip per line of dialogue.
      const file = join(dir, `seg-${String(i).padStart(4, '0')}.mp3`);
      await writeFile(file, Buffer.from(out.audioBase64, 'base64'));
      clips.push({
        url: file,
        startSec: seg.startSec,
        slotSec: Math.max(0.1, seg.endSec - seg.startSec),
        synthesizedSec: alignmentDuration(out.alignment?.character_end_times_seconds),
      });

      if (jobId && i % 10 === 0) {
        const span = PCT.synthesize - PCT.translate;
        await updateJobStage(jobId, 'synthesize', PCT.translate + Math.round((span * i) / segments.length)).catch(() => {});
      }
    }
    if (!clips.length) return { ok: false, step: 'synthesize', error: 'no dialogue could be synthesized' };
    stepsRun.push('synthesize');

    // ── LEGS 5 + 6 · sync + mix ────────────────────────────────────────────────────────────────────
    // Time-fitting happens inside the mix filtergraph (one ffmpeg pass, not one per line), so `sync` is
    // recorded as run but has no separate command.
    await stage(jobId, 'sync');
    stepsRun.push('sync');

    await stage(jobId, 'mix');
    // ⚠️ THE BED USED TO BE THE ORIGINAL AUDIO, MERELY DUCKED — so the original speakers stayed audible
    // underneath the dub and the viewer heard two languages at once. Ducking cannot fix that: voices and
    // music are the same signal, so ducking harder removes the music too. dubbingFfmpeg's header called
    // this out as a known, audible limitation and named the remedy — "wiring a separator later only
    // changes `bedUrl`" — so that is precisely what this is.
    //
    // Demucs was already running in this repo for the audio studio's splitter; it was simply unreachable
    // from here. On success the bed becomes music + ambience with the voices REMOVED, which is what
    // "preserve background audio" was always supposed to mean.
    //
    // Fail-open to the previous behaviour: no token, a miss, or a timeout returns null and the ducked
    // original is used exactly as before. A dub that ships with the old bed is today's product; a dub
    // that fails because a separator was unavailable would be a regression caused by an improvement.
    let bedUrl: string | null = req.preserveBackgroundAudio ? req.sourceVideoUrl : null;
    let bedSeparated = false;
    if (bedUrl) {
      const stem = await extractInstrumentalStem(bedUrl).catch(() => null);
      if (stem?.url) { bedUrl = stem.url; bedSeparated = true; }
    }
    const audioUrl = await mixDubbedTrack(clips, {
      bedUrl,
      totalSec,
    });
    if (!audioUrl) return { ok: false, step: 'mix', error: 'could not build the dubbed audio track' };

    const videoUrl = await muxDubOntoVideo(req.sourceVideoUrl, audioUrl);
    if (!videoUrl) return { ok: false, step: 'mix', error: 'could not attach the dub to the video' };
    stepsRun.push('mix');

    const subtitlesUrl = req.subtitles
      ? await hostSubtitles(toSrt(segments.map((s) => ({ ...s, text: s.translated || s.text }))))
      : null;

    return {
      ok: true,
      result: {
        videoUrl,
        audioUrl,
        subtitlesUrl,
        segments,
        detectedLanguage: scribe.detectedLanguage,
        speakers: speakerCount(segments),
        minutes: dubbingMinutes(totalSec),
        stepsRun,
        droppedLines: dropped,
        untranslatedLines: untranslated,
        backgroundSeparated: bedSeparated,
      },
    };
  } catch (err) {
    reportError(err, { where: 'dubbingPipeline.run' });
    const last = stepsRun[stepsRun.length - 1] ?? 'extract_audio';
    return { ok: false, step: last, error: err instanceof Error ? err.message : 'dubbing failed' };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
