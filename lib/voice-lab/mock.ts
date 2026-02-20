import type { VoiceJobType } from '@/lib/voice-lab/types';

export const SILENT_WAV_DATA_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';

export function buildMockVoiceOutput(type: VoiceJobType, payload: {
  text: string;
  title: string;
  language: string;
  profileName: string;
}) {
  const normalizedText = payload.text.trim() || 'Generated voice content';
  const captionSuggestion = `${payload.title}: ${normalizedText.slice(0, 120)}`;

  return {
    kind: type,
    audio_url: SILENT_WAV_DATA_URL,
    text_preview: normalizedText,
    caption_suggestion: captionSuggestion,
    recommended_usage: payload.language === 'ka' ? 'რილსი + ვიდეო ნარაცია' : 'reel + video narration',
    profile_name: payload.profileName || 'Default Voice',
    generated_at: new Date().toISOString(),
  };
}
