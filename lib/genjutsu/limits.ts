/**
 * lib/genjutsu/limits.ts — every number the VFX module enforces, in ONE place shared by the browser (which refuses
 * early, with friendly copy) and the server (which refuses for real). Pure and client-safe.
 */

/** The reference dropzone's cap — what the user may PICK. What an engine RECEIVES is smaller (engines.ts). */
export const MAX_REFERENCES = 40;

/** The source video, in seconds. Kling 3 Motion Control documents 3–30 s; Genjutsu trims anything past 30 s. */
export const SOURCE_VIDEO_MIN_SEC = 3;
export const SOURCE_VIDEO_MAX_SEC = 30;

/**
 * The source video's size ceiling. The browser PUTs straight to storage (a serverless body caps near 4.5 MB), and
 * components/studio/ui/useUpload refuses anything over 50 MB before the upload starts — this is the same number
 * (a test pins the pair), so a file the browser lets through is never one the server rejects as "too large".
 */
export const SOURCE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Containers the engines read. (Kling documents mp4 and mov.) */
export const SOURCE_VIDEO_MIMES: readonly string[] = ['video/mp4', 'video/quicktime'];

/** Reference photos: downscaled in the browser so an engine never receives (or pays to fetch) a 12 MP original. */
export const REFERENCE_MAX_EDGE_PX = 1280;
/** Below this the engines refuse the image (Kling: 300 px) — said at pick time, not after the render is paid for. */
export const REFERENCE_MIN_EDGE_PX = 300;
/** An original over this is refused before decoding: a 60 MB RAW would only freeze a phone's canvas. */
export const REFERENCE_INPUT_MAX_BYTES = 25 * 1024 * 1024;
/** What the browser accepts for a photo. HEIC/HEIF are tried (Safari decodes them) and refused with a reason if not. */
export const REFERENCE_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
/** JPEG quality of the downscaled copy that is uploaded. */
export const REFERENCE_JPEG_QUALITY = 0.88;

/** The optional free-text line. The preset already supplies the prompt; this only refines it. */
export const USER_PROMPT_MAX_CHARS = 500;

/** The finished prompt sent to a model (preset + role clauses + the user's line) never exceeds this. */
export const COMPOSED_PROMPT_MAX_CHARS = 1800;

/** Veo reference mode renders exactly this many seconds (lib/veo/capabilities: references force an 8 s clip). */
export const SCENE_SECONDS = 8;
