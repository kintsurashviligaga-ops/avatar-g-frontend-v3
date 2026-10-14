import type { VoicePreferences } from './settings';
/** Verified model families only; no model switch, affective flag, proactive flag or synthetic laughter tag. */
export function turnDetection(model: string, eagerness: VoicePreferences['eagerness']) {
  if (!/^models\/gemini-(?:2\.5-flash-native-audio(?:-|$)|3\.1-flash-live(?:-|$)|3\.8-live(?:$|-extended-thinking$))/.test(model)) return undefined;
  return { automaticActivityDetection: { disabled: false, prefixPaddingMs: 300,
    silenceDurationMs: eagerness === 'eager' ? 400 : eagerness === 'patient' ? 1200 : 700 } };
}
