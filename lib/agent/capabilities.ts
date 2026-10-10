/**
 * lib/agent/capabilities.ts — one typed record per thing Agent G can be asked to do: the 22 catalog services
 * (lib/catalog/services) and the Agent G media operations that are not catalog cards. Pure data, safe on the client.
 *
 * WHAT A RECORD SAYS, AND WHERE EACH FIELD COMES FROM (nothing here is aspirational; a test pins it to the code):
 *   routes      the API routes that run it today (each file exists: capabilities.test.ts).
 *   timeoutSec  the longest `maxDuration` among those routes (read from the route files by the test).
 *   pricing     the catalog's quote key and how the route charges today: `charged` (reserve/debit with a refund on a miss),
 *               `free` (the owner's word, or no paid call), `not-charged-yet` (spends on a provider and charges nothing:
 *               the owner's open pricing-table decision, service audit §6 gap 2).
 *   approval    what stands between the words and the spend: Agent G's card with the price (`agent-card`), the film's
 *               storyboard (`storyboard`), Agent G's plan card with Start (`plan-start`), the remix's price card for a
 *               charged op (`remix-card`), the panel's own Generate button with the price on it (`panel-button`), or none
 *               (free chat).
 *   retry       what happens on a miss: `refund-on-miss` (the charge is returned; the user may try again), `lease-retry`
 *               (a lease worker retries once, then refunds), `none`.
 *   cancel      how a running job is stopped: the Task API (`task-api`, POST /api/tasks cancel), the request's own abort
 *               (`client-abort`), or not at all.
 *   label       the proof label from the 22-service trace (docs/handoffs/2026-10-09-service-audit.md §6), never higher.
 *
 * This does not route anything: lib/agent/intent decides which capability a message asks for, and the existing doors run
 * it. It is the one place a door, the Live tools (PART 4) and the certification read what a capability needs and costs.
 */
import type { QuoteTool } from '@/lib/credits/quote';
import type { ConfirmedAction } from '@/lib/agent/tools/registry';
import type { CapabilityId } from './contracts';

export type ProofLabel = 'PROVEN' | 'BUILT_NOT_PROVEN' | 'PARTIAL' | 'MISSING' | 'BLOCKED_OWNER' | 'DISABLED' | 'DEPRECATED';

export interface Capability {
  id: CapabilityId;
  /** The catalog service it is; null for an Agent G operation that has no catalog card. */
  serviceId: string | null;
  does: string;
  routes: readonly string[];
  /** What runs it today (service audit §6, with MEDIA_GOOGLE_ONLY off unless said). */
  engine: string;
  pricing: { key: QuoteTool | null; charge: 'charged' | 'free' | 'not-charged-yet' };
  approval: 'agent-card' | 'storyboard' | 'plan-start' | 'remix-card' | 'panel-button' | 'none';
  timeoutSec: number;
  retry: 'refund-on-miss' | 'lease-retry' | 'none';
  /** What makes a second press not a second job. */
  idempotency: string;
  cancel: 'task-api' | 'client-abort' | 'none';
  /** The check a result passes before it is delivered, when there is one. */
  qc: string | null;
  artifact: 'video' | 'image' | 'audio' | 'file' | 'text' | 'model3d' | 'none';
  library: 'filed' | 'chat-history' | 'device-only' | 'none';
  label: ProofLabel;
  /** The registry tool a model may call to QUOTE it (never to run it), and the confirmed action its plan leads to. */
  liveTool?: { name: string; confirms: ConfirmedAction };
  /** Behind a flag, and where it is open. */
  flag?: string;
}

const c = (x: Capability): Capability => x;

export const CAPABILITIES: Readonly<Record<CapabilityId, Capability>> = {
  'video.generate': c({
    id: 'video.generate', serviceId: 'video.generate', does: 'A film from an idea: storyboard, Veo clips, voice, music, assembled',
    routes: ['/api/film/storyboard', '/api/chat/orchestrate', '/api/video/assemble'],
    engine: 'Veo + Gemini + ElevenLabs; a dialogue scene adds a HeyGen talking head when HeyGen is configured',
    pricing: { key: 'video', charge: 'charged' }, approval: 'storyboard', timeoutSec: 600, retry: 'refund-on-miss',
    idempotency: 'one film per storyboard approval; clips refunded one by one', cancel: 'client-abort',
    qc: 'V1–V6 invariants (lib/veo)', artifact: 'video', library: 'filed', label: 'BUILT_NOT_PROVEN',
  }),
  'video.music-video': c({
    id: 'video.music-video', serviceId: 'video.music-video', does: 'A music video for the user\'s song',
    routes: ['/api/film/storyboard', '/api/chat/orchestrate', '/api/video/assemble'],
    engine: 'as video.generate, plus HeyGen singer close-ups when HeyGen is configured',
    pricing: { key: 'video', charge: 'charged' }, approval: 'storyboard', timeoutSec: 600, retry: 'refund-on-miss',
    idempotency: 'one film per storyboard approval', cancel: 'client-abort', qc: 'V1–V6 invariants (lib/veo)',
    artifact: 'video', library: 'filed', label: 'BUILT_NOT_PROVEN',
  }),
  'video.product-ad': c({
    id: 'video.product-ad', serviceId: 'video.product-ad', does: 'An ad reel from a product photo',
    routes: ['/api/video/remix'], engine: 'Veo, then a Ken Burns still; Kling only with VIDEO_GOOGLE_ONLY=0',
    pricing: { key: 'product', charge: 'charged' }, approval: 'panel-button', timeoutSec: 600, retry: 'refund-on-miss',
    idempotency: 'signed intent (op, media, aspect) per charge', cancel: 'client-abort', qc: null, artifact: 'video',
    library: 'filed', label: 'BUILT_NOT_PROVEN',
  }),
  'video.character-swap': c({
    id: 'video.character-swap', serviceId: 'video.character-swap', does: 'Another face or character in a video',
    routes: ['/api/video/remix'], engine: 'roop on Replicate; MEDIA_GOOGLE_ONLY refuses it',
    pricing: { key: 'swap', charge: 'charged' }, approval: 'panel-button', timeoutSec: 600, retry: 'refund-on-miss',
    idempotency: 'signed intent per charge', cancel: 'client-abort', qc: null, artifact: 'video', library: 'filed',
    label: 'BLOCKED_OWNER',
  }),
  'video.motion': c({
    id: 'video.motion', serviceId: 'video.motion', does: 'A photo moves the way the user describes',
    routes: ['/api/motion-control', '/api/motion-control/status'], engine: 'Kling image-to-video on Replicate; MEDIA_GOOGLE_ONLY refuses it',
    pricing: { key: 'motion', charge: 'charged' }, approval: 'panel-button', timeoutSec: 300, retry: 'refund-on-miss',
    idempotency: 'one prediction per press', cancel: 'none', qc: null, artifact: 'video', library: 'filed', label: 'BLOCKED_OWNER',
  }),
  'video.vfx': c({
    id: 'video.vfx', serviceId: 'video.vfx', does: 'One-tap VFX effects for a photo',
    routes: ['/api/genjutsu/generate', '/api/genjutsu/status'], engine: 'Veo scene',
    pricing: { key: 'vfx', charge: 'charged' }, approval: 'panel-button', timeoutSec: 120, retry: 'refund-on-miss',
    idempotency: 'one generation per press', cancel: 'none', qc: null, artifact: 'video', library: 'filed',
    label: 'BUILT_NOT_PROVEN',
  }),
  'video.remix': c({
    id: 'video.remix', serviceId: 'video.remix', does: 'Edit a video the user has: trim, captions, colour, speed, music, voice, style',
    routes: ['/api/video/remix'],
    engine: 'trim, captions, colour, speed, stabilise, music, voiceover: ffmpeg + ElevenLabs; restyle, background, character, redub: NanoBanana / Kling / roop / sync',
    pricing: { key: 'remix', charge: 'charged' }, approval: 'remix-card', timeoutSec: 600, retry: 'refund-on-miss',
    idempotency: 'signed intent per charge; a free op runs once per send', cancel: 'client-abort', qc: null, artifact: 'video',
    library: 'filed', label: 'BLOCKED_OWNER',
  }),
  'video.editing': c({
    id: 'video.editing', serviceId: 'video.editing', does: 'One film from the user\'s clips: trim, join, music',
    routes: ['/api/v2/montage/render'], engine: 'ffmpeg in the app', pricing: { key: null, charge: 'free' },
    approval: 'panel-button', timeoutSec: 600, retry: 'none', idempotency: 'one render per press', cancel: 'none', qc: null,
    artifact: 'video', library: 'filed', label: 'BUILT_NOT_PROVEN',
  }),
  'image.generate': c({
    id: 'image.generate', serviceId: 'image.generate', does: 'Create or edit a picture',
    routes: ['/api/nanobanana/image', '/api/ai/edit-photo', '/api/ai/upscale'],
    engine: 'NanoBananaAI; chat images FLUX, a miss moves only to Google image; Edit and Upscale on Replicate',
    pricing: { key: 'image', charge: 'charged' }, approval: 'agent-card', timeoutSec: 300, retry: 'refund-on-miss',
    idempotency: 'one job per tile (the client queue)', cancel: 'client-abort', qc: null, artifact: 'image', library: 'filed',
    label: 'BLOCKED_OWNER',
  }),
  'image.photoshoot': c({
    id: 'image.photoshoot', serviceId: 'image.photoshoot', does: 'A studio photoshoot from the user\'s photos',
    routes: ['/api/nanobanana/image'], engine: 'NanoBananaAI', pricing: { key: 'photoshoot', charge: 'charged' },
    approval: 'panel-button', timeoutSec: 300, retry: 'refund-on-miss', idempotency: 'one job per shot', cancel: 'client-abort',
    qc: null, artifact: 'image', library: 'filed', label: 'BLOCKED_OWNER',
  }),
  'image.interior': c({
    id: 'image.interior', serviceId: 'image.interior', does: 'Redesign a room from a photo, with a 3D plan',
    routes: ['/api/nanobanana/image', '/api/orchestrator/interior/produce'], engine: 'NanoBananaAI renders; the 3D plan is Gemini',
    pricing: { key: 'interior', charge: 'charged' }, approval: 'panel-button', timeoutSec: 300, retry: 'refund-on-miss',
    idempotency: 'plan reserved once, refunded on a miss', cancel: 'client-abort', qc: null, artifact: 'image', library: 'filed',
    label: 'BLOCKED_OWNER',
  }),
  'image.culling': c({
    id: 'image.culling', serviceId: 'image.culling', does: 'Pick the best shots; photos never leave the device',
    routes: [], engine: 'on-device worker', pricing: { key: null, charge: 'free' }, approval: 'none', timeoutSec: 0,
    retry: 'none', idempotency: 'local', cancel: 'none', qc: null, artifact: 'image', library: 'device-only',
    label: 'BUILT_NOT_PROVEN',
  }),
  'avatar.talking': c({
    id: 'avatar.talking', serviceId: 'avatar.talking', does: 'A photo speaks the user\'s script or voice',
    routes: ['/api/heygen/presenter', '/api/video/lipsync'],
    engine: 'ElevenLabs voice + HeyGen, or SadTalker when HeyGen is off; one engine per job',
    pricing: { key: 'avatar', charge: 'charged' }, approval: 'agent-card', timeoutSec: 300, retry: 'refund-on-miss',
    idempotency: 'one job per confirm', cancel: 'client-abort', qc: null, artifact: 'video', library: 'filed', label: 'BLOCKED_OWNER',
  }),
  'music.generate': c({
    id: 'music.generate', serviceId: 'music.generate', does: 'A track, a song or a soundtrack',
    routes: ['/api/ai/music'], engine: 'Lyria (Auto); ElevenLabs Music for a Georgian song; cover and trained voice on Replicate',
    pricing: { key: 'music', charge: 'charged' }, approval: 'agent-card', timeoutSec: 300, retry: 'refund-on-miss',
    idempotency: 'one job per confirm (the client queue)', cancel: 'client-abort', qc: null, artifact: 'audio', library: 'filed',
    label: 'BLOCKED_OWNER',
  }),
  'music.remix': c({
    id: 'music.remix', serviceId: 'music.remix', does: 'A variation of a track the user has (not built)',
    routes: [], engine: 'none', pricing: { key: null, charge: 'free' }, approval: 'none', timeoutSec: 0, retry: 'none',
    idempotency: 'none', cancel: 'none', qc: null, artifact: 'none', library: 'none', label: 'MISSING',
  }),
  'voice.dubbing': c({
    id: 'voice.dubbing', serviceId: 'voice.dubbing', does: 'The user\'s video in another language',
    routes: ['/api/v2/dubbing/start'], engine: 'ElevenLabs Scribe + TTS, Gemini translation; Demucs on Replicate for the background',
    pricing: { key: null, charge: 'not-charged-yet' }, approval: 'panel-button', timeoutSec: 600, retry: 'none',
    idempotency: 'job id reuse is refused', cancel: 'none', qc: null, artifact: 'video', library: 'filed', label: 'PARTIAL',
  }),
  'text.write': c({
    id: 'text.write', serviceId: 'text.write', does: 'Articles, scripts, ad copy, posts, translation',
    routes: ['/api/chat/gemini'], engine: 'Gemini', pricing: { key: 'chat', charge: 'free' }, approval: 'none', timeoutSec: 300,
    retry: 'none', idempotency: 'a message is one turn', cancel: 'client-abort', qc: null, artifact: 'text',
    library: 'chat-history', label: 'BUILT_NOT_PROVEN',
  }),
  'design.presentation': c({
    id: 'design.presentation', serviceId: 'design.presentation', does: 'Slides from a topic',
    routes: ['/api/v2/presentation/build'], engine: 'Gemini outline + Imagen', pricing: { key: null, charge: 'not-charged-yet' },
    approval: 'panel-button', timeoutSec: 300, retry: 'none', idempotency: 'one deck per press', cancel: 'none', qc: null,
    artifact: 'file', library: 'filed', label: 'PARTIAL',
  }),
  'design.model3d': c({
    id: 'design.model3d', serviceId: 'design.model3d', does: 'A 3D model from text or a photo',
    routes: ['/api/v2/model3d/create', '/api/v2/model3d/status'], engine: 'TRELLIS on Replicate; MEDIA_GOOGLE_ONLY refuses it',
    pricing: { key: 'model3d', charge: 'charged' }, approval: 'panel-button', timeoutSec: 300, retry: 'refund-on-miss',
    idempotency: 'reserved once, refunded on a miss', cancel: 'none', qc: null, artifact: 'model3d', library: 'filed',
    label: 'BLOCKED_OWNER',
  }),
  'code.assistant': c({
    id: 'code.assistant', serviceId: 'code.assistant', does: 'Write, explain and debug code in the chat',
    routes: ['/api/chat/gemini'], engine: 'Gemini; no sandbox', pricing: { key: 'chat', charge: 'free' }, approval: 'none',
    timeoutSec: 300, retry: 'none', idempotency: 'a message is one turn', cancel: 'client-abort', qc: null, artifact: 'text',
    library: 'chat-history', label: 'BUILT_NOT_PROVEN',
  }),
  'code.terminal': c({
    id: 'code.terminal', serviceId: 'code.terminal', does: 'An isolated sandbox terminal (not built)',
    routes: [], engine: 'none', pricing: { key: null, charge: 'free' }, approval: 'none', timeoutSec: 0, retry: 'none',
    idempotency: 'none', cancel: 'none', qc: null, artifact: 'none', library: 'none', label: 'MISSING',
  }),
  'research.web-search': c({
    id: 'research.web-search', serviceId: 'research.web-search', does: 'Search the web and show the sources',
    routes: ['/api/chat/gemini'], engine: 'Gemini Google Search grounding', pricing: { key: 'chat', charge: 'free' },
    approval: 'none', timeoutSec: 300, retry: 'none', idempotency: 'a message is one turn', cancel: 'client-abort', qc: null,
    artifact: 'text', library: 'chat-history', label: 'BUILT_NOT_PROVEN',
  }),
  'agent.montage': c({
    id: 'agent.montage', serviceId: null, does: 'Cut the attached clips to the attached track, on the beat',
    routes: ['/api/agent/media/montage', '/api/tasks'], engine: 'ffmpeg in a lease worker (lib/agent/media/montageWorker)',
    pricing: { key: null, charge: 'free' }, approval: 'plan-start', timeoutSec: 600, retry: 'lease-retry',
    idempotency: 'one job per signed quote (jobId in the token)', cancel: 'task-api',
    qc: 'picture + sound streams, browser codecs, length within 1 s or 3 % of the plan', artifact: 'video', library: 'filed',
    label: 'BUILT_NOT_PROVEN', liveTool: { name: 'quote_montage_to_music', confirms: 'montage_run' }, flag: 'AGENT_G_MEDIA_EXEC',
  }),
  'agent.audio-extract': c({
    id: 'agent.audio-extract', serviceId: null, does: 'Take the sound out of the user\'s file or a direct media link, as an MP3',
    routes: ['/api/agent/media/audio', '/api/tasks'], engine: 'ffmpeg in a lease worker (lib/agent/media/audioWorker)',
    pricing: { key: null, charge: 'free' }, approval: 'plan-start', timeoutSec: 600, retry: 'lease-retry',
    idempotency: 'one job per signed quote (jobId in the token)', cancel: 'task-api',
    qc: 'an audio stream, MP3, length matches the source', artifact: 'audio', library: 'filed', label: 'BUILT_NOT_PROVEN',
    liveTool: { name: 'quote_audio_from_link', confirms: 'audio_extract_run' }, flag: 'AGENT_G_MEDIA_EXEC',
  }),
  'media.edit': c({
    id: 'media.edit', serviceId: null,
    does: 'Edit one of the user\'s videos (or Agent G\'s own last result): trim, speed, frame shape, colour, fades, volume or mute, a caption, or a still as a thumbnail',
    routes: ['/api/agent/media/edit', '/api/tasks'], engine: 'ffmpeg in a lease worker (lib/agent/media/editWorker)',
    pricing: { key: null, charge: 'free' }, approval: 'plan-start', timeoutSec: 600, retry: 'lease-retry',
    idempotency: 'one job per signed quote (jobId in the token)', cancel: 'task-api',
    qc: 'the planned frame and codecs, sound exactly when planned, length within 0.5 s or 3 % of the plan', artifact: 'video', library: 'filed',
    label: 'BUILT_NOT_PROVEN', liveTool: { name: 'quote_media_edit', confirms: 'media_edit_run' }, flag: 'AGENT_G_MEDIA_EXEC',
  }),
  'media.analyze': c({
    id: 'media.analyze', serviceId: null,
    does: 'Read one of the user\'s files (video, sound, PDF, picture) or a public YouTube video and say what is in it: scenes, moments, what is said, an answer to a question. It cuts nothing: ffmpeg still decides every cut',
    routes: ['/api/agent/media/analyze'], engine: 'Gemini, the file by reference, through the one transport (lib/agent/media/analyzeExec)',
    pricing: { key: 'chat', charge: 'free' }, approval: 'none', timeoutSec: 300, retry: 'none',
    idempotency: 'read-only: a second ask reads again and writes nothing', cancel: 'client-abort',
    qc: 'every time inside the file\'s probed length, lists bounded (analyzeSpec parseAnalysis)', artifact: 'text',
    library: 'chat-history', label: 'BUILT_NOT_PROVEN', flag: 'AGENT_G_FILE_ANALYSIS',
  }),
};

export const capabilityOf = (id: CapabilityId): Capability => CAPABILITIES[id];

/** Can a door run this capability today (it has a route and is not MISSING)? */
export const capabilityRuns = (id: CapabilityId): boolean => {
  const cap = CAPABILITIES[id];
  return cap.routes.length > 0 && cap.label !== 'MISSING' && cap.label !== 'DISABLED' && cap.label !== 'DEPRECATED';
};
