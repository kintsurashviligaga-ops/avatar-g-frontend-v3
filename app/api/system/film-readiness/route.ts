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
import { computeEditorReadiness, editorVerdict, editorSyncInstructions } from '@/lib/chat/filmReadiness';

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
  const generationAutonomous = canRenderClips && (canScore || canVoice);

  // PHASE 56 §1 — cover the FINAL leg: clips alone are not a film. The editor /
  // assembler must be able to stitch the timeline AND host the master, or the
  // user pays for a render that never yields a downloadable URL. Compute it
  // from the same env contract the assemble route enforces at call time.
  const editor = computeEditorReadiness();
  const canDeliverMaster = editor.canDeliverMaster;

  // "Fully autonomous" now means the WHOLE chain — generate, stitch, AND
  // deliver. The old generation-only field is preserved under its own name so
  // nothing that read it breaks.
  const fullyAutonomous = generationAutonomous && canDeliverMaster;

  const missing = providers.filter((p) => !p.present);
  const providerSync = missing.map((p) => ({
    provider: p.provider,
    role: p.role,
    action: `Set ${p.canonicalEnv} in the Vercel project (Settings → Environment Variables → Production), or any accepted alias: ${p.checkedAliases.join(', ')}`,
  }));
  const editorSync = editorSyncInstructions(editor).map((e) => ({
    provider: 'editor' as const,
    role: e.leg,
    action: e.action,
  }));
  const syncInstructions = [...providerSync, ...editorSync];

  // Whole-chain verdict: a missing LTX key or an un-hostable master both mean
  // the user cannot receive a finished film, so both are BLOCKED.
  const verdict = !canRenderClips
    ? 'BLOCKED — LTX director key absent; no clips can render'
    : !canDeliverMaster
      ? `BLOCKED (delivery) — clips render but ${editorVerdict(editor).replace(/^BLOCKED — /, '')}`
      : fullyAutonomous
        ? 'READY — full autonomous chain can fire end-to-end (generate → stitch → deliver)'
        : 'PARTIAL — clips render + master delivers; audio leg will use graceful fallback';

  return NextResponse.json({
    pipeline: '30-second-film',
    generatedAt: new Date().toISOString(),
    summary: {
      canRenderClips,
      canScore,
      canVoice,
      canDeliverMaster,
      stitchPath: editor.stitchPath,
      generationAutonomous,
      fullyAutonomous,
      verdict,
    },
    providers,
    editor: {
      ...editor,
      verdict: editorVerdict(editor),
      note:
        'The assemble route picks the GPU RunPod worker when configured, else stitches on-node with the bundled CPU FFmpeg binary (always available). A playable master REQUIRES Supabase Storage (master hosting); REPLICATE_API_TOKEN arms clip failover + the silent-film score rescue.',
    },
    syncInstructions,
    note: 'Names-only report. Presence reflects whether a non-empty value exists under an accepted alias; secret values are never read into the response. A present key can still be rejected by the provider at call time (e.g. 401) — this report confirms wiring, not validity.',
  });
}
