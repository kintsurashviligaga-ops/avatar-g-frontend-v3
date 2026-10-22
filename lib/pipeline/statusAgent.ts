/**
 * lib/pipeline/statusAgent.ts — on-demand pipeline health check.
 *
 * A NAMES-ONLY readiness snapshot of every production service the film/media pipeline
 * depends on, derived purely from env-var presence + the same gate functions the render
 * paths call (NO network probes → fast, free, no surprise provider spend). Surfaced via
 * GET /api/pipeline/health (admin) and the admin dashboard.
 *
 * STRICTLY fail-open: checkPipelineHealth() NEVER throws — any internal error returns a
 * minimal "critical" snapshot so the admin page always renders. It never returns a
 * secret value, only whether each key is present + which engine/model is active.
 *
 * Reality notes (read from the code paths that run today, not from their comments):
 *  - Film clips render on Google Veo 3.1 ONLY: lib/veo/engine veoTransport() (Vertex AI once configured; the
 *    Gemini Developer API is never a Veo transport under v3.1). VIDEO_GOOGLE_ONLY is ON by default, so ServiceManager.runVeoOnly turns a Veo miss into a failed
 *    leg — no Runway/Kling/LTX clip. Kling (lib/video/modelLock) is reachable only with VIDEO_GOOGLE_ONLY=0.
 *  - The film's anchor/storyboard frames are drawn by Gemini's image model (app/api/film/storyboard →
 *    lib/ai/geminiImage); a miss is an empty tile and Veo animates the scene from text. FLUX, the per-scene
 *    stylised frames and Auto-Anchor (AUTO_ANCHOR_FRAME) are all skipped under Google-only, so Auto-Anchor is
 *    no longer a row — it only comes back with the legacy paths (see the VIDEO_GOOGLE_ONLY warning).
 *  - The studio base image (app/api/nanobanana/image) is the NanoBanana RESELLER (lib/nanobanana/client →
 *    nanobananaapi.ai) and nothing else: a miss is a refunded 502, the Grok → FLUX fallbacks are gone (R7).
 *    It is a legacy vendor reselling Google's image model, NOT a direct Google call.
 *  - TTS is Google Cloud TTS only (lib/audio/google-tts, on the Vertex Workload Identity token; used by
 *    lib/chat/filmVoiceover and /api/elevenlabs/tts): the best voice for the language and gender. No ElevenLabs or
 *    Azure fallback (R7). Chat read-aloud (/api/tts/gemini) is separate.
 *  - Studio music (app/api/ai/music) Auto = Lyria 3 ALONE, no failover (R7). A FILM's score is Lyria 3 too, at
 *    /api/video/assemble (lib/audio/lyriaBed) — a miss ships the film without music; ElevenLabs Music, Udio and
 *    MusicGen are gone.
 *  - Lip-sync: film masters (kind:'film') → sync/lipsync-2 on Replicate only (lib/ai/lipsync filmLipsyncCreate);
 *    avatar talking-photo → HeyGen, or SadTalker on Replicate when HeyGen is off — one engine per job, a HeyGen miss is
 *    not re-run on SadTalker (2026-10-09). (The assemble-stage FILM_LIPSYNC_ENABLED pass is a DB/env flag, off by default.)
 *  - Subtitles burn via ffmpeg-static + SVG→PNG (resvg) — Vercel's Linux ffmpeg-static
 *    has NO libfreetype/libass, so drawtext/subtitles filters are unavailable; Georgian
 *    glyphs come from the bundled FiraGO font. See lib/pipeline/compositing/caption-burn.ts.
 */
import 'server-only';
import ffmpegStatic from 'ffmpeg-static';
import { googleAiConfigured, googleTransportKind, googleTransportProblems } from '@/lib/ai/google/transport';
import { geminiFrameModel } from '@/lib/ai/geminiImage';
import { hasLyriaProvider, lyriaModel } from '@/lib/ai/lyriaMusic';
import { STUDIO_DEFAULT_VEO_TIER } from '@/lib/credits/videoPricing';
import { isEnabledByDefault, isTruthyFlag } from '@/lib/env/flag';
import { lyriaProMaxSec } from '@/lib/music/studio/capabilities';
import { LYRIA_CLIP_MAX_SEC } from '@/lib/studio/musicEngines';
import { resolveModel } from '@/lib/veo/capabilities';
import { veoNotConfiguredDetail, veoTransport } from '@/lib/veo/engine';

export type ServiceTier = 'high' | 'medium' | 'low' | 'unavailable';

export interface ServiceStatus {
  service: string;
  provider: string;
  available: boolean;
  tier: ServiceTier;
  latencyMs?: number;
  note: string;
  icon: string;
}

export interface PipelineHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  checkedAt: string;
  services: ServiceStatus[];
  warnings: string[];
}

const dot = (avail: boolean, tier: ServiceTier): string =>
  !avail || tier === 'unavailable' ? '🔴' : tier === 'high' ? '🟢' : tier === 'medium' ? '🟡' : '🟠';

/** Presence only — a trimmed non-empty value. Never returns or logs the value itself. */
const present = (v: string | undefined): boolean => !!v && v.trim().length > 0;
const mark = (on: boolean): string => (on ? '✅' : '·');

/**
 * Build the pipeline health snapshot. Pure env inspection (sync under the hood, async
 * signature so latency probes can be added later without a contract change). FAIL-OPEN.
 */
export async function checkPipelineHealth(): Promise<PipelineHealth> {
  try {
    const env = process.env;
    const services: ServiceStatus[] = [];
    const warnings: string[] = [];

    const hasReplicate = present(env.REPLICATE_API_TOKEN);
    const hasElevenLabs = present(env.ELEVENLABS_API_KEY);

    // Vertex AI, the only Google model transport under v3.1, which the frame model and Lyria call through. A
    // GEMINI_TRANSPORT other than vertex/unset throws there and fails closed — reported here as a name, never thrown.
    let googleMissing: string[];
    try {
      googleMissing = googleTransportProblems(googleTransportKind());
    } catch {
      googleMissing = ['GEMINI_TRANSPORT (not vertex)'];
    }
    const hasGoogleAi = googleAiConfigured();

    // 1 · ANCHOR / STORYBOARD FRAME — Gemini's image model (GEMINI_FRAME_MODEL, default gemini-3.1-flash-image) draws
    //     every storyboard frame + the character anchor; a miss is an empty tile. The legacy Replicate chain
    //     (google/nano-banana → FLUX 1.1 Pro) is gone (MASTER TASK v3.1), whatever VIDEO_GOOGLE_ONLY says.
    const anchorAvail = hasGoogleAi;
    const anchorTier: ServiceTier = anchorAvail ? 'high' : 'unavailable';
    services.push({
      service: 'სურათი (Anchor)',
      provider: `Gemini ${geminiFrameModel()}`,
      available: anchorAvail,
      tier: anchorTier,
      note: !anchorAvail
        ? `${googleMissing.join(', ') || 'Google AI transport'} missing — frames come back empty, Veo animates from text`
        : 'storyboard + anchor frames on Vertex AI; a miss is an empty tile — no FLUX fallback',
      icon: dot(anchorAvail, anchorTier),
    });

    // 2 · VIDEO CLIPS — Google Veo 3.1 through lib/veo/engine (veoTransport: Vertex AI when GCP_PROJECT_ID +
    //     GCP_VEO_BUCKET + WIF/key are complete; VEO_TRANSPORT=gemini is refused, never honoured). Studio films render
    //     the STUDIO_DEFAULT_VEO_TIER model unless the plan picks another.
    const transport = veoTransport();
    const veoModel = transport ? resolveModel(transport, STUDIO_DEFAULT_VEO_TIER) : null;
    const veoMissing = (): string => `no Veo route — ${veoNotConfiguredDetail()}`;
    // Same door test filmComposite runs: a film needs a Veo route.
    const videoAvail = transport !== null;
    const videoTier: ServiceTier = videoAvail ? 'high' : 'unavailable';
    services.push({
      service: 'ვიდეო (Clips)',
      provider: transport ? 'Veo 3.1 (Vertex AI)' : 'Veo 3.1',
      available: videoAvail,
      tier: videoTier,
      note: transport
        ? `${veoModel} (default tier ${STUDIO_DEFAULT_VEO_TIER}) — Google-only: a Veo miss is a failed leg, no other engine`
        : veoMissing(),
      icon: dot(videoAvail, videoTier),
    });

    // 3 · LIP-SYNC — film masters: sync/lipsync-2 on Replicate (filmLipsyncCreate — the only engine for kind:'film').
    //     Avatar talking-photo: HeyGen, or SadTalker on Replicate when HeyGen is off (lipsyncCreate, one engine per job).
    //     Both vendors are legacy (neither Google nor ElevenLabs); their removal awaits the owner.
    const hasHeygen = present(env.HEYGEN_API_KEY);
    const lipsyncAvail = hasReplicate || hasHeygen;
    const lipsyncTier: ServiceTier = hasReplicate ? 'high' : hasHeygen ? 'medium' : 'unavailable';
    services.push({
      service: 'ლიპ-სინქი',
      provider: hasReplicate ? 'sync/lipsync-2 (Replicate)' : hasHeygen ? 'HeyGen (avatar only)' : '—',
      available: lipsyncAvail,
      tier: lipsyncTier,
      note: !lipsyncAvail
        ? 'no REPLICATE_API_TOKEN / HEYGEN_API_KEY'
        : `film: sync/lipsync-2${mark(hasReplicate)} · avatar: ${hasHeygen ? `HeyGen${mark(hasHeygen)}` : `SadTalker${mark(hasReplicate)} (Replicate)`} — legacy vendors`,
      icon: dot(lipsyncAvail, lipsyncTier),
    });

    // 4 · TTS VOICE — ElevenLabs only: eleven_v3 for Georgian (retried on multilingual_v2 — same provider), turbo v2.5
    //     otherwise. The cloned ka female/male voices are code defaults, so the env voice ids are OVERRIDES, not needs.
    services.push({
      service: 'ხმა (TTS)',
      provider: 'ElevenLabs eleven_v3',
      available: hasElevenLabs,
      tier: hasElevenLabs ? 'high' : 'unavailable',
      note: !hasElevenLabs
        ? 'ELEVENLABS_API_KEY missing — no voice-over (no other TTS provider, R7)'
        : `ka: eleven_v3 → multilingual_v2 retry · other: turbo v2.5 · cloned ka voices in code; overrides female=${mark(present(env.ELEVENLABS_VOICE_ID_FEMALE))} male=${mark(present(env.ELEVENLABS_VOICE_ID_MALE))} ka=${mark(present(env.ELEVENLABS_GEORGIAN_VOICE_ID))}`,
      icon: dot(hasElevenLabs, hasElevenLabs ? 'high' : 'unavailable'),
    });

    // 5 · MUSIC — /api/ai/music Auto = Google Lyria 3 alone (hasLyriaProvider: the Google AI transport, LYRIA_ENABLED
    //     not off). No failover: an explicit pick runs THAT engine instead, alone (engineConfigured = the route's gate).
    const lyriaOn = hasLyriaProvider();
    const lyriaWhy = !isEnabledByDefault(env.LYRIA_ENABLED)
      ? 'LYRIA_ENABLED is off'
      : `${googleMissing.join(', ') || 'Google AI transport'} missing`;
    services.push({
      service: 'მუსიკა',
      provider: `Lyria 3 (${lyriaModel()})`,
      available: lyriaOn,
      tier: lyriaOn ? 'high' : 'unavailable',
      note: `${lyriaOn ? 'Auto = Lyria 3 only, no failover (R7)' : `Auto fails — ${lyriaWhy}`} · Udio / ElevenLabs Music / MusicGen removed (Google-only music boundary)`,
      icon: dot(lyriaOn, lyriaOn ? 'high' : 'unavailable'),
    });

    // 6 · FILM SCORE — /api/video/assemble: Lyria 3 (lib/audio/lyriaBed) is the film's only score generator; a miss
    //     ships the film with no music (scoreFallback null). A user-uploaded soundtrack bypasses it. Only what is
    //     verified is asked for: the clip model's ~30 s until Pro is verified, and no sung song until vocals are.
    const proSec = lyriaProMaxSec(env);
    const scoreLength = proSec > LYRIA_CLIP_MAX_SEC ? `up to ${proSec} s on Pro` : `~${LYRIA_CLIP_MAX_SEC} s (clip; Pro not verified)`;
    const vocals = isTruthyFlag(env.MUSIC_LYRIA_VOCALS_VERIFIED) ? 'sung songs on' : 'no sung song until Lyria vocals are verified';
    services.push({
      service: 'მუსიკა (ფილმი)',
      provider: 'Lyria 3 (Vertex)',
      available: lyriaOn,
      tier: lyriaOn ? 'high' : 'unavailable',
      note: lyriaOn
        ? `film score at assemble: ${scoreLength} · ${vocals} · a miss = no music, no fallback (R7); an uploaded soundtrack bypasses it`
        : `${lyriaWhy} — films get no generated score (an uploaded soundtrack still works)`,
      icon: dot(lyriaOn, lyriaOn ? 'high' : 'unavailable'),
    });

    // 7 · BASE IMAGE — app/api/nanobanana/image: the NanoBanana reseller is the route's ONLY engine (miss / open breaker
    //     → refunded 502). Named as what it is: a legacy reseller, not a direct Google call.
    const hasNanoBanana = present(env.NANOBANANA_API_KEY);
    services.push({
      service: 'სურათი (Base)',
      provider: 'NanoBanana (reseller)',
      available: hasNanoBanana,
      tier: hasNanoBanana ? 'high' : 'unavailable',
      note: hasNanoBanana
        ? 'nanobananaapi.ai reseller — only engine, no fallback (R7); legacy vendor, not Google direct'
        : 'NANOBANANA_API_KEY missing — studio images fail (no fallback engine)',
      icon: dot(hasNanoBanana, hasNanoBanana ? 'high' : 'unavailable'),
    });

    // 8 · SUBTITLES — ffmpeg-static + SVG→PNG (resvg). NO libass on Vercel; FiraGO Georgian font bundled.
    const hasFfmpeg = !!ffmpegStatic;
    services.push({
      service: 'სუბტიტრები',
      provider: 'ffmpeg-static + SVG→PNG',
      available: hasFfmpeg,
      tier: hasFfmpeg ? 'high' : 'unavailable',
      note: hasFfmpeg ? 'word-synced burn from ElevenLabs timings, resvg overlay (no libfreetype on Vercel), bundled FiraGO Georgian font' : 'ffmpeg-static binary not resolved',
      icon: dot(hasFfmpeg, hasFfmpeg ? 'high' : 'unavailable'),
    });

    // ── WARNINGS ──────────────────────────────────────────────────────────────
    const unavailable = services.filter((s) => !s.available);
    if (unavailable.length) warnings.push(`${unavailable.length} service(s) unavailable: ${unavailable.map((s) => s.service).join(', ')}`);

    // ── OVERALL ───────────────────────────────────────────────────────────────
    const CRITICAL = new Set(['სურათი (Base)', 'ვიდეო (Clips)', 'ხმა (TTS)', 'მუსიკა']);
    const criticalDown = services.filter((s) => CRITICAL.has(s.service) && !s.available).length;
    const overall: PipelineHealth['overall'] = criticalDown === 0 ? 'healthy' : criticalDown <= 1 ? 'degraded' : 'critical';

    // ── LOG (on-demand; admin page load / API hit) ──────────────────────────────
    const lines = ['── MyAvatar.ge Pipeline Status ──', ...services.map((s) => `${s.icon} ${s.service}: ${s.note}`)];
    if (warnings.length) lines.push('⚠️  ' + warnings.join('  |  '));
    lines.push(`Overall: ${overall === 'healthy' ? '✅ HEALTHY' : overall === 'degraded' ? '⚠️ DEGRADED' : '🔴 CRITICAL'}`);
    console.log('\n' + lines.join('\n') + '\n');

    return { overall, checkedAt: new Date().toISOString(), services, warnings };
  } catch (e) {
    // FAIL-OPEN — never throw; return a minimal snapshot so the admin page still renders.
    return {
      overall: 'critical',
      checkedAt: new Date().toISOString(),
      services: [],
      warnings: [`status agent error: ${(e as Error)?.message || 'unknown'}`],
    };
  }
}
