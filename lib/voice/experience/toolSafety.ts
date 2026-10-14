import type { LiveFunctionResponse } from '@/lib/voice/geminiLive';
export interface VoiceCall { id: string; name: string; args: unknown }
/** Deterministic dispatch gate before the legacy spokenYes/countdown executor. No authority from model audio. */
export function voiceNeedsUiConfirmation(call: VoiceCall): boolean {
  if (call.name === 'start_generation') return true;
  const args = call.args && typeof call.args === 'object' ? call.args as Record<string, unknown> : {};
  return ['agent_task', 'extract_audio', 'music_studio', 'image_studio', 'video_studio'].includes(call.name)
    && ['start', 'confirm', 'generate', 'run'].includes(String(args.action ?? '').trim().toLowerCase());
}
export async function executeVoiceCalls(
  calls: VoiceCall[],
  handler?: (calls: VoiceCall[]) => Promise<LiveFunctionResponse[] | void> | LiveFunctionResponse[] | void,
): Promise<LiveFunctionResponse[]> {
  const blocked = calls.filter(voiceNeedsUiConfirmation);
  const safe = calls.filter(c => !voiceNeedsUiConfirmation(c));
  const replies: LiveFunctionResponse[] = blocked.map(c => ({ id: c.id, name: c.name, response: {
    ok: false, error: 'ui_confirmation_required', message: 'Nothing started. Review the quote and use its authenticated confirmation button.',
  } }));
  const allowedIds = new Set(safe.map(c => c.id));
  if (safe.length && handler) {
    const results = await handler(safe);
    if (results) replies.push(...results.filter(r => allowedIds.has(r.id)));
  }
  return replies;
}
