/**
 * lib/veo/types.ts — the ONE contract of the Google Veo engine layer (docs/VEO_ENGINE.md).
 *
 * Everything the studio asks of Veo is expressed in these types, and every module under lib/veo/ speaks them:
 *   capabilities  — what each model can do, and the normalisation of a request into what it CAN do
 *   cinematography / promptCompiler — the Omni director's structured shot → Google's documented prompt anatomy
 *   payload       — the exact request JSON for each transport (Vertex AI, Gemini API)
 *   vertexAuth / vertexClient / gcs — the Vertex AI transport: keyless auth, predictLongRunning, GCS + signed URLs
 *   geminiTransport — the Gemini API transport (the production path until GCP credentials exist)
 *   engine        — transport selection + one create/poll surface for the pipeline
 *
 * Facts the types encode (Google docs, verified 2026-09-29 — see docs/VEO_ENGINE.md for the URLs):
 *   • Veo renders ONLY 16:9 and 9:16. 1:1 and 4:5 are delivered by cropping a native frame in post.
 *   • A clip is 4, 6 or 8 s at 24 fps. 1080p, 4k, reference images and extension all require 8 s.
 *   • Inputs: a first frame (image), first+last frame interpolation (lastFrame, needs image), up to 3 "asset"
 *     reference images (8 s only, not Lite, EXCLUSIVE with image/lastFrame).
 *   • There is no transition parameter and no motion-vector input. Camera motion is prompt language (Google's
 *     documented vocabulary); Vertex's `cameraControl` enum exists only in the schema (unverified on Veo 3.1,
 *     requires an image) and is therefore opt-in behind VEO_NATIVE_CAMERA_CONTROL.
 */

export type VeoTransport = 'vertex' | 'gemini';

/** Quality tiers — Veo 3.1 (standard), Veo 3.1 Fast, Veo 3.1 Lite. */
export type VeoTier = 'standard' | 'fast' | 'lite';

/** The only aspect ratios Veo renders. */
export type VeoAspect = '16:9' | '9:16';

/** What the user receives. 1:1 and 4:5 are cropped in post from a native frame (see capabilities.nativeAspectFor). */
export type OutputFormat = '9:16' | '16:9' | '1:1' | '4:5';

export type VeoResolution = '720p' | '1080p' | '4k';

export type VeoDuration = 4 | 6 | 8;

/** Google's documented camera MOVEMENTS (Vertex prompt guide) — plus 'auto' (let the director choose). */
export type CameraMove =
  | 'auto'
  | 'static'
  | 'pan_left' | 'pan_right'
  | 'tilt_up' | 'tilt_down'
  | 'push_in' | 'pull_out'
  | 'truck_left' | 'truck_right'
  | 'pedestal_up' | 'pedestal_down'
  | 'zoom_in' | 'zoom_out'
  | 'orbit'
  | 'crane_up' | 'crane_down'
  | 'aerial'
  | 'handheld';

/** Google's documented shot sizes. */
export type ShotSize = 'auto' | 'extreme_wide' | 'wide' | 'full' | 'medium' | 'medium_close' | 'close_up' | 'extreme_close_up';

/** Google's documented camera ANGLES. */
export type CameraAngle = 'auto' | 'eye_level' | 'low' | 'high' | 'birds_eye' | 'worms_eye' | 'dutch' | 'over_shoulder' | 'pov';

/** Google's documented lens / optical looks. */
export type LensLook = 'auto' | 'wide_angle' | 'standard' | 'telephoto' | 'macro' | 'shallow_focus' | 'deep_focus';

/** Joins the assembler ACTUALLY renders (ffmpeg xfade / concat). Veo has no transition parameter. */
export type Transition = 'cut' | 'crossfade' | 'dissolve' | 'fade_black';

/** The Vertex `instances[].cameraControl` enum (schema only; requires an image; opt-in). */
export type VertexCameraControl =
  | 'fixed' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down'
  | 'truck_left' | 'truck_right' | 'pedestal_up' | 'pedestal_down' | 'push_in' | 'pull_out';

export interface CameraSpec {
  move: CameraMove;
  /** 1 (barely perceptible) … 10 (fast). 5 = the neutral default; it adds NO words to the prompt. */
  intensity: number;
  shot: ShotSize;
  angle: CameraAngle;
  lens: LensLook;
}

/**
 * The structured motion the camera performs, in the camera's own frame — for metadata, QA and the UI preview.
 * NOT a Veo input (Veo takes no vectors); it is the exact description the prompt phrase encodes.
 *   translation: x = truck (+right), y = pedestal (+up), z = dolly (+toward the subject), in "frame widths per clip"
 *   rotation:    pan (+right), tilt (+up), roll, in degrees per clip
 *   zoom:        focal-length change factor per clip (1 = none, >1 = zoom in)
 */
export interface MotionVector {
  translation: { x: number; y: number; z: number };
  rotation: { pan: number; tilt: number; roll: number };
  zoom: number;
  /** 0…1 — how much of the clip the move spans (intensity mapped). */
  magnitude: number;
}

export interface DialogueLine {
  speaker: string;
  line: string;
  /** BCP-47 (e.g. 'ka', 'en'). Veo is evaluated for English speech only — see promptCompiler. */
  language?: string;
}

export interface SceneAudio {
  dialogue: DialogueLine[];
  sfx?: string;
  ambience?: string;
}

/** One Veo clip, as the Omni director structures it — Google's prompt anatomy, field by field. */
export interface ShotSpec {
  ordinal: number;
  /** Who/what, described IDENTICALLY in every scene (character lock). English. */
  subject: string;
  /** What happens — the motion of this beat. English. */
  action: string;
  /** Location, time of day, weather, period. English. */
  setting?: string;
  camera: CameraSpec;
  lighting?: string;
  /** Visual style / grade / artistic look. English. */
  style?: string;
  mood?: string;
  audio?: SceneAudio;
  /** True when the clip animates from a first frame: Google says "prompt for motion only" then. */
  hasStartImage: boolean;
  /** How this shot joins the NEXT one (post-production). */
  transitionOut?: Transition;
}

/** A media input for Veo. Vertex prefers `gcs` (no base64 in the request body); the Gemini API needs bytes. */
export type VeoMedia =
  | { kind: 'gcs'; uri: string; mimeType: string }
  | { kind: 'bytes'; base64: string; mimeType: string }
  | { kind: 'url'; url: string };

export type PersonGeneration = 'allow_all' | 'allow_adult' | 'dont_allow';

/** A fully-specified clip request — what normalizeClipRequest() returns and the payload builders consume. */
export interface VeoClipRequest {
  prompt: string;
  negativePrompt?: string;
  aspect: VeoAspect;
  durationSec: VeoDuration;
  resolution: VeoResolution;
  tier: VeoTier;
  /** uint32. Same seed across a film's scenes = continuity (not determinism). */
  seed?: number;
  /** Vertex only: false renders video-only (cheaper; for clips re-scored in post). Gemini: always on. */
  generateAudio: boolean;
  startImage?: VeoMedia;
  /** Requires startImage. */
  lastFrame?: VeoMedia;
  /** ≤3 asset references; exclusive with startImage/lastFrame; 8 s only; not on Lite. */
  referenceImages?: VeoMedia[];
  /** Vertex only, opt-in (VEO_NATIVE_CAMERA_CONTROL=1), requires startImage. */
  cameraControl?: VertexCameraControl;
  personGeneration?: PersonGeneration;
  /** Vertex only. Default false: we compile our own prompt, and enhancement defeats the seed. */
  enhancePrompt?: boolean;
  /**
   * Send `prompt` and `negativePrompt` exactly as given (V3, the storyboard director): no trim. Default false, where
   * surrounding whitespace is trimmed. The prompt must still contain something other than whitespace.
   */
  verbatimPrompt?: boolean;
}

/** One adjustment normalizeClipRequest made to fit the model's contract — logged and shown in the UI. */
export interface ClipAdjustment {
  field: 'durationSec' | 'resolution' | 'aspect' | 'referenceImages' | 'lastFrame' | 'cameraControl' | 'generateAudio' | 'tier' | 'prompt';
  from: unknown;
  to: unknown;
  reason: string;
}

/** A submitted long-running operation. Transport is recoverable from the name alone (see engine.transportOf). */
export interface VeoOperationRef {
  transport: VeoTransport;
  /** Vertex: projects/P/locations/L/publishers/google/models/M/operations/ID — Gemini: models/M/operations/ID */
  name: string;
  model: string;
  /** Vertex: the gs:// prefix the output is written under. */
  outputPrefix?: string;
}

export type VeoFailureReason =
  | 'not_configured'
  | 'invalid_request'   // 400 — fix the request; never retry as-is
  | 'auth'              // 401/403
  | 'quota'             // billing / prepay exhausted (402-like) — do not retry
  | 'rate_limited'      // 429 — rejected before any job existed; safe to retry with backoff
  | 'unavailable'       // 503 — rejected; safe to retry with backoff
  | 'ambiguous'         // timeout / 500 / 502 / 504 / network — a job MAY exist: NEVER re-POST
  | 'safety';           // blocked by Responsible-AI filters

export type VeoCreateOutcome =
  | { ok: true; operation: VeoOperationRef }
  | { ok: false; reason: VeoFailureReason; retryable: boolean; status?: number; detail?: string };

export type VeoVideo =
  | { kind: 'gcs'; gcsUri: string; mimeType: string }
  | { kind: 'gemini-file'; uri: string; mimeType: string }
  | { kind: 'bytes'; base64: string; mimeType: string };

export type VeoPollOutcome =
  | { state: 'processing' }
  | { state: 'succeeded'; videos: VeoVideo[] }
  | { state: 'filtered'; reason: string; supportCodes: string[] }
  | { state: 'failed'; reason: string; code?: number };

/** What the Vertex transport needs (lib/veo/vertexAuth.ts → vertexConfig()). */
export interface VertexConfig {
  projectId: string;
  /** Veo on Vertex is us-central1 only (Google locations table, 2026-09). */
  location: string;
  /** gs://bucket[/prefix] — Veo writes outputs here; inputs are uploaded under <bucket>/inputs/. */
  bucket: string;
  auth:
    | { mode: 'wif'; projectNumber: string; serviceAccountEmail: string; poolId: string; providerId: string }
    | { mode: 'service_account_key'; clientEmail: string };
}
