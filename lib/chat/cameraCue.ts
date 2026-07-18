/**
 * cameraCue — infer a short cinematic camera-move label from a storyboard scene's
 * client-visible text (its `beat` + editable `prompt`).
 *
 * WHY derive rather than read a field: the rich screenwriter metadata
 * (`SceneScreenwriterMeta.cameraShot`, see lib/chat/filmComposite.ts) is computed
 * SERVER-side for the render and is never threaded back into the client
 * `StoryboardScene` ({ ordinal, beat, prompt, frameUrl, anchored, baseImage }). So the
 * Director's-Deck tiles can only honestly surface a camera cue by reading the text the
 * user already sees. LLM scene prompts are English, so we match English film vocabulary
 * and return `null` (⇒ no chip) when nothing decisive is present — a missing cue is
 * always better than a wrong one.
 *
 * Pure + deterministic (unit-tested). Input is length-capped and every pattern is a
 * simple bounded alternation (no catastrophic backtracking / ReDoS).
 */

const MAX_SCAN = 2000; // cap the scanned text — beats+prompts are short; guards against pathological input

// Ordered most-specific → least; first match wins. AMBIGUOUS words (pan, crane, static, tilt,
// tracking, zoom, orbit) MUST carry an unambiguous camera qualifier (shot / in / out / up / down /
// across / camera …) so ordinary scene vocabulary never yields a WRONG badge: "frying pan",
// "a crane lifts beams", "static on the TV", "tracking a deer", "tilt-shift", "the orbit of the
// moon" all correctly return null. Only inherently camera-specific terms (dolly, aerial, handheld,
// steadicam, gimbal, whip-pan, close-up, establishing) may match on their own.
const RULES: { re: RegExp; label: string }[] = [
  { re: /\b(?:aerial|bird'?s[-\s]?eye|drone\s?(?:shot|footage|view)|overhead\s?shot|top[-\s]?down\s?shot)\b/, label: 'AERIAL' },
  { re: /\b(?:crane\s?(?:shot|up|down)|jib\s?(?:shot|up|down))\b/, label: 'CRANE' },
  { re: /\b(?:orbit(?:ing)?\s?(?:shot|around)|arc\s?shot|360[-\s]?(?:degree|spin|shot))\b/, label: 'ORBIT' },
  { re: /\b(?:dolly\s?out|dolly[-\s]?back|camera\s?pulls?[-\s]?back|pulls?[-\s]?back\s?to\s?reveal|pull[-\s]?back\s?shot)\b/, label: 'DOLLY PULL' },
  { re: /\b(?:dolly\s?(?:in|shot|push)|push[-\s]?in)\b/, label: 'DOLLY PUSH' },
  { re: /\b(?:tracking\s?(?:shot|alongside)|track\s?shot|steadicam|gimbal|following\s?shot)\b/, label: 'TRACKING' },
  { re: /\b(?:handheld|hand[-\s]?held|shaky[-\s]?cam)\b/, label: 'HANDHELD' },
  { re: /\b(?:whip[-\s]?pan|panning\s?shot|pan(?:ning|s)?\s?(?:across|left|right|shot|up|down))\b/, label: 'PAN' },
  { re: /\b(?:tilt\s?(?:up|down|shot)|tilting(?:\s?(?:up|down|shot))?)\b/, label: 'TILT' },
  { re: /\b(?:zoom\s?(?:in|out)|zooming|zoom\s?shot)\b/, label: 'ZOOM' },
  { re: /\b(?:extreme\s?close[-\s]?up|close[-\s]?up|closeup|ecu|macro\s?shot)\b/, label: 'CLOSE-UP' },
  { re: /\b(?:wide[-\s]?(?:shot|angle)|establishing(?:\s?shot)?|panorama|panoramic|vista)\b/, label: 'WIDE' },
  { re: /\b(?:slow[-\s]?motion|slow[-\s]?mo|slo[-\s]?mo)\b/, label: 'SLOW-MO' },
  { re: /\b(?:static\s?(?:shot|camera|frame)|locked[-\s]?off|lock[-\s]?off|tripod\s?shot)\b/, label: 'STATIC' },
];

/**
 * Return an UPPERCASE camera-move token (e.g. 'DOLLY PUSH', 'CLOSE-UP') or `null` when the
 * scene text carries no recognizable camera cue. `beat` and `prompt` are concatenated.
 */
export function inferCameraMove(beat?: string | null, prompt?: string | null): string | null {
  const text = `${beat ?? ''} ${prompt ?? ''}`.slice(0, MAX_SCAN).toLowerCase();
  if (!text.trim()) return null;
  for (const { re, label } of RULES) {
    if (re.test(text)) return label;
  }
  return null;
}
