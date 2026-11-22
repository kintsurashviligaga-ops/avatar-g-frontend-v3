/**
 * lib/studio3d/prompts.ts — the Gemini (gemini-3.1-flash-image) prompts that make a picture TRELLIS.2 can lift into 3D.
 *
 * TRELLIS.2 reads ONE image. It does best with: the whole object in frame, a front three-quarter view, soft even light,
 * a plain light background, no cast shadow, no other objects, no text. That is what the reference prompt asks for.
 * The retexture prompt keeps the exact silhouette of the current model (we send its turntable front frame as the
 * input picture) and only changes the surface, so the texture-only TRELLIS.2 pass lines up with the mesh.
 */

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 600);

export function referencePrompt(object: string): string {
  return [
    `A single ${clean(object)}, shown whole and centred, front three-quarter view, slightly above eye level.`,
    'Product-render style: soft even studio light, plain light grey seamless background, no cast shadow, no floor line.',
    'Only this one object: no other objects, no people unless the object is a character, no text, no logos, no watermark.',
    'Sharp focus edge to edge, true colours and materials, nothing cropped by the frame.',
  ].join(' ');
}

export function retexturePrompt(style: string): string {
  return [
    `Repaint this exact object with a new surface: ${clean(style)}.`,
    'Keep the silhouette, pose, proportions and camera angle EXACTLY the same; change only colours, materials and surface detail.',
    'Same plain light grey background, soft even light, no shadow, no text, no logos.',
  ].join(' ');
}

/** Gemini safety pre-check for the user's words (the $0.0005 line in price.ts). Answer must be one word. */
export function safetyCheckPrompt(text: string): string {
  return [
    'You check requests for a 3D model generator. Answer with exactly one word: ALLOW or BLOCK.',
    'BLOCK if it asks for a real, identifiable person (a celebrity, politician or private person by name), weapons designed to hurt people,',
    'sexual content, or hate symbols. Toys, props, figurines of fictional characters, animals, furniture, vehicles and products are ALLOW.',
    `Request: """${clean(text)}"""`,
  ].join(' ');
}

export function parseSafetyAnswer(answer: string): 'allow' | 'block' {
  // Fail closed: anything other than a clear ALLOW is a block.
  return /^\s*ALLOW\b/i.test(answer) ? 'allow' : 'block';
}
