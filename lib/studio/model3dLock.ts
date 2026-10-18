/**
 * The 3D model tool is shown and locked (the owner's PRD, 2026-10-18: "3D მოდელის ფორმა წინასწარ უნდა იყოს
 * დაბლოკილი"). The form opens with a „მალე" note and nothing in it can be filled or paid for; the tool sheet tags it
 * „მალე"; the voice agent says it is not open yet. The API route stays as it is. One constant, so opening the tool is
 * one edit and a reviewed PR, never an environment variable.
 */
export const MODEL3D_LOCKED = true;
