/**
 * Avatar service — pure persona/emotion + visual-coherence logic and the HeyGen
 * session-config builder. No SDK/IO here, so it's client-safe + unit-testable.
 *
 * Agent V (Persona & Emotion Director) → PersonaDirective from the dialogue.
 * Agent M (Visual Coherence Matcher)   → a lighting template so the avatar reads
 *                                         as part of the scene, not "pasted on".
 *
 * buildSessionConfig() assembles the grounding payload (system prompt + memory +
 * persona) for a HeyGen Interactive/Streaming Agent session. NOTE: the live
 * bidirectional WebRTC stream itself is a client-side LiveKit SDK session against
 * a HeyGen-issued streaming token — this module produces the server-side config
 * that grounds it (and the metadata the video-gen produce path attaches).
 */

export type Expression =
  | 'professional' | 'empathetic' | 'enthusiastic' | 'calm' | 'serious' | 'friendly';

export interface PersonaDirective {
  expression: Expression;
  microGestures: string[];
  posture: string;
  tone: string;
}

const GESTURES: Record<Expression, { microGestures: string[]; posture: string; tone: string }> = {
  professional: { microGestures: ['measured hand emphasis', 'steady eye contact'], posture: 'upright, square shoulders', tone: 'confident, articulate' },
  empathetic: { microGestures: ['gentle head tilt', 'open palms'], posture: 'slightly leaning in', tone: 'warm, reassuring' },
  enthusiastic: { microGestures: ['animated hand gestures', 'raised brows'], posture: 'energized, forward', tone: 'upbeat, dynamic' },
  calm: { microGestures: ['slow nods', 'relaxed shoulders'], posture: 'settled, grounded', tone: 'soothing, even-paced' },
  serious: { microGestures: ['minimal gestures', 'firm gaze'], posture: 'still, composed', tone: 'grave, deliberate' },
  friendly: { microGestures: ['easy smile', 'light shrugs'], posture: 'casual, relaxed', tone: 'approachable, conversational' },
};

/** Agent V — infer the emotional/behavioral directive from the dialogue text. */
export function extractPersonaDirective(text: string): PersonaDirective {
  const t = (text || '').toLowerCase();
  let expression: Expression = 'professional';
  if (/\b(sorry|apolog|understand|support|difficult|condolence|here for you|ბოდიш|извин)\b/.test(t)) expression = 'empathetic';
  else if (/(!|🎉|\b(exciting|amazing|incredible|launch|congrat|welcome|let'?s go|excited)\b)/.test(t)) expression = 'enthusiastic';
  else if (/\b(urgent|critical|warning|important|risk|alert|must|deadline)\b/.test(t)) expression = 'serious';
  else if (/\b(relax|calm|breathe|gentle|spa|peaceful|slow)\b/.test(t)) expression = 'calm';
  else if (/\b(hi|hey|hello|thanks|great to|nice to|chat)\b/.test(t)) expression = 'friendly';
  const g = GESTURES[expression];
  return { expression, microGestures: g.microGestures, posture: g.posture, tone: g.tone };
}

// Agent M — lighting/environment templates so the subject matches the backdrop.
export const LIGHTING_TEMPLATES: Record<string, string> = {
  studio: 'soft studio key + rim highlight on a neutral seamless backdrop',
  cinematic: 'dramatic cinematic side-key, deep contrast shadow, shallow depth',
  natural: 'warm natural window light with airy ambient fill',
  corporate: 'even bright corporate lighting, clean office bokeh',
};

export function pickLighting(hint?: string): { key: string; template: string } {
  const h = (hint || '').toLowerCase();
  const key = (Object.keys(LIGHTING_TEMPLATES) as string[]).find(k => h.includes(k))
    ?? (/\b(drama|film|moody|night)\b/.test(h) ? 'cinematic'
      : /\b(office|business|brand|corporate)\b/.test(h) ? 'corporate'
      : /\b(home|window|day|warm)\b/.test(h) ? 'natural'
      : 'studio');
  return { key, template: LIGHTING_TEMPLATES[key]! };
}

export interface AvatarSessionConfig {
  agentId: string | null;
  systemPrompt: string;
  knowledge: string[];     // memory / personality vectors grounding the agent
  persona: PersonaDirective;
  lighting: { key: string; template: string };
}

/** Grounding config for a HeyGen Interactive Agent session. */
export function buildSessionConfig(opts: {
  systemPrompt?: string;
  memory?: string[];
  script: string;
  agentId?: string | null;
  lightingHint?: string;
}): AvatarSessionConfig {
  const persona = extractPersonaDirective(opts.script);
  return {
    agentId: opts.agentId ?? process.env.HEYGEN_AGENT_ID ?? null,
    systemPrompt: (opts.systemPrompt ?? '').trim()
      || `You are a MyAvatar.ge interactive presenter. Speak ${persona.tone}; embody a ${persona.expression} demeanor.`,
    knowledge: (opts.memory ?? []).filter(Boolean).slice(0, 20),
    persona,
    lighting: pickLighting(opts.lightingHint),
  };
}
