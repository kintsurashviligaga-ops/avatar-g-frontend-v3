/**
 * lib/ai/musicEnginesStatus.ts — which music engines /api/ai/music would actually run RIGHT NOW, for the Create
 * screen's model picker and its "Engines & prices" list.
 *
 * The answer is derived from the SAME gates the route builds its chain with (`composeTrackUrl`), never restated:
 *   · Lyria 3        — `hasLyriaProvider()` (a Gemini key, and LYRIA_ENABLED not switched off)
 *   · Udio           — `hasUdioApiKey()` and MUSIC_PROVIDER !== 'elevenlabs' (that setting drops Udio from the chain)
 *   · ElevenLabs     — `hasElevenLabsMusicKey()`
 *   · MusicGen       — Replicate's token (the route always lists it, but without a token every call would fail)
 * plus each engine's Redis circuit breaker (`isProviderTripped`): three consecutive failures open it for ~30 s, and the
 * route will not run a tripped engine — so an engine that is out of funds shows as busy instead of being offered.
 * "+ Audio" (MusicGen's melody model) and "+ Voice" (MiniMax) both run on Replicate, hence `references`.
 *
 * Booleans only — never a key, a model id or a URL. Fail-open on the breaker read (a Redis blip shows engines as ready,
 * exactly as the route itself would treat it).
 */
import { hasLyriaProvider } from '@/lib/ai/lyriaMusic';
import { hasUdioApiKey } from '@/lib/chat/mediaKeys';
import { hasElevenLabsMusicKey } from '@/lib/elevenlabs/music';
import { isProviderTripped } from '@/lib/orchestrator/idempotency';
import { controlModeFor } from '@/lib/ai/musicControls';
import { MUSIC_ENGINE_CHAIN, type MusicEngineId, type MusicEnginesStatus } from '@/lib/studio/musicEngines';

export function replicateConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.REPLICATE_API_TOKEN ?? '').trim().length > 0;
}

/** True when the engine would be in the route's chain at all (a key / token / switch). */
export function engineConfigured(id: MusicEngineId, env: NodeJS.ProcessEnv = process.env): boolean {
  switch (id) {
    case 'lyria': return hasLyriaProvider();
    case 'udio': return hasUdioApiKey(env) && env.MUSIC_PROVIDER !== 'elevenlabs';
    case 'elevenlabs-music': return hasElevenLabsMusicKey(env);
    case 'musicgen': return replicateConfigured(env);
  }
}

export async function musicEnginesStatus(
  env: NodeJS.ProcessEnv = process.env,
  tripped: (provider: string) => Promise<boolean> = isProviderTripped,
): Promise<MusicEnginesStatus> {
  const rows = await Promise.all(MUSIC_ENGINE_CHAIN.map(async (id) => {
    const configured = engineConfigured(id, env);
    // A breaker only matters for an engine that is in the chain; skip the read for one that is not.
    const busy = configured ? await tripped(id).catch(() => false) : false;
    return [id, { configured, busy, controls: controlModeFor(id, env) }] as const;
  }));
  const engines = Object.fromEntries(rows) as MusicEnginesStatus['engines'];
  const replicate = replicateConfigured(env);
  return {
    engines,
    references: { cover: replicate, voice: replicate },
    // ⚠️ AUTO IS LYRIA ALONE — the route no longer fails over (PROJECT_MASTER R7). This listed every configured engine
    // that was not busy, which was true while a Lyria miss rerouted down the chain; reported now, it would promise the
    // picker's "Auto" a fallback the route no longer runs. Empty when Lyria cannot run: Auto then fails explicitly.
    chain: engines.lyria.configured && !engines.lyria.busy ? ['lyria'] : [],
  };
}
