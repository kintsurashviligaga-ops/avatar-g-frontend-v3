/**
 * lib/agent/browser/vercelHost.ts — the real BrowserHost: a Vercel Sandbox microVM started from the Chromium snapshot
 * (BROWSER_SNAPSHOT_ID, made once by scripts/agent-browser-snapshot.mjs). Every rule lives in ./runner; this only
 * translates.
 *
 * - Network: every public host (GG 2026-11-06 17:36Z "Public sites"), with the private / metadata ranges DENIED; a deny
 *   wins over the allow in Vercel's policy.
 * - Env: none. The browser gets no keys, no tokens, no cookies.
 * - Credentials: the deployment's own Vercel OIDC token, read by the SDK. Nothing stored here.
 */
import 'server-only';
import type { BrowserHost, BrowserHostSpec } from './runner';

/** Where the snapshot keeps playwright-core and where each task's files go. */
export const BROWSER_WORKDIR = '/vercel/sandbox/browser';

export interface BrowserSandboxLike {
  writeFiles(files: { path: string; content: string | Uint8Array }[]): Promise<void>;
  readFileToBuffer(file: { path: string }): Promise<Buffer | null>;
  runCommand(params: { cmd: string; args: string[]; cwd: string; env: Record<string, string>; signal: AbortSignal }):
    Promise<{ exitCode: number | null; stdout(): Promise<string>; stderr(): Promise<string> }>;
  stop(): Promise<unknown>;
}

export interface BrowserCreateParams {
  source: { type: 'snapshot'; snapshotId: string };
  resources: { vcpus: number };
  timeout: number;
  networkPolicy: { allow: string[]; subnets: { deny: string[] } };
  env: Record<string, never>;
}
export type BrowserCreate = (params: BrowserCreateParams) => Promise<BrowserSandboxLike>;

async function sdkCreate(params: BrowserCreateParams): Promise<BrowserSandboxLike> {
  const { Sandbox } = await import('@vercel/sandbox');
  // Typed against the SDK on purpose: if its shape drifts from BrowserSandboxLike, tsc fails here.
  const sbx: BrowserSandboxLike = await Sandbox.create({
    source: { type: 'snapshot', snapshotId: params.source.snapshotId },
    resources: params.resources,
    timeout: params.timeout,
    networkPolicy: { allow: [...params.networkPolicy.allow], subnets: { deny: [...params.networkPolicy.subnets.deny] } },
    env: {},
  });
  return sbx;
}

export function vercelBrowserHost(snapshotId: string, create: BrowserCreate = sdkCreate): BrowserHost {
  return {
    async create(spec: BrowserHostSpec) {
      const sbx = await create({
        source: { type: 'snapshot', snapshotId },
        resources: { vcpus: Math.max(1, Math.floor(spec.vcpus)) },
        timeout: spec.timeoutMs,
        networkPolicy: { allow: ['*'], subnets: { deny: [...spec.denySubnets] } },
        env: {},
      });
      return {
        async writeFile(path: string, content: string) {
          await sbx.writeFiles([{ path: `${BROWSER_WORKDIR}/${path}`, content }]);
        },
        async readBytes(path: string) {
          return sbx.readFileToBuffer({ path: `${BROWSER_WORKDIR}/${path}` });
        },
        async exec(cmd: string, args: string[], signal: AbortSignal) {
          const done = await sbx.runCommand({ cmd, args, cwd: BROWSER_WORKDIR, env: {}, signal });
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

/** The SDK calls the login host needs (a subset of @vercel/sandbox's Sandbox). */
export interface LoginSandboxLike extends BrowserSandboxLike {
  readonly name: string;
  runCommand(params: { cmd: string; args: string[]; cwd: string; env: Record<string, string>; signal: AbortSignal }):
    Promise<{ exitCode: number | null; stdout(): Promise<string>; stderr(): Promise<string> }>;
}
export interface LoginSdk {
  create(params: BrowserCreateParams): Promise<LoginSandboxLike>;
  get(name: string): Promise<LoginSandboxLike>;
  spawn(sbx: LoginSandboxLike, cmd: string, args: string[]): Promise<void>;
}

async function realLoginSdk(): Promise<LoginSdk> {
  const { Sandbox } = await import('@vercel/sandbox');
  return {
    async create(params) {
      return (await sdkCreate(params)) as unknown as LoginSandboxLike;
    },
    async get(name) {
      return (await Sandbox.get({ name })) as unknown as LoginSandboxLike;
    },
    async spawn(sbx, cmd, args) {
      await (sbx as unknown as InstanceType<typeof Sandbox>).runCommand({ cmd, args, cwd: BROWSER_WORKDIR, env: {}, detached: true });
    },
  };
}

/**
 * The login host (lib/agent/browser/login): the same snapshot, network and empty env as a task, but the sandbox is
 * found again by its name on each request, and the driver runs detached while the person logs in.
 */
export function vercelLoginHost(snapshotId: string, sdk: () => Promise<LoginSdk> = realLoginSdk): import('./login').LoginHost {
  const wrap = (api: LoginSdk, sbx: LoginSandboxLike): import('./login').LoginSandbox => ({
    name: sbx.name,
    async writeFile(path, content) { await sbx.writeFiles([{ path: `${BROWSER_WORKDIR}/${path}`, content }]); },
    async readBytes(path) { return sbx.readFileToBuffer({ path: `${BROWSER_WORKDIR}/${path}` }); },
    async spawn(cmd, args) { await api.spawn(sbx, cmd, args); },
    async stop() { await sbx.stop(); },
  });
  return {
    async create(spec) {
      const api = await sdk();
      const sbx = await api.create({
        source: { type: 'snapshot', snapshotId },
        resources: { vcpus: Math.max(1, Math.floor(spec.vcpus)) },
        timeout: spec.timeoutMs,
        networkPolicy: { allow: ['*'], subnets: { deny: [...spec.denySubnets] } },
        env: {},
      });
      return wrap(api, sbx);
    },
    async attach(name) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(name)) throw new Error('bad sandbox name');
      const api = await sdk();
      return wrap(api, await api.get(name));
    },
  };
}
