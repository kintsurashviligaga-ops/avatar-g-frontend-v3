/**
 * §5 — Character Music Video presets.
 *
 * Pure data + a prompt composer for the studio's Music-Video mode: the user
 * uploads a character photo (+ optional location) and their own audio track,
 * picks a genre and a camera movement, and we compose a single professional
 * director prompt. The uploaded audio becomes the soundtrack verbatim (threaded
 * through driveFilmStudio → assemble as the music bed); the character photo locks
 * identity via the existing reference-image path.
 *
 * No React, no IO → trivially unit-testable and shared client/server.
 */

export interface MusicVideoGenre {
  id: string;
  labelKa: string;
  labelEn: string;
  /** Director language appended to the prompt for this genre's look + mood. */
  promptEn: string;
}

export interface CameraMove {
  id: string;
  labelKa: string;
  labelEn: string;
  promptEn: string;
}

export const MV_GENRES: MusicVideoGenre[] = [
  {
    id: 'blues',
    labelKa: 'ბლუზი',
    labelEn: 'Blues',
    promptEn:
      'a soulful blues music video — warm, moody low-key lighting, smoky intimate bar ambiance, rich shadows and amber highlights, emotional and timeless',
  },
  {
    id: 'hiphop',
    labelKa: 'ჰიპ-ჰოპ',
    labelEn: 'Hip-Hop',
    promptEn:
      'a high-energy hip-hop music video — bold urban streetwear, dynamic neon night-city backdrops, confident swagger, punchy rhythm-cut editing',
  },
  {
    id: 'pop',
    labelKa: 'პოპი',
    labelEn: 'Pop',
    promptEn:
      'a vibrant pop music video — bright saturated colors, glossy polished production, energetic upbeat motion, clean modern sets',
  },
  {
    id: 'cinematic',
    labelKa: 'კინემატოგრაფიული',
    labelEn: 'Cinematic',
    promptEn:
      'an epic cinematic music video — anamorphic widescreen, dramatic volumetric lighting, teal-and-orange grade, sweeping emotional scale',
  },
];

export const MV_CAMERA_MOVES: CameraMove[] = [
  { id: 'pan', labelKa: 'პანორამა', labelEn: 'Pan', promptEn: 'smooth horizontal panning camera moves across the scene' },
  { id: 'zoom', labelKa: 'ზუმი', labelEn: 'Zoom', promptEn: 'a slow dramatic push-in zoom toward the performer' },
  { id: 'orbit', labelKa: 'ორბიტა', labelEn: 'Orbit', promptEn: 'a sweeping 360° orbit circling the performer' },
  { id: 'drone360', labelKa: '360° დრონი', labelEn: '360° Drone', promptEn: 'a full 360° aerial drone shot circling high around the subject, panoramic reveal' },
  { id: 'craneup', labelKa: 'კრეინი ↑', labelEn: 'Crane Up', promptEn: 'a dramatic vertical crane move rising up and away from the subject' },
  { id: 'cranedown', labelKa: 'კრეინი ↓', labelEn: 'Crane Down', promptEn: 'a cinematic crane move descending down toward the subject' },
  { id: 'whippan', labelKa: 'Whip Pan', labelEn: 'Whip Pan', promptEn: 'fast whip-pan transitions snapping on the beat for kinetic energy' },
];

/** Framing / shot size (image_3.png "Select style…"). Drives the Cinematographer. */
export interface ShotType {
  id: string;
  labelKa: string;
  labelEn: string;
  promptEn: string;
}

export const MV_SHOTS: ShotType[] = [
  { id: 'wide', labelKa: 'ფართო', labelEn: 'Wide', promptEn: 'wide establishing shots that frame the performer in the full environment' },
  { id: 'medium', labelKa: 'საშუალო', labelEn: 'Medium', promptEn: 'balanced medium shots framing the performer from the waist up' },
  { id: 'closeup', labelKa: 'ახლო', labelEn: 'Close-up', promptEn: 'intimate close-up shots on the performer’s face and expression' },
];

/** Lighting source + mood (image_5.png selector). */
export interface LightingMood {
  id: string;
  labelKa: string;
  labelEn: string;
  promptEn: string;
}

export const MV_LIGHTING: LightingMood[] = [
  { id: 'golden', labelKa: 'ოქროს საათი', labelEn: 'Golden Hour', promptEn: 'warm golden-hour sunlight, soft long shadows, amber glow' },
  { id: 'cinematic', labelKa: 'კინო', labelEn: 'Cinematic', promptEn: 'dramatic cinematic key lighting with deep contrast and rim light' },
  { id: 'moody', labelKa: 'მუდი', labelEn: 'Moody', promptEn: 'low-key moody lighting, rich shadows, a single motivated source' },
  { id: 'melancholic', labelKa: 'მელანქოლია', labelEn: 'Melancholic', promptEn: 'soft, desaturated melancholic light, cool muted tones, gentle haze' },
];

export function findGenre(id: string | null | undefined): MusicVideoGenre | undefined {
  return id ? MV_GENRES.find((g) => g.id === id) : undefined;
}

export function findCameraMove(id: string | null | undefined): CameraMove | undefined {
  return id ? MV_CAMERA_MOVES.find((c) => c.id === id) : undefined;
}

export function findShot(id: string | null | undefined): ShotType | undefined {
  return id ? MV_SHOTS.find((s) => s.id === id) : undefined;
}

export function findLighting(id: string | null | undefined): LightingMood | undefined {
  return id ? MV_LIGHTING.find((l) => l.id === id) : undefined;
}

/**
 * Compose the director prompt for a music video from the user's free text plus
 * the chosen genre + camera movement, always anchoring the uploaded character as
 * the star so identity is preserved across every shot.
 */
export function composeMusicVideoPrompt(input: {
  userPrompt: string;
  genreId: string | null;
  cameraId: string | null;
  shotId?: string | null;
  lightingId?: string | null;
}): string {
  const parts: string[] = [];
  const base = input.userPrompt.trim();
  const genre = findGenre(input.genreId);
  const cam = findCameraMove(input.cameraId);
  const shot = findShot(input.shotId);
  const light = findLighting(input.lightingId);

  // Order mirrors a director's brief: subject/action → style → framing → motion →
  // light/mood → the identity anchor that keeps the uploaded character the star.
  if (base) parts.push(base);
  if (genre) parts.push(genre.promptEn);
  if (shot) parts.push(shot.promptEn);
  if (cam) parts.push(cam.promptEn);
  if (light) parts.push(light.promptEn);
  parts.push(
    'Feature the uploaded character as the star performer; keep their face and identity consistent and recognizable across every shot, synced to the music',
  );

  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join('. ')
    .replace(/\.\s*\./g, '.')
    .trim();
}
