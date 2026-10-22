/**
 * Avatar persona — pure persona/emotion logic. No SDK/IO here, so it's client-safe + unit-testable.
 *
 * Agent V (Persona & Emotion Director) → PersonaDirective from the dialogue (app/api/orchestrator/voice/produce).
 *
 * The HeyGen session-config builder and its lighting templates (Agent M) went with the HeyGen avatar pipeline
 * (app/api/orchestrator/avatar/produce, retired in MASTER TASK v3.1 PR 9: built-in avatars only).
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
