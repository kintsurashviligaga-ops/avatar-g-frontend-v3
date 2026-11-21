/**
 * lib/env/launchFlags.ts — every launch-feature switch, its EXACT name and the EXACT values its reader accepts
 * (Phase 8.14 pre-flight, 2026-11-21).
 *
 * ⚠️ THE FLAGS DO NOT SHARE ONE VOCABULARY. Each feature's reader was written on its own branch, and they differ:
 *   STUDIO_3D_V2 / MONTAGE_SMART_EDITOR / DIRECTORS_WORKFLOW / IMAGE_ART_DIRECTOR / MUSIC_PRODUCER_V2 / AVATAR_STUDIO_V2
 *       accept only `admin` or `everyone`. `1`, `true`, `on`, `all` and even `admins` are OFF.
 *   AGENT_REEL_TASK accepts only `admins` or `everyone` (`admin` without the s is OFF).
 *   CONNECTORS_* / AGENT_PLUGINS / AGENT_G_* accept `admin` or `1`/`true`/`on` (`everyone` is OFF).
 *   BROWSER_ENABLED / SANDBOX_ENABLED / AGENT_BROWSER_LOGIN / NEXT_PUBLIC_AGENT_PLUGINS accept only `1`, exactly.
 *   NEXT_PUBLIC_PRICING_V8 / ADMIN_FINANCE_DASHBOARD accept `on`, `1`, `true` exactly (`TRUE` is OFF).
 *   CONNECTORS_DRIVE accepts `admin` but not `admins`; CONNECTORS_NOTION / CONNECTORS_GITHUB accept both.
 * A wrong value in Vercel leaves the feature silently OFF. This registry is the one list to set them from
 * (docs/launch/ENV_REGISTRY.md is generated from it), and `checkLaunchFlags` names every value a reader would
 * ignore, a misspelt name, and a server flag set without its NEXT_PUBLIC_ twin (the UI stays hidden).
 *
 * Read-only and dependency-free: it never changes what any reader decides. The vocabularies were checked against
 * each reader on the combined launch branch (claude/throwaway-launch-combined d3a8b51e) on 2026-11-21.
 */

/** The values a reader treats as ON. Anything else (including unset) is OFF. */
export type Vocab =
  | 'admin|everyone'
  | 'admins|everyone'
  | 'admin|admins|everyone|on|1|true'
  | 'admin|admins'
  | 'admin|1|true|on'
  | 'admin|admins|1|true|on|all'
  | 'admin|1|true|on|all'
  | 'everyone'
  | '1'
  | '1|true|on'
  | '1|true|on|yes'
  | 'value';

export interface LaunchFlag {
  name: string;
  feature: string;
  /** server = read in routes / server code; client = NEXT_PUBLIC_, inlined at BUILD time (a change needs a redeploy). */
  side: 'server' | 'client';
  vocab: Vocab;
  /** The NEXT_PUBLIC_ twin that shows the UI (server flags) or the server flag it mirrors (client flags). */
  twin?: string;
  /** Where the reader lives (PR number while it is still a draft). */
  where: string;
  /** Holds a secret: report presence only, never the value. */
  secret?: boolean;
  /** The reader compares the raw value exactly: no trimming, no lower-casing (`TRUE` or ` 1` is OFF). */
  exact?: boolean;
  note?: string;
}

const onWords: Record<Vocab, readonly string[] | null> = {
  'admin|everyone': ['admin', 'everyone'],
  'admins|everyone': ['admins', 'everyone'],
  'admin|admins|everyone|on|1|true': ['admin', 'admins', 'everyone', 'on', '1', 'true'],
  'admin|admins': ['admin', 'admins'],
  'admin|1|true|on': ['admin', '1', 'true', 'on'],
  'admin|admins|1|true|on|all': ['admin', 'admins', '1', 'true', 'on', 'all'],
  'admin|1|true|on|all': ['admin', '1', 'true', 'on', 'all'],
  everyone: ['everyone', 'admins'],
  '1': ['1'],
  '1|true|on': ['1', 'true', 'on'],
  '1|true|on|yes': ['1', 'true', 'on', 'yes'],
  value: null,
};

export const LAUNCH_FLAGS: readonly LaunchFlag[] = [
  // ── 3D Studio (Phase 8.8, #366 → #367 → #369) ──
  { name: 'STUDIO_3D_V2', feature: '3D Studio', side: 'server', vocab: 'admin|everyone', twin: 'NEXT_PUBLIC_STUDIO_3D_V2', where: 'lib/studio3d/flag.ts (#366)' },
  { name: 'NEXT_PUBLIC_STUDIO_3D_V2', feature: '3D Studio', side: 'client', vocab: 'admin|everyone', twin: 'STUDIO_3D_V2', where: 'components/studio3d/useStudio3dAvailable.ts (#369)' },
  { name: 'STUDIO_3D_JOB', feature: '3D Studio', side: 'server', vocab: 'value', where: 'lib/studio3d/server/deps.ts (#367)', note: 'Cloud Run job name of the GPU worker.' },
  { name: 'STUDIO_3D_REGION', feature: '3D Studio', side: 'server', vocab: 'value', where: 'lib/studio3d/server/deps.ts (#367)', note: 'europe-west4 (where the GPU quota is).' },
  { name: 'STUDIO_3D_GCP_PROJECT', feature: '3D Studio', side: 'server', vocab: 'value', where: 'lib/studio3d/server/deps.ts (#367)', note: 'Defaults to GCP_PROJECT_ID.' },
  { name: 'STUDIO_3D_TIMEOUT_SEC', feature: '3D Studio', side: 'server', vocab: 'value', where: 'lib/studio3d/server/deps.ts (#367)', note: 'GPU task timeout; a stuck GPU never bills longer.' },
  { name: 'STUDIO_3D_DAILY_CAP', feature: '3D Studio', side: 'server', vocab: 'value', where: 'lib/studio3d/server/deps.ts (#367)', note: 'Jobs per UTC day for the whole site; default 200.' },
  // ── Smart Editor (Phase 8.7, #365 → #368 → #370) ──
  { name: 'MONTAGE_SMART_EDITOR', feature: 'Smart Editor', side: 'server', vocab: 'admin|everyone', twin: 'NEXT_PUBLIC_MONTAGE_SMART_EDITOR', where: 'lib/services/montage/smart/flag.ts (#365)' },
  { name: 'NEXT_PUBLIC_MONTAGE_SMART_EDITOR', feature: 'Smart Editor', side: 'client', vocab: 'admin|everyone', twin: 'MONTAGE_SMART_EDITOR', where: 'lib/services/montage/smart/flag.ts (#365)' },
  // ── Director's Workflow, Art Director, Music Producer, Avatar Studio ──
  { name: 'DIRECTORS_WORKFLOW', feature: "Director's Workflow", side: 'server', vocab: 'admin|everyone', where: 'lib/video/directorsWorkflow/flag.ts (#349)' },
  { name: 'IMAGE_ART_DIRECTOR', feature: 'Art Director image', side: 'server', vocab: 'admin|everyone', twin: 'NEXT_PUBLIC_IMAGE_ART_DIRECTOR', where: 'lib/image/artDirector/flag.ts (#356)' },
  { name: 'NEXT_PUBLIC_IMAGE_ART_DIRECTOR', feature: 'Art Director image', side: 'client', vocab: 'admin|everyone', twin: 'IMAGE_ART_DIRECTOR', where: 'lib/image/artDirector/chat.ts (#356)' },
  { name: 'MUSIC_PRODUCER_V2', feature: 'Music Producer', side: 'server', vocab: 'admin|everyone', twin: 'NEXT_PUBLIC_MUSIC_PRODUCER_V2', where: 'lib/music/producer/flag.ts (#359)' },
  { name: 'NEXT_PUBLIC_MUSIC_PRODUCER_V2', feature: 'Music Producer', side: 'client', vocab: 'admin|everyone', twin: 'MUSIC_PRODUCER_V2', where: 'lib/music/producer/flag.ts (#359)' },
  { name: 'AVATAR_STUDIO_V2', feature: 'Virtual Studio avatar', side: 'server', vocab: 'admin|everyone', twin: 'NEXT_PUBLIC_AVATAR_STUDIO_V2', where: 'lib/avatar/studio/flag.ts (#362)' },
  { name: 'NEXT_PUBLIC_AVATAR_STUDIO_V2', feature: 'Virtual Studio avatar', side: 'client', vocab: 'admin|everyone', twin: 'AVATAR_STUDIO_V2', where: 'lib/avatar/studio/flag.ts (#362)' },
  // ── Pricing v8 (Phase 8.1, #343 → #351 → #353 → #354, #344, #345) — billing: GG's own card ──
  { name: 'NEXT_PUBLIC_PRICING_V8', exact: true, feature: 'Pricing v8', side: 'client', vocab: '1|true|on', where: 'lib/credits/priceBook.ts (#351)', note: 'Read by the server too (checkout, price book). Billing: turn on only by GG card after the v8 SQL.' },
  { name: 'ADMIN_FINANCE_DASHBOARD', exact: true, feature: 'Founder finance dashboard', side: 'server', vocab: '1|true|on', where: 'lib/billing/margin/flags.ts (#344)' },
  // ── Browser agent and sandbox (in prod for admins) ──
  { name: 'BROWSER_ENABLED', exact: true, feature: 'Browser agent', side: 'server', vocab: '1', where: 'lib/agent/browser', note: 'Needs BROWSER_SNAPSHOT_ID too.' },
  { name: 'BROWSER_SNAPSHOT_ID', feature: 'Browser agent', side: 'server', vocab: 'value', where: 'lib/agent/browser', note: 'Vercel Sandbox snapshot; expires (remade 2026-11-12, expires 2026-12-12).' },
  { name: 'SANDBOX_ENABLED', exact: true, feature: 'Browser agent / code run', side: 'server', vocab: '1', where: 'lib/agent/sandbox' },
  { name: 'AGENT_G_SANDBOX', feature: 'Browser agent / code run', side: 'server', vocab: 'admin|1|true|on', where: 'lib/agent/media/access.ts' },
  { name: 'AGENT_BROWSER_LOGIN', exact: true, feature: 'Browser login', side: 'server', vocab: '1', where: 'lib/agent/browser (#346)', note: 'Also needs AGENT_BROWSER_VAULT_KEY.' },
  { name: 'AGENT_BROWSER_VAULT_KEY', feature: 'Browser login', side: 'server', vocab: 'value', secret: true, where: 'lib/agent/browser (#346)' },
  { name: 'AGENT_BROWSER_AGENT', feature: 'Browser agent v2 / App Builder', side: 'server', vocab: 'admin|admins', where: 'lib/agent/phase4/flags.ts (#312)', note: 'Admins only by design; there is no everyone value.' },
  { name: 'AGENT_APP_BUILDER', feature: 'Browser agent v2 / App Builder', side: 'server', vocab: 'admin|admins', where: 'lib/agent/phase4/flags.ts (#312)' },
  { name: 'AGENT_SANDBOX_PACKAGES', feature: 'Browser agent v2 / App Builder', side: 'server', vocab: 'admin|admins', where: 'lib/agent/phase4/flags.ts (#312)' },
  // ── Agent G engine, Reel, media ──
  { name: 'AGENT_VALIDATE', feature: 'Agent G engine', side: 'server', vocab: '1|true|on', where: 'lib/agent/run/engineFlags.ts (#309)' },
  { name: 'AGENT_ENGINE_MEDIA', feature: 'Agent G engine', side: 'server', vocab: 'admin|admins|everyone|on|1|true', where: 'lib/agent/run/engineFlags.ts (#310)' },
  { name: 'AGENT_REEL_TASK', feature: 'Reel task', side: 'server', vocab: 'admins|everyone', where: 'lib/agent/engine/reel.ts (#393)', note: 'admins WITH the s. admin is OFF here.' },
  { name: 'AGENT_G_MEDIA_EXEC', feature: 'Agent G media', side: 'server', vocab: 'admin|1|true|on', where: 'lib/agent/media/access.ts' },
  { name: 'AGENT_G_FILE_ANALYSIS', feature: 'Agent G media', side: 'server', vocab: 'admin|1|true|on', where: 'lib/agent/media/access.ts' },
  // ── Plugins and connectors (#390 → #392) ──
  { name: 'AGENT_PLUGINS', feature: 'Agent G plugins', side: 'server', vocab: 'admin|admins|1|true|on|all', twin: 'NEXT_PUBLIC_AGENT_PLUGINS', where: 'lib/agent/plugins/live.ts (#392)' },
  { name: 'NEXT_PUBLIC_AGENT_PLUGINS', exact: true, feature: 'Agent G plugins', side: 'client', vocab: '1', twin: 'AGENT_PLUGINS', where: 'components/studio/PluginsList.tsx (#392)' },
  { name: 'CONNECTORS_DRIVE', feature: 'Google Drive', side: 'server', vocab: 'admin|1|true|on|all', where: 'lib/connectors/google/access.ts', note: 'Prod today: admin.' },
  { name: 'CONNECTORS_NOTION', feature: 'Notion', side: 'server', vocab: 'admin|admins|1|true|on|all', where: 'lib/connectors/oauth/access.ts (#392)', note: 'Needs NOTION_OAUTH_CLIENT_ID/SECRET, CONNECTOR_TOKEN_KEY and migration 20261120a.' },
  { name: 'CONNECTORS_GITHUB', feature: 'GitHub', side: 'server', vocab: 'admin|admins|1|true|on|all', where: 'lib/connectors/oauth/access.ts (#392)', note: 'Needs GITHUB_OAUTH_CLIENT_ID/SECRET, CONNECTOR_TOKEN_KEY and migration 20261120a.' },
  { name: 'CONNECTOR_TOKEN_KEY', feature: 'Connectors', side: 'server', vocab: 'value', secret: true, where: 'lib/connectors' },
  { name: 'NOTION_OAUTH_CLIENT_ID', feature: 'Notion', side: 'server', vocab: 'value', where: 'lib/connectors/notion (#392)' },
  { name: 'NOTION_OAUTH_CLIENT_SECRET', feature: 'Notion', side: 'server', vocab: 'value', secret: true, where: 'lib/connectors/notion (#392)' },
  { name: 'GITHUB_OAUTH_CLIENT_ID', feature: 'GitHub', side: 'server', vocab: 'value', where: 'lib/connectors/github (#392)' },
  { name: 'GITHUB_OAUTH_CLIENT_SECRET', feature: 'GitHub', side: 'server', vocab: 'value', secret: true, where: 'lib/connectors/github (#392)' },
  // ── Live ──
  { name: 'LIVE_AUDIENCE', feature: 'Live voice', side: 'server', vocab: 'everyone', where: 'lib/voice/liveAudience.ts', note: 'Anything but everyone = admins. Prod today: everyone.' },
  { name: 'LIVE_AVATAR_AUDIENCE', feature: 'Live avatar', side: 'server', vocab: 'everyone', where: 'lib/voice/liveAudience.ts', note: 'Anything but everyone = admins. Prod today: everyone.' },
  // ── Smaller launch switches ──
  { name: 'AUTH_LOCAL_CLAIMS', feature: 'Local JWT check', side: 'server', vocab: '1|true|on|yes', where: 'lib/supabase/localClaims.ts (#339)' },
  { name: 'TASK_RELAY_TICKET', feature: 'Task relay ticket', side: 'server', vocab: '1|true|on|yes', where: '#340' },
  { name: 'CHAT_MEDIA_RENEW', feature: 'Chat media renew', side: 'server', vocab: '1|true|on|yes', where: '#331' },
  { name: 'CLIP_ADVANCED', feature: 'Video advanced options', side: 'server', vocab: '1|true|on|yes', twin: 'NEXT_PUBLIC_CLIP_ADVANCED', where: '#320' },
  { name: 'NEXT_PUBLIC_CLIP_ADVANCED', feature: 'Video advanced options', side: 'client', vocab: '1|true|on|yes', twin: 'CLIP_ADVANCED', where: '#320' },
  { name: 'CLIP_LAST_FRAME', feature: 'Video last frame', side: 'server', vocab: '1|true|on|yes', twin: 'NEXT_PUBLIC_CLIP_LAST_FRAME', where: '#323' },
  { name: 'NEXT_PUBLIC_CLIP_LAST_FRAME', feature: 'Video last frame', side: 'client', vocab: '1|true|on|yes', twin: 'CLIP_LAST_FRAME', where: '#323' },
  { name: 'NEXT_PUBLIC_MUSIC_UX_V2', feature: 'Music UX v2', side: 'client', vocab: '1|true|on|yes', where: '#329' },
  { name: 'NEXT_PUBLIC_INTERIOR_UX_V2', feature: 'Interior UX v2', side: 'client', vocab: '1|true|on|yes', where: '#330' },
  { name: 'READ_ALOUD_VOICE_V2', feature: 'Read-aloud voice v2', side: 'server', vocab: '1|true|on|yes', where: '#322' },
  { name: 'SAFETY_IDENTIFIER', feature: 'Safety identifier', side: 'server', vocab: '1', where: '#371', note: 'Also needs SAFETY_IDENTIFIER_SALT.' },
  { name: 'NEXT_PUBLIC_CLIENT_ERROR_REPORTS', feature: 'Client error reports', side: 'client', vocab: '1', where: 'lib/observability/clientErrorReports (#388)', note: '#388 is NOT in the launch merge set yet.' },
];

const byName = new Map(LAUNCH_FLAGS.map((f) => [f.name, f]));
export const launchFlag = (name: string): LaunchFlag | undefined => byName.get(name);

/** Does this reader treat `value` as ON? (Case and spaces ignored, as every reader does.) */
export function flagIsOn(flag: LaunchFlag, value: string | undefined): boolean {
  const words = onWords[flag.vocab];
  const v = flag.exact ? (value ?? '') : (value ?? '').trim().toLowerCase();
  if (!words) return v !== '';
  return words.includes(v);
}

export const acceptedValues = (flag: LaunchFlag): string => (onWords[flag.vocab] ?? ['any value']).join(' | ');

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Words a person types meaning "off": they are never a mistake. */
const OFF_WORDS = new Set(['', '0', 'off', 'false', 'no']);

export interface FlagWarning {
  name: string;
  kind: 'ignored_value' | 'misspelt_name' | 'missing_twin' | 'twin_mismatch';
  message: string;
}

/**
 * Every launch switch a reader would read differently from what was meant. Values of secret entries are never
 * echoed. Pure: give it any env map.
 */
export function checkLaunchFlags(env: Readonly<Record<string, string | undefined>> = process.env): FlagWarning[] {
  const out: FlagWarning[] = [];
  const known = new Set(LAUNCH_FLAGS.map((f) => f.name));
  const squashed = new Map(LAUNCH_FLAGS.map((f) => [squash(f.name), f.name]));

  for (const f of LAUNCH_FLAGS) {
    const raw = env[f.name];
    if (raw === undefined || f.vocab === 'value') continue;
    const v = raw.trim().toLowerCase();
    if (!flagIsOn(f, raw) && (!OFF_WORDS.has(v) || (f.exact && raw !== raw.trim()))) {
      out.push({
        name: f.name,
        kind: 'ignored_value',
        message: `${f.name}=${JSON.stringify(raw)} is read as OFF. It accepts: ${acceptedValues(f)}.`,
      });
    }
  }

  for (const key of Object.keys(env)) {
    if (known.has(key)) continue;
    const match = squashed.get(squash(key));
    if (match) out.push({ name: key, kind: 'misspelt_name', message: `${key} is set, but the code reads ${match}.` });
  }

  for (const f of LAUNCH_FLAGS) {
    if (f.side !== 'server' || !f.twin) continue;
    const twin = byName.get(f.twin);
    if (!twin) continue;
    const serverOn = flagIsOn(f, env[f.name]);
    const clientOn = flagIsOn(twin, env[twin.name]);
    if (serverOn && !clientOn) {
      out.push({ name: f.name, kind: 'missing_twin', message: `${f.name} is on but ${twin.name} is not, so nobody sees the feature. Set both, then redeploy.` });
    } else if (!serverOn && clientOn) {
      out.push({ name: twin.name, kind: 'twin_mismatch', message: `${twin.name} is on but ${f.name} is not: the button shows and the server answers 404.` });
    }
  }
  return out;
}

/** One row per switch for the admin check: on/off as the reader sees it; secrets say only set / not set. */
export function launchFlagStatus(env: Readonly<Record<string, string | undefined>> = process.env) {
  return LAUNCH_FLAGS.map((f) => {
    const raw = env[f.name];
    const set = raw !== undefined && raw.trim() !== '';
    return {
      name: f.name,
      feature: f.feature,
      side: f.side,
      set,
      on: f.vocab === 'value' ? set : flagIsOn(f, raw),
      value: f.secret || f.vocab === 'value' ? undefined : (raw ?? '').trim(),
      accepts: acceptedValues(f),
    };
  });
}
