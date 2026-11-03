import 'server-only';

import { createHash } from 'crypto';

type Principal = { userId: string; clientId: string; token: string; scopes: string[] };
type Result = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/** Stable binding reserved for the future, verified avatar-video approval flow. */
export function videoRequestHash(value: { kind: 'video'; script: string; avatarId: string; aspectRatio: string }): string {
  return createHash('sha256').update(JSON.stringify([value.kind, value.script, value.avatarId, value.aspectRatio])).digest('hex');
}

/**
 * Never invoke /api/video/generate here: its legacy jobs have no verified worker,
 * and its queue insert and debit are separate operations. A feature flag alone
 * cannot turn that path into a safe paid integration. The active Veo avatar
 * flow supports curated presets, not this tool's arbitrary avatar UUID.
 */
export async function requestOrExecuteVideo(_raw: Record<string, unknown>, _principal: Principal): Promise<Result> {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: 'generation_unavailable', message: 'Video generation through this connector is not available. No task was created and no credits were charged.' }) }],
  };
}
