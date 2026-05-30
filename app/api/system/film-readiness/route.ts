/**
 * app/api/system/film-readiness/route.ts
 * ======================================
 * PHASE 46 §1 — Runtime structural configuration report for the 30-second film
 * pipeline. Hit this on the LIVE Vercel deployment to see, per agent, exactly
 * which credential alias the production shell has provisioned — without ever
 * exposing a secret value.
 *
 *   GET /api/system/film-readiness
 *
 * For each of the four film agents (Nano Banana storyboard, LTX director,
 * Udio score, ElevenLabs voice) it reports:
 *   - present:       is ANY accepted alias populated?
 *   - resolvedAlias: WHICH alias name resolved (names only, never the value)
 *   - checkedAliases:the full precedence list the resolver walks
 *
 * The report is names-only by construction: it returns boolean presence and
 * env-var NAMES, and never returns, logs, or hashes the secret material. Use it
 * as the single source of truth for what to sync in the Vercel dashboard.
 */

import { NextResponse } from 'next/server';
import { LTX_API_KEY_ALIASES } from '@/lib/chat/ltxKey';
import {
  resolveAliasName,
  UDIO_API_KEY_ALIASES,
  ELEVENLABS_API_KEY_ALIASES,
  NANOBANANA_API_KEY_ALIASES,
} from '@/lib/chat/mediaKeys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type AgentRole = 'storyboard' | 'director' | 'score' | 'voice';

type ProviderReadiness = {
  agent: AgentRole;
  provider: 'nanobanana' | 'ltx' | 'udio' | 'elevenlabs';
  role: string;
  present: boolean;
  resolvedAlias: string | null;
  canonicalEnv: string;
  checkedAliases: readonly string[];
};

function describe(
  agent: AgentRole,
  provider: ProviderReadiness['provider'],
  role: string,
  aliases: readonly string[],
): ProviderReadiness {
  const resolvedAlias = resolveAliasName(aliases);
  return {
    agent,
    provider,
    role,
    present: resolvedAlias !== null,
    resolvedAlias,
    canonicalEnv: aliases[0] ?? '',
    checkedAliases: aliases,
  };
}

export async function GET() {
  const providers: ProviderReadiness[] = [
    describe('storyboard', 'nanobanana', 'Nano Banana — 5-beat storyboard architect', NANOBANANA_API_KEY_ALIASES),
    describe('director', 'ltx', 'LTX Director — clip render + characterReference', LTX_API_KEY_ALIASES),
    describe('score', 'udio', 'Udio — cohesive cinematic score', UDIO_API_KEY_ALIASES),
    describe('voice', 'elevenlabs', 'ElevenLabs — voiceover / foley master', ELEVENLABS_API_KEY_ALIASES),
  ];

  const byProvider = Object.fromEntries(providers.map((p) => [p.provider, p.present])) as Record<
    ProviderReadiness['provider'],
    boolean
  >;

  // The director (LTX) is the hard floor: no clips can render without it. Audio
  // is optional and degrades gracefully (silent/ambient fallback) when absent.
  const canRenderClips = byProvider.ltx;
  const canScore = byProvider.udio;
  const canVoice = byProvider.elevenlabs;
  const fullyAutonomous = canRenderClips && (canScore || canVoice);

  const missing = providers.filter((p) => !p.present);
  const syncInstructions = missing.map((p) => ({
    provider: p.provider,
    role: p.role,
    action: `Set ${p.canonicalEnv} in the Vercel project (Settings → Environment Variables → Production), or any accepted alias: ${p.checkedAliases.join(', ')}`,
  }));

  return NextResponse.json({
    pipeline: '30-second-film',
    generatedAt: new Date().toISOString(),
    summary: {
      canRenderClips,
      canScore,
      canVoice,
      fullyAutonomous,
      verdict: !canRenderClips
        ? 'BLOCKED — LTX director key absent; no clips can render'
        : fullyAutonomous
          ? 'READY — full autonomous chain can fire'
          : 'PARTIAL — clips render; audio leg will use graceful fallback',
    },
    providers,
    syncInstructions,
    note: 'Names-only report. Presence reflects whether a non-empty value exists under an accepted alias; secret values are never read into the response. A present key can still be rejected by the provider at call time (e.g. 401) — this report confirms wiring, not validity.',
  });
}
