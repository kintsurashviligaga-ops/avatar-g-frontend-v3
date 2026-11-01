/**
 * lib/agent/sandbox/vercelHost.ts — the real SandboxHost: a Vercel Sandbox microVM (GG chose Vercel Sandbox
 * 2026-10-30 18:03Z; $20 cap 2026-10-31 16:17Z). Every rule lives in runner.ts; this file only translates.
 *
 * - Network: "deny-all" unless the plan names hosts, then only those hosts.
 * - Env: none. The sandbox gets no keys, no tokens, nothing from this server.
 * - Runtime: Vercel's managed python3.13 / node24 images.
 * - Credentials: the deployment's own Vercel OIDC token (VERCEL_OIDC_TOKEN), read by the SDK. Nothing is stored here.
 *
 * Not wired to any route. Using it spends real money, so it is created only behind SANDBOX_ENABLED and the shared
 * spend ledger (dbSpend.ts).
 */
import 'server-only';
import type { SandboxHandle, SandboxHost, SandboxHostSpec } from './runner';

const RUNTIME = { python: 'python3.13', node: 'node24' } as const;
const WORKDIR = '/vercel/sandbox';

/** The parts of @vercel/sandbox this file uses: a test passes a fake instead. */
export interface VercelSandboxLike {
  writeFiles(files: { path: string; content: string }[]): Promise<void>;
  runCommand(params: {
    cmd: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    signal: AbortSignal;
  }): Promise<{ exitCode: number | null; stdout(): Promise<string>; stderr(): Promise<string> }>;
  stop(): Promise<unknown>;
}
export type VercelCreate = (params: {
  runtime: string;
  resources: { vcpus: number };
  timeout: number;
  networkPolicy: 'deny-all' | { allow: string[] };
  env: Record<string, never>;
}) => Promise<VercelSandboxLike>;

async function sdkCreate(params: Parameters<VercelCreate>[0]): Promise<VercelSandboxLike> {
  const { Sandbox } = await import('@vercel/sandbox');
  // Typed against the SDK on purpose: if its shape drifts from VercelSandboxLike, tsc fails here.
  const sbx: VercelSandboxLike = await Sandbox.create(params);
  return sbx;
}

export function vercelHost(create: VercelCreate = sdkCreate): SandboxHost {
  return {
    async create(spec: SandboxHostSpec): Promise<SandboxHandle> {
      const sbx = await create({
        runtime: RUNTIME[spec.language],
        resources: { vcpus: Math.max(1, Math.floor(spec.vcpus)) },
        timeout: spec.timeoutMs,
        networkPolicy: spec.allowedDomains.length ? { allow: [...spec.allowedDomains] } : 'deny-all',
        env: {},
      });
      return {
        async writeFile(path, content) {
          await sbx.writeFiles([{ path: `${WORKDIR}/${path}`, content }]);
        },
        async exec(cmd, args, signal) {
          const done = await sbx.runCommand({ cmd, args, cwd: WORKDIR, env: {}, signal });
          const [stdout, stderr] = await Promise.all([done.stdout(), done.stderr()]);
          return { exitCode: done.exitCode ?? -1, stdout, stderr };
        },
        async stop() {
          await sbx.stop();
        },
      };
    },
  };
}
