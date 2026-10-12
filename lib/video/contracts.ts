/**
 * lib/video/contracts.ts — the video features' contracts in ONE place (Video Core v1.0 §2.3 · §3 · GG 2026-10-12 item 3).
 *
 * The Video Studio is several lanes today — the film (and its single-clip and music-video shapes), the long-form order,
 * the storyboard, Agent G's montage and edits, the remix ops (and the motion / swap / VFX tools that ride on them) — each
 * with its own entry, routes, approval, QC and billing. This registry names, per lane, which catalogue tile, studio tool
 * and Agent G capability it is, where it enters, which routes and modules carry its contract, how its length is decided,
 * how it is approved, how it is checked, how it is charged, which refusals it can answer with, and what is PROVEN about it.
 * `VIDEO_REFUSALS` is the one vocabulary of those refusals: code → lanes → the file that emits it → HTTP → meaning → what
 * happens to the charge.
 *
 * Pure data and types; browser-safe (type-only imports). Pinned by contracts.test: every id here is a real catalogue /
 * tool / capability id, every file named here exists, and every refusal code is really emitted by the file named.
 * The plan that folds these lanes into one Video Studio is docs/handoffs/video-core/consolidation-plan.md; nothing here
 * changes another studio.
 */
import type { ServiceId } from '@/lib/services/serviceCatalogue';
import type { CapabilityId } from '@/lib/agent/contracts';
import type { ToolId } from '@/lib/studio/tools';

/** The lanes the Video Studio is made of today. */
export type VideoLaneId =
  | 'film' | 'single-clip' | 'music-video' | 'product-ad' | 'longform' | 'storyboard'
  | 'montage' | 'editing' | 'remix' | 'motion' | 'swap' | 'vfx';

/** Video Core v1.0 §2.2 statuses. */
export type ContractStatus = 'PROVEN' | 'EXECUTABLE' | 'PREPARE_ONLY' | 'NAVIGATION_ONLY' | 'DISABLED' | 'UNSUPPORTED' | 'MISSING' | 'UNVERIFIED';

export type EvidenceTier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'NOT RUN';

export type VideoRefusalCode =
  | 'final_duration_invalid' | 'qc_rejected' | 'revision_mismatch' | 'media_not_yours' | 'insufficient_credits'
  | 'assembly_failed' | 'assemble_failed' | 'longform_closed' | 'quote_expired' | 'quote_changed' | 'qc_failed'
  | 'music_too_short' | 'clip_too_short' | 'target_too_short' | 'duplicate_request';

export interface VideoLaneContract {
  id: VideoLaneId;
  /** The catalogue tile (lib/services/serviceCatalogue) the lane is sold under; null when it has no tile of its own. */
  service: ServiceId | null;
  /** The studio tools (lib/studio/tools) that open it. */
  tools: readonly ToolId[];
  /** Agent G's capability ids (lib/agent/contracts) that route to it. */
  capabilities: readonly CapabilityId[];
  /** How a user reaches it today. */
  entry: string;
  /** Server routes (repo paths; a directory names a route family). */
  routes: readonly string[];
  /** The modules that ARE the contract (repo paths). */
  modules: readonly string[];
  /** How the delivered length is decided. */
  duration: 'contract' | 'native' | 'quote' | 'none';
  /** What the user approves before anything is charged. */
  approval: 'storyboard-revision' | 'quote-token' | 'panel' | 'none';
  /** How the result is checked before delivery. */
  qc: 'frame-exact' | 'av-sync' | 'none';
  /** How it is charged. */
  billing: 'single-charge-saga' | 'quote-then-job' | 'per-op' | 'per-act' | 'none';
  refusals: readonly VideoRefusalCode[];
  status: ContractStatus;
  tier: EvidenceTier;
  note: string;
}

const FILM_ROUTES = ['app/api/film/storyboard/route.ts', 'app/api/chat/orchestrate/route.ts', 'app/api/video/assemble/route.ts', 'app/api/video/capabilities/route.ts'] as const;
const FILM_MODULES = [
  'lib/video/durationWords.ts', 'lib/video/durationContract.ts', 'lib/video/storyboard/revision.ts',
  'lib/orchestrator/ffmpeg-assembly.ts', 'lib/orchestrator/masterQa.ts', 'lib/video/frameCount.ts', 'lib/video/finalCut.ts',
] as const;
const FILM_REFUSALS = ['longform_closed', 'revision_mismatch', 'final_duration_invalid', 'qc_rejected', 'media_not_yours', 'insufficient_credits', 'assembly_failed'] as const;

export const VIDEO_LANES: readonly VideoLaneContract[] = [
  {
    id: 'film', service: 'video', tools: ['video'], capabilities: ['video.generate'],
    entry: 'chat (video.generate) or the Video tool (#film) → storyboard → Generate → scene clips → assemble',
    routes: FILM_ROUTES, modules: FILM_MODULES,
    duration: 'contract', approval: 'storyboard-revision', qc: 'frame-exact', billing: 'single-charge-saga',
    refusals: FILM_REFUSALS, status: 'PROVEN', tier: 'T3',
    note: 'The assembler, the final cut, the frame-exact QC and the QC gate are measured on the real ffmpeg; the Veo clip leg runs mocked (B1: no paid call).',
  },
  {
    id: 'single-clip', service: 'video', tools: ['video'], capabilities: ['video.generate'],
    entry: 'the film at one scene (a 4 / 6 / 8 s order): no stitch, the clip is cut to the final length',
    routes: ['app/api/chat/orchestrate/route.ts', 'app/api/video/assemble/route.ts'], modules: ['lib/video/durationContract.ts', 'lib/video/finalCut.ts', 'lib/video/frameCount.ts'],
    duration: 'contract', approval: 'storyboard-revision', qc: 'frame-exact', billing: 'single-charge-saga',
    refusals: ['revision_mismatch', 'final_duration_invalid', 'qc_rejected', 'media_not_yours', 'insufficient_credits', 'assemble_failed'], status: 'PROVEN', tier: 'T3',
    note: 'cutMasterToLength counts its decoded frames before hosting (150 for 5 s) and throws FinalCutRejected on a miss (the route answers 502 qc_rejected after rolling the reservation back); a clip whose final IS its native length is left as the provider made it (24 fps) — a known PARTIAL against the 30 fps grid.',
  },
  {
    id: 'music-video', service: 'video', tools: ['video'], capabilities: ['video.music-video'],
    entry: 'chat (video.music-video) or the Video tool in music-video mode: the user’s track (or a sung ElevenLabs song) as the bed, 9:16',
    routes: FILM_ROUTES, modules: [...FILM_MODULES, 'lib/agent/params.ts'],
    duration: 'contract', approval: 'storyboard-revision', qc: 'frame-exact', billing: 'single-charge-saga',
    refusals: FILM_REFUSALS, status: 'PROVEN', tier: 'T3',
    note: 'Same lane as the film with the song-master mix; the music source offset is kept exactly (lib/agent/params mineMusicStart).',
  },
  {
    id: 'product-ad', service: null, tools: ['product'], capabilities: ['video.product-ad'],
    entry: 'the Product tool: a product photo → an i2v clip (remix step) → assemble with the ad’s single billing token',
    routes: ['app/api/video/remix/route.ts', 'app/api/video/assemble/route.ts'], modules: ['lib/video/productAdCharge.ts', 'lib/video/finalCut.ts'],
    duration: 'native', approval: 'panel', qc: 'none', billing: 'single-charge-saga',
    refusals: ['duplicate_request', 'media_not_yours', 'insufficient_credits'], status: 'UNVERIFIED', tier: 'T1',
    note: 'The i2v leg is a non-Google provider (B6, not changed here); the assemble leg waives its charge on the ad’s billingToken.',
  },
  {
    id: 'longform', service: 'video', tools: ['video'], capabilities: ['video.generate'],
    entry: 'a film above the 96 s chat ceiling (104 … 240 s): refused by name today (longform_closed); the order route exists',
    routes: ['app/api/video/longform/route.ts', 'app/api/video/capabilities/route.ts'], modules: ['lib/video/longform', 'lib/video/createPanel.ts', 'lib/video/durationContract.ts'],
    duration: 'contract', approval: 'panel', qc: 'none', billing: 'per-act',
    refusals: ['longform_closed', 'insufficient_credits'], status: 'DISABLED', tier: 'T1',
    note: 'LONGFORM_ORDER_WIRED = false is the one switch (B4); exact 240 s = 7200 frames is NOT RUN until B1/B4.',
  },
  {
    id: 'storyboard', service: 'video', tools: ['video'], capabilities: ['video.generate', 'video.music-video'],
    entry: 'planned before every film: scenes, frames, scripts; edited on the board; approved as a numbered revision',
    routes: ['app/api/film/storyboard/route.ts', 'app/api/chat/orchestrate/route.ts', 'app/api/video/director/route.ts'], modules: ['lib/video/storyboard/revision.ts'],
    duration: 'contract', approval: 'storyboard-revision', qc: 'none', billing: 'none',
    refusals: ['revision_mismatch'], status: 'EXECUTABLE', tier: 'T1',
    note: 'Revision + fingerprint + approval at code level (snapshot per change, approval at the tap, server check before dispatch); the storyboard_revisions table stays a proposal (B3); the director run path carries no approval yet.',
  },
  {
    id: 'montage', service: 'montage', tools: ['montage'], capabilities: ['video.editing'],
    entry: 'chat with clips + a track (Agent G quote → Start), or the Montage tool (/montage)',
    routes: ['app/api/agent/media/montage', 'app/api/v2/montage'], modules: ['lib/agent/media/montageExec.ts', 'lib/agent/media/montageWorker.ts', 'lib/agent/media/montageAsk.ts', 'lib/agent/media/montageManifest.ts', 'lib/agent/media/sourceSelect.ts', 'lib/services/montage/beatPlan.ts', 'lib/video/surgicalOps.ts'],
    duration: 'quote', approval: 'quote-token', qc: 'av-sync', billing: 'quote-then-job',
    refusals: ['quote_expired', 'quote_changed', 'qc_failed', 'music_too_short', 'clip_too_short', 'target_too_short', 'media_not_yours', 'insufficient_credits'], status: 'PROVEN', tier: 'T3',
    note: 'Exact round(len×30) frames per segment and master; sound ends with the picture; a failed QC is refused and refunded once. Gaps: add clips to a delivered montage, replace music in place, silent export, music timeline start ≠ 0 (AC-23).',
  },
  {
    id: 'editing', service: 'montage', tools: ['montage'], capabilities: ['video.editing'],
    entry: 'chat on a delivered artifact (“add a caption”, “blur that”): Agent G quote → Start; the parent is kept, the edit is a new artifact',
    routes: ['app/api/agent/media/montage'], modules: ['lib/agent/media/editExec.ts', 'lib/agent/media/editWorker.ts', 'lib/agent/media/editLive.ts', 'lib/agent/media/layerRender.ts'],
    duration: 'native', approval: 'quote-token', qc: 'av-sync', billing: 'quote-then-job',
    refusals: ['quote_expired', 'quote_changed', 'qc_failed', 'media_not_yours', 'insufficient_credits'], status: 'PROVEN', tier: 'T3',
    note: 'Media Studio v2.0/v2.1 lane (PR #57), kept as is in this task.',
  },
  {
    id: 'remix', service: 'remix', tools: ['remix'], capabilities: ['video.remix'],
    entry: 'the Remix tool (#omni, shared with Music) or chat on an attached video (video.remix): one route, one `op`',
    routes: ['app/api/video/remix/route.ts', 'app/api/video/remix-intent/route.ts'], modules: ['lib/video/remixOps.ts', 'lib/video/remixCharge.ts', 'lib/video/remixDelivery.ts'],
    duration: 'native', approval: 'panel', qc: 'none', billing: 'per-op',
    refusals: ['duplicate_request', 'insufficient_credits'], status: 'UNVERIFIED', tier: 'T1',
    note: 'ffmpeg ops are local; several ops call non-Google providers (B6). No frame-exact QC on its outputs yet.',
  },
  {
    id: 'motion', service: null, tools: ['motion'], capabilities: ['video.motion'],
    entry: 'the Motion tool: a photo moves as described (an i2v op on the remix route)',
    routes: ['app/api/video/remix/route.ts'], modules: ['lib/video/remixOps.ts'],
    duration: 'native', approval: 'panel', qc: 'none', billing: 'per-op',
    refusals: ['duplicate_request', 'insufficient_credits'], status: 'UNVERIFIED', tier: 'NOT RUN',
    note: 'Provider policy B6; not changed here.',
  },
  {
    id: 'swap', service: null, tools: ['swap'], capabilities: ['video.character-swap'],
    entry: 'the Swap tool: another face / character in a video (the remix route’s `character` op)',
    routes: ['app/api/video/remix/route.ts'], modules: ['lib/video/remixOps.ts'],
    duration: 'native', approval: 'panel', qc: 'none', billing: 'per-op',
    refusals: ['duplicate_request', 'insufficient_credits'], status: 'UNVERIFIED', tier: 'NOT RUN',
    note: 'Provider policy B6; not changed here.',
  },
  {
    id: 'vfx', service: null, tools: ['vfx'], capabilities: ['video.vfx'],
    entry: 'the VFX tool: one-tap effects (remix route ops)',
    routes: ['app/api/video/remix/route.ts'], modules: ['lib/video/remixOps.ts'],
    duration: 'native', approval: 'panel', qc: 'none', billing: 'per-op',
    refusals: ['duplicate_request', 'insufficient_credits'], status: 'UNVERIFIED', tier: 'NOT RUN',
    note: 'Provider policy B6; not changed here.',
  },
];

export interface VideoRefusal {
  code: VideoRefusalCode;
  lanes: readonly VideoLaneId[];
  /** The file that emits the code (repo path). */
  where: string;
  /** HTTP status when a route answers with it; null when it is said in the studio before any request. */
  http: number | null;
  means: string;
  charge: 'before any charge' | 'refunded once' | 'no second charge' | 'not applicable';
}

/** Every refusal a video lane answers with, in one vocabulary. */
export const VIDEO_REFUSALS: readonly VideoRefusal[] = [
  { code: 'longform_closed', lanes: ['film', 'music-video', 'longform'], where: 'lib/video/durationContract.ts', http: null, means: 'the length asked needs the long-form pipeline, which is closed by name (LONGFORM_ORDER_WIRED)', charge: 'before any charge' },
  { code: 'revision_mismatch', lanes: ['film', 'single-clip', 'music-video', 'storyboard'], where: 'app/api/chat/orchestrate/route.ts', http: 400, means: 'the render is not the approved storyboard revision (board edited after approval, or frames / scripts / grid not the board’s)', charge: 'before any charge' },
  { code: 'final_duration_invalid', lanes: ['film', 'single-clip', 'music-video'], where: 'app/api/video/assemble/route.ts', http: 400, means: 'the final length cannot be cut from the clips handed over (longer than the stitch, off the frame grid, …)', charge: 'before any charge' },
  { code: 'media_not_yours', lanes: ['film', 'single-clip', 'music-video', 'product-ad', 'montage', 'editing'], where: 'app/api/video/assemble/route.ts', http: 403, means: 'a file handed over is not readable by the caller', charge: 'before any charge' },
  { code: 'insufficient_credits', lanes: ['film', 'single-clip', 'music-video', 'product-ad', 'longform', 'montage', 'editing', 'remix', 'motion', 'swap', 'vfx'], where: 'app/api/video/assemble/route.ts', http: 402, means: 'the wallet cannot cover the quote', charge: 'before any charge' },
  { code: 'qc_rejected', lanes: ['film', 'single-clip', 'music-video'], where: 'app/api/video/assemble/route.ts', http: 502, means: 'the finished master (or the single clip’s cut) failed a critical quality check (frame_count_mismatch, frame_count_unverified — a count that could not be read is a refusal too, silent_master, empty_master) and was withheld', charge: 'refunded once' },
  { code: 'assembly_failed', lanes: ['film', 'music-video'], where: 'app/api/video/assemble/route.ts', http: 502, means: 'the stitch failed or stalled (saga path)', charge: 'refunded once' },
  { code: 'assemble_failed', lanes: ['single-clip'], where: 'app/api/video/assemble/route.ts', http: 500, means: 'the single clip could not be fetched or cut — the legacy spelling of assembly_failed on the single-clip path (consolidation plan D5 unifies it)', charge: 'refunded once' },
  { code: 'quote_expired', lanes: ['montage', 'editing'], where: 'lib/agent/media/montageExec.ts', http: null, means: 'the signed quote is past its expiry; a new quote is needed', charge: 'before any charge' },
  { code: 'quote_changed', lanes: ['montage', 'editing'], where: 'lib/agent/media/montageExec.ts', http: null, means: 'the plan or the files changed since the quote; a new quote is needed', charge: 'before any charge' },
  { code: 'music_too_short', lanes: ['montage'], where: 'lib/agent/media/montageExec.ts', http: null, means: 'the track, from the offset asked, does not cover the length asked', charge: 'before any charge' },
  { code: 'clip_too_short', lanes: ['montage'], where: 'lib/agent/media/montageExec.ts', http: null, means: 'a kept clip cannot get a shot of its own; nothing is left out silently', charge: 'before any charge' },
  { code: 'target_too_short', lanes: ['montage'], where: 'lib/agent/media/montageExec.ts', http: null, means: 'the length asked cannot hold one shot per kept clip', charge: 'before any charge' },
  { code: 'qc_failed', lanes: ['montage', 'editing'], where: 'lib/agent/media/montageExec.ts', http: null, means: 'the rendered montage is not the plan (frames, sound end, a source unseen) and is not delivered', charge: 'refunded once' },
  { code: 'duplicate_request', lanes: ['product-ad', 'remix', 'motion', 'swap', 'vfx'], where: 'app/api/video/remix/route.ts', http: 409, means: 'the same op was already charged under this idempotency key', charge: 'no second charge' },
];

export const laneContract = (id: VideoLaneId): VideoLaneContract => VIDEO_LANES.find((l) => l.id === id)!;
export const refusalsOf = (id: VideoLaneId): VideoRefusal[] => VIDEO_REFUSALS.filter((r) => r.lanes.includes(id));
