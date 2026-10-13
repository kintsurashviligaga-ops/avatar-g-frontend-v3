/**
 * tests/video-core-live/guard.ts — FAIL-CLOSED: the real-backend Video Core E2E may only ever talk to a Supabase stack
 * on this machine (the one `supabase start` brings up inside the CI runner). Owner rule 2026-10-12 19:05Z: "Production
 * Database არ გამოიყენო ტესტებისთვის … დაამატე Fail-Closed შემოწმება, რომელიც Production Supabase URL-ზე ტესტების
 * გაშვებას დაბლოკავს."
 *
 * The stack is reached as https://supabase.video-core-e2e.test:54443, a name under the reserved `.test` top-level
 * domain (RFC 6761: it never resolves on the public internet) that the workflow maps, in /etc/hosts, onto an address
 * it binds to this runner's loopback interface. That is the only way to give the server's media fetcher
 * (lib/web/publicFetch — it refuses loopback and private hosts, by design) a storage host it accepts without changing
 * the fetcher. So two checks, both throwing; nothing here defaults to "probably fine":
 *   · assertIsolatedSupabase (sync): an explicit opt-in, and every database-pointing variable names a loopback host
 *     or a `.test` host — never the Production ref, never a hosted *.supabase.* host, never anything else;
 *   · assertResolvesToThisMachine (async): the Supabase host resolves ONLY to addresses of this machine's own
 *     interfaces. A hosted project resolves to someone else's address and is refused.
 */
import { lookup } from 'node:dns/promises';
import { networkInterfaces } from 'node:os';

/** The Production project ref. Any URL or connection string that names it is refused outright. */
export const PRODUCTION_SUPABASE_REF = 'zwksnayknzggdcenqqxy';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const HOSTED_SUPABASE = /\.supabase\.(co|com|in|net)$/i;
/** RFC 6761 reserved: a `.test` name exists only where this machine's resolver says so. */
const RESERVED_TEST_TLD = /\.test$/i;

/** Every variable that can point the app or the tests at a database. All are checked, set or not. */
export const DATABASE_POINTING_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'E2E_SUPABASE_URL',
  'E2E_DB_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
] as const;

export class NotIsolatedError extends Error {
  constructor(message: string) {
    super(`[video-core-live] REFUSED — ${message}`);
    this.name = 'NotIsolatedError';
  }
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const isLocalName = (host: string) => LOOPBACK_HOSTS.has(host) || RESERVED_TEST_TLD.test(host);

/**
 * Throws unless the environment points ONLY at a local, throwaway Supabase:
 *  - VIDEO_CORE_LIVE_E2E must be exactly "1" (an explicit opt-in, never inferred);
 *  - NEXT_PUBLIC_SUPABASE_URL must be set and name a loopback host or a `.test` host;
 *  - no database-pointing variable may name the Production ref, a hosted *.supabase.* host, or any other host.
 */
export function assertIsolatedSupabase(env: NodeJS.ProcessEnv = process.env): { supabaseUrl: string; host: string } {
  if (env.VIDEO_CORE_LIVE_E2E !== '1') {
    throw new NotIsolatedError('VIDEO_CORE_LIVE_E2E is not "1"; this suite runs only inside the isolated CI job');
  }
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const appHost = hostOf(supabaseUrl);
  if (!appHost) throw new NotIsolatedError('NEXT_PUBLIC_SUPABASE_URL is missing or not a URL');
  for (const name of DATABASE_POINTING_VARS) {
    const value = env[name];
    if (!value) continue;
    if (value.toLowerCase().includes(PRODUCTION_SUPABASE_REF)) {
      throw new NotIsolatedError(`${name} names the Production project`);
    }
    const host = hostOf(value);
    if (host && HOSTED_SUPABASE.test(host)) throw new NotIsolatedError(`${name} points at a hosted Supabase host "${host}"`);
    if (host && !isLocalName(host)) throw new NotIsolatedError(`${name} host "${host}" is neither a loopback host nor a reserved .test name`);
  }
  assertPreviewTargets(env);
  return { supabaseUrl, host: appHost };
}

/** A quick tunnel of this run (cloudflared, no account): the only way a Vercel Preview reaches this run's stack. */
const TUNNEL_HOST = /^[a-z0-9-]+\.trycloudflare\.com$/i;
/** The per-run alias of the Preview deployment in the separate test project (never the site, never another project). */
const PREVIEW_HOST = /^vcore-e2e-[0-9a-f]{12}\.vercel\.app$/i;

/**
 * Preview mode (.github/workflows/video-core-preview-e2e.yml): the app under test is a Vercel Preview of this branch, and
 * it reaches the stack on this runner through a quick tunnel. Two more variables then point somewhere, and both are held
 * to the same rule: PLAYWRIGHT_BASE_URL is this machine or a `vcore-e2e-<nonce>.vercel.app` alias (never myavatar.ge or
 * any other host), E2E_APP_SUPABASE_URL is an https quick tunnel (never Production, never a hosted Supabase), and a
 * remote app comes with its tunnel or the run is refused.
 */
export function assertPreviewTargets(env: NodeJS.ProcessEnv = process.env): { preview: boolean } {
  const base = env.PLAYWRIGHT_BASE_URL ?? '';
  const tunnel = env.E2E_APP_SUPABASE_URL ?? '';
  for (const [name, value] of [['PLAYWRIGHT_BASE_URL', base], ['E2E_APP_SUPABASE_URL', tunnel]] as const) {
    if (value.toLowerCase().includes(PRODUCTION_SUPABASE_REF)) throw new NotIsolatedError(`${name} names the Production project`);
  }
  let preview = false;
  if (base) {
    const host = hostOf(base);
    if (!host) throw new NotIsolatedError('PLAYWRIGHT_BASE_URL is not a URL');
    if (!LOOPBACK_HOSTS.has(host)) {
      if (!base.startsWith('https://') || !PREVIEW_HOST.test(host)) {
        throw new NotIsolatedError(`PLAYWRIGHT_BASE_URL host "${host}" is neither this machine nor a vcore-e2e-<nonce>.vercel.app Preview`);
      }
      preview = true;
    }
  }
  if (tunnel) {
    const host = hostOf(tunnel);
    if (!host || !tunnel.startsWith('https://')) throw new NotIsolatedError('E2E_APP_SUPABASE_URL is not an https URL');
    if (HOSTED_SUPABASE.test(host)) throw new NotIsolatedError(`E2E_APP_SUPABASE_URL points at a hosted Supabase host "${host}"`);
    if (!TUNNEL_HOST.test(host)) throw new NotIsolatedError(`E2E_APP_SUPABASE_URL host "${host}" is not a quick tunnel of this run`);
  }
  if (preview && !tunnel) throw new NotIsolatedError('a Preview app needs E2E_APP_SUPABASE_URL (the tunnel to this run\'s stack)');
  return { preview };
}

/** Every address of this machine's own interfaces (lo first), lower-cased. */
function ownAddresses(): Set<string> {
  const own = new Set<string>(['127.0.0.1', '::1']);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) own.add(a.address.toLowerCase());
  }
  return own;
}

/**
 * Throws unless `host` resolves, and resolves ONLY, to addresses bound on this machine. `resolve` / `own` are
 * injectable for the unit test.
 */
export async function assertResolvesToThisMachine(
  host: string,
  resolve: (h: string) => Promise<Array<{ address: string }>> = (h) => lookup(h, { all: true }),
  own: () => Set<string> = ownAddresses,
): Promise<string[]> {
  const bare = host.replace(/^\[|\]$/g, '');
  let addrs: Array<{ address: string }>;
  try {
    addrs = await resolve(bare);
  } catch (e) {
    throw new NotIsolatedError(`"${bare}" does not resolve (${e instanceof Error ? e.message : String(e)})`);
  }
  if (addrs.length === 0) throw new NotIsolatedError(`"${bare}" resolves to nothing`);
  const mine = own();
  const foreign = addrs.map((a) => a.address.toLowerCase()).filter((a) => !a.startsWith('127.') && !mine.has(a));
  if (foreign.length > 0) throw new NotIsolatedError(`"${bare}" resolves to ${foreign.join(', ')}, which is not this machine`);
  return addrs.map((a) => a.address);
}
