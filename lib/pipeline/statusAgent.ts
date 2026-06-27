/**
 * lib/pipeline/statusAgent.ts — on-demand pipeline health check.
 *
 * A NAMES-ONLY readiness snapshot of every production service the film/media pipeline
 * depends on, derived purely from env-var presence + the active model/tier env flags
 * (NO network probes → fast, free, no surprise provider spend). Surfaced via
 * GET /api/pipeline/status (admin) and the admin dashboard.
 *
 * STRICTLY fail-open: checkPipelineHealth() NEVER throws — any internal error returns a
 * minimal "critical" snapshot so the admin page always renders. It never returns a
 * secret value, only whether each key is present + which tier/model is active.
 *
 * Reality notes (verified against current code, not stale assumptions):
 *  - Music chain is Udio (primary when UDIO_API_KEY) → ElevenLabs Music → MusicGen
 *    (Replicate) — see app/api/ai/music/route.ts. Udio is NOT retired in code.
 *  - Subtitles burn via ffmpeg-static + SVG→PNG (resvg) — Vercel's Linux ffmpeg-static
 *    has NO libfreetype/libass, so drawtext/subtitles filters are unavailable; Georgian
 *    glyphs come from the bundled FiraGO font. See lib/pipeline/compositing/ffmpeg-overlay.ts.
 *  - Anchor defaults to FLUX 1.1 Pro (high) unless ANCHOR_MODEL=fast/schnell.
 */
import 'server-only';
import ffmpegStatic from 'ffmpeg-static';

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

/**
 * Build the pipeline health snapshot. Pure env inspection (sync under the hood, async
 * signature so latency probes can be added later without a contract change). FAIL-OPEN.
 */
export async function checkPipelineHealth(): Promise<PipelineHealth> {
  try {
    const env = process.env;
    const services: ServiceStatus[] = [];
    const warnings: string[] = [];

    const hasReplicate = !!env.REPLICATE_API_TOKEN;
    const hasElevenLabs = !!env.ELEVENLABS_API_KEY;

    // 1 · ANCHOR IMAGE — FLUX 1.1 Pro (default) vs flux-schnell (ANCHOR_MODEL=fast/schnell)
    const usesPro = !/^(fast|schnell)$/i.test((env.ANCHOR_MODEL || '').trim());
    services.push({
      service: 'სურათი (Anchor)',
      provider: usesPro ? 'FLUX 1.1 Pro' : 'FLUX Schnell',
      available: hasReplicate,
      tier: hasReplicate ? (usesPro ? 'high' : 'medium') : 'unavailable',
      note: !hasReplicate ? 'REPLICATE_API_TOKEN missing' : usesPro ? 'FLUX 1.1 Pro (high quality, fail-open→schnell)' : 'FLUX Schnell (ANCHOR_MODEL=fast)',
      icon: dot(hasReplicate, hasReplicate ? (usesPro ? 'high' : 'medium') : 'unavailable'),
    });

    // 2 · VIDEO CLIPS — Kling i2v (standard default, pro via REPLICATE_VIDEO_MODEL)
    const videoModel = (env.REPLICATE_VIDEO_MODEL || 'kwaivgi/kling-v1.6-standard').trim();
    const klingPro = /pro/i.test(videoModel);
    services.push({
      service: 'ვიდეო (Clips)',
      provider: klingPro ? 'Kling v1.6 Pro' : 'Kling v1.6 Standard',
      available: hasReplicate,
      tier: hasReplicate ? (klingPro ? 'high' : 'medium') : 'unavailable',
      note: !hasReplicate ? 'REPLICATE_API_TOKEN missing' : `${videoModel} via Replicate (i2v)`,
      icon: dot(hasReplicate, hasReplicate ? (klingPro ? 'high' : 'medium') : 'unavailable'),
    });

    // 3 · LIP-SYNC — sync/lipsync-2 (Sync Labs via Replicate, audio-driven) + HeyGen avatar path
    const hasHeygen = !!env.HEYGEN_API_KEY;
    const lipsyncAvail = hasReplicate || hasHeygen;
    services.push({
      service: 'ლიპ-სინქი',
      provider: hasReplicate ? 'sync/lipsync-2 (Replicate)' : hasHeygen ? 'HeyGen' : '—',
      available: lipsyncAvail,
      tier: lipsyncAvail ? 'high' : 'unavailable',
      note: !lipsyncAvail ? 'no REPLICATE_API_TOKEN / HEYGEN_API_KEY' : hasReplicate ? 'sync/lipsync-2 (film) + SadTalker/HeyGen (avatar)' : 'HeyGen talking-photo only',
      icon: dot(lipsyncAvail, lipsyncAvail ? 'high' : 'unavailable'),
    });

    // 4 · TTS VOICE — ElevenLabs Multilingual v2, cloned Georgian female/male voices
    const femaleVoice = env.ELEVENLABS_VOICE_ID_FEMALE || env.ELEVENLABS_VOICE_ID;
    const maleVoice = env.ELEVENLABS_VOICE_ID_MALE;
    const bothVoices = !!femaleVoice && !!maleVoice;
    services.push({
      service: 'ხმა (TTS)',
      provider: 'ElevenLabs Multilingual v2',
      available: hasElevenLabs,
      tier: hasElevenLabs ? (bothVoices ? 'high' : 'medium') : 'unavailable',
      note: !hasElevenLabs ? 'ELEVENLABS_API_KEY missing' : `Georgian voices: female=${femaleVoice ? '✅' : '❌'} male=${maleVoice ? '✅' : '❌'}`,
      icon: dot(hasElevenLabs, hasElevenLabs ? (bothVoices ? 'high' : 'medium') : 'unavailable'),
    });

    // 5 · MUSIC — Udio (primary) → ElevenLabs Music → MusicGen (Replicate). See /api/ai/music.
    const hasUdio = !!env.UDIO_API_KEY;
    const musicAvail = hasUdio || hasElevenLabs || hasReplicate;
    const musicProvider = hasUdio ? 'Udio (primary)' : hasElevenLabs ? 'ElevenLabs Music' : hasReplicate ? 'MusicGen (Replicate)' : '—';
    services.push({
      service: 'მუსიკა',
      provider: musicProvider,
      available: musicAvail,
      tier: musicAvail ? (hasUdio || hasElevenLabs ? 'high' : 'medium') : 'unavailable',
      note: !musicAvail ? 'no UDIO_API_KEY / ELEVENLABS_API_KEY / REPLICATE_API_TOKEN' : `chain: Udio${hasUdio ? '✅' : '·'} → EL Music${hasElevenLabs ? '✅' : '·'} → MusicGen${hasReplicate ? '✅' : '·'}`,
      icon: dot(musicAvail, musicAvail ? (hasUdio || hasElevenLabs ? 'high' : 'medium') : 'unavailable'),
    });

    // 6 · BASE IMAGE — NanoBanana (storyboard frames / image mode)
    const hasNanoBanana = !!env.NANOBANANA_API_KEY;
    services.push({
      service: 'სურათი (Base)',
      provider: 'NanoBanana',
      available: hasNanoBanana || hasReplicate,
      tier: hasNanoBanana ? 'high' : hasReplicate ? 'medium' : 'unavailable',
      note: hasNanoBanana ? 'NanoBanana generation (flux-schnell fallback via Replicate)' : hasReplicate ? 'NanoBanana key missing — flux-schnell fallback only' : 'no NANOBANANA_API_KEY / REPLICATE_API_TOKEN',
      icon: dot(hasNanoBanana || hasReplicate, hasNanoBanana ? 'high' : hasReplicate ? 'medium' : 'unavailable'),
    });

    // 7 · SUBTITLES — ffmpeg-static + SVG→PNG (resvg). NO libass on Vercel; FiraGO Georgian font bundled.
    const hasFfmpeg = !!ffmpegStatic;
    services.push({
      service: 'სუბტიტრები',
      provider: 'ffmpeg-static + SVG→PNG',
      available: hasFfmpeg,
      tier: hasFfmpeg ? 'high' : 'unavailable',
      note: hasFfmpeg ? 'resvg overlay (no libfreetype on Vercel), bundled FiraGO Georgian font' : 'ffmpeg-static binary not resolved',
      icon: dot(hasFfmpeg, hasFfmpeg ? 'high' : 'unavailable'),
    });

    // 8 · AUTO-ANCHOR — text-only briefs get a generated anchor → Kling i2v (opt-in)
    const autoAnchor = env.AUTO_ANCHOR_FRAME === '1';
    services.push({
      service: 'Auto-Anchor',
      provider: 'FLUX 1.1 Pro → Schnell',
      available: autoAnchor && hasReplicate,
      tier: autoAnchor && hasReplicate ? 'high' : 'low',
      note: !hasReplicate ? 'Replicate not configured' : autoAnchor ? 'Enabled — text-only briefs seed Kling (anchor→i2v)' : 'AUTO_ANCHOR_FRAME not set — text briefs fall to LTX',
      icon: autoAnchor && hasReplicate ? '🟢' : '🟠',
    });

    // ── WARNINGS ──────────────────────────────────────────────────────────────
    const fastImage = env.FAST_IMAGE_MODEL === 'true' || env.FAST_IMAGE_MODEL === '1';
    if (!fastImage) warnings.push('FAST_IMAGE_MODEL not set — storyboard frames use NanoBanana (slower). Set "true" for flux-schnell.');
    if (!autoAnchor) warnings.push('AUTO_ANCHOR_FRAME=1 not set — text-only briefs fall to LTX instead of Kling.');
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
