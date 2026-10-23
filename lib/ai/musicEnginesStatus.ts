/**
 * lib/ai/musicEnginesStatus.ts — which music engines /api/ai/music would actually run RIGHT NOW, for the Create
 * screen's model picker and its "Engines & prices" list.
 *
 * The answer is derived from the SAME gate the route runs on, never restated: Lyria 3 — `hasLyriaProvider()` (Vertex
 * configured, and LYRIA_ENABLED not switched off) — the only engine listed (MASTER TASK v3.1). Udio, ElevenLabs Music and
 * MusicGen are not reported at all any more: they were rows that were always off. Plus the engine's Redis circuit
 * breaker (`isProviderTripped`): three consecutive failures open it for ~30 s, and the route will not run a tripped
 * engine — so an engine that is out of funds shows as busy instead of being offered.
 * "+ Audio" (MusicGen's melody model) and "+ Voice" (MiniMax) both run on Replicate, hence `references`.
 *
 * Booleans only — never a key, a model id or a URL. Fail-open on the breaker read (a Redis blip shows engines as ready,
 * exactly as the route itself would treat it).
 */
import { hasLyriaProvider } from '@/lib/ai/lyriaMusic';
import { isProviderTripped } from '@/lib/orchestrator/idempotency';
import { controlModeFor } from '@/lib/ai/musicControls';
import { MUSIC_ENGINE_CHAIN, offeredMusicLengths, type MusicEngineId, type MusicEnginesStatus } from '@/lib/studio/musicEngines';
import { lyriaProMaxSec, lyriaVocalsVerified } from '@/lib/music/studio/capabilities';

export function replicateConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.REPLICATE_API_TOKEN ?? '').trim().length > 0;
}

/** True when the engine would run at all: Lyria configured on Vertex, and LYRIA_ENABLED not switched off. */
export function engineConfigured(id: MusicEngineId, env: NodeJS.ProcessEnv = process.env): boolean {
  void id;
  void env;
  return hasLyriaProvider();
}

export async function musicEnginesStatus(
  env: NodeJS.ProcessEnv = process.env,
  tripped: (provider: string) => Promise<boolean> = isProviderTripped,
): Promise<MusicEnginesStatus> {
  const rows = await Promise.all(MUSIC_ENGINE_CHAIN.map(async (id) => {
    const configured = engineConfigured(id, env);
    // A breaker only matters for an engine that is in the chain; skip the read for one that is not.
    const busy = configured ? await tripped(id).catch(() => false) : false;
    return [id, { configured, busy, controls: controlModeFor(id) }] as const;
  }));
  const engines = Object.fromEntries(rows) as MusicEnginesStatus['engines'];
  // A cover (MusicGen-melody) and a sampled voice (MiniMax) are Replicate engines, outside the provider boundary: off.
  return {
    engines,
    references: { cover: false, voice: false },
    // ⚠️ AUTO IS LYRIA ALONE — the route no longer fails over (PROJECT_MASTER R7). This listed every configured engine
    // that was not busy, which was true while a Lyria miss rerouted down the chain; reported now, it would promise the
    // picker's "Auto" a fallback the route no longer runs. Empty when Lyria cannot run: Auto then fails explicitly.
    chain: engines.lyria.configured && !engines.lyria.busy ? ['lyria'] : [],
    // The panel offers only the lengths the route will make: 30 s on the clip, 60 / 90 / Full song once Lyria 3 Pro is
    // verified for them (the same gate the route refuses by) — never a longer choice that comes back ~30 s.
    lengths: offeredMusicLengths(lyriaProMaxSec(env)),
    // A sung song only once Lyria vocals are verified (the same gate the route refuses by): until then the panel stays on
    // Instrumental instead of sending a song that is refused.
    vocals: lyriaVocalsVerified(env),
  };
}
