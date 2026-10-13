/**
 * tests/video-core-live/_live.ts — what the real-backend specs share: the synthetic users the global setup made, the
 * local stack's REST and auth endpoints (service role for reading the truth, a user's own token for RLS checks), the
 * synthetic media files, and a frame counter that DECODES the video (ffmpeg-static has no ffprobe; metadata is not
 * trusted for frame counts).
 */
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { expect, type Page, type TestInfo } from '@playwright/test';

const run = promisify(execFile);

export const OUT_DIR = join(process.cwd(), 'test-results', 'video-core-live');
export const MEDIA_DIR = join(OUT_DIR, 'media');
export const STATE_DIR = join(OUT_DIR, 'state');
export const EVIDENCE_DIR = join(OUT_DIR, 'evidence');
export const FFMPEG = (ffmpegStatic as unknown as string | null) ?? 'ffmpeg';

export type UserKey = 'desktop' | 'mobile' | 'other' | 'payer';
export interface LiveUser { key: UserKey; email: string; id: string; admin: boolean }

export function liveUser(key: UserKey): LiveUser {
  const all = JSON.parse(process.env.E2E_USERS ?? '{}') as Record<UserKey, LiveUser>;
  const u = all[key];
  if (!u) throw new Error(`no synthetic user "${key}" (the global setup did not run?)`);
  return u;
}
/** The user a browser project runs as. */
export const projectUser = (info: TestInfo): LiveUser => liveUser(info.project.name.includes('mobile') ? 'mobile' : 'desktop');
/** Generated per run by the global setup; never printed, never stored outside this job. */
export const password = (): string => process.env.E2E_PASSWORD ?? '';

const url = (): string => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
/**
 * The Supabase address the APP under test was built with. In the CI job it is the same stack under the same name; in the
 * Preview job (video-core-preview-e2e.yml) the deployment reaches this runner's stack through a tunnel, so a storage
 * link the app must recognise as its own is written on the tunnel's host, while the tests themselves stay on loopback.
 */
export const appSupabaseUrl = (): string => (process.env.E2E_APP_SUPABASE_URL || url()).replace(/\/$/, '');
const anonKey = (): string => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = (): string => process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

type As = 'service' | 'anon' | { token: string };
function headers(as: As): Record<string, string> {
  if (as === 'service') return { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}` };
  if (as === 'anon') return { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` };
  return { apikey: anonKey(), Authorization: `Bearer ${as.token}` };
}

/** PostgREST on the local stack. */
export async function rest(path: string, as: As = 'service', init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${url()}/rest/v1/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers(as), ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep the text */ }
  return { status: res.status, body };
}

export async function rows<T = Record<string, unknown>>(path: string, as: As = 'service'): Promise<T[]> {
  const r = await rest(path, as);
  if (r.status !== 200 || !Array.isArray(r.body)) throw new Error(`GET ${path} as ${typeof as === 'string' ? as : 'user'} → ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body as T[];
}

export const rpc = (name: string, args: Record<string, unknown>, as: As = 'service') =>
  rest(`rpc/${name}`, as, { method: 'POST', body: JSON.stringify(args) });

/** A user's own access token, the way the browser gets one (password grant on the local auth server). */
export async function signInToken(email: string): Promise<string> {
  const res = await fetch(`${url()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey() },
    body: JSON.stringify({ email, password: password() }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; msg?: string };
  if (!res.ok || !j.access_token) throw new Error(`sign-in for ${email} → ${res.status} ${j.error_description ?? j.msg ?? ''}`);
  return j.access_token;
}

export async function balanceOf(userId: string): Promise<number> {
  const [p] = await rows<{ credits_balance: number }>(`profiles?id=eq.${userId}&select=credits_balance`);
  return p?.credits_balance ?? Number.NaN;
}

export interface LedgerRow { delta: number; reason: string; job_id: string | null; metadata: Record<string, unknown> | null; created_at: string }
export const ledgerOf = (userId: string) => rows<LedgerRow>(`credit_ledger?user_id=eq.${userId}&select=delta,reason,job_id,metadata,created_at&order=created_at.asc`);

export interface JobRow { id: string; status: string; service_type: string; error: string | null; params: Record<string, unknown>; result: Record<string, unknown> | null; signed_url: string | null; created_at: string }
export const jobsOf = (userId: string, sinceIso: string) =>
  rows<JobRow>(`generation_jobs?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id,status,service_type,error,params,result,signed_url,created_at&order=created_at.asc`);

export interface Decoded { frames: number; fps: number; durationSec: number; width: number; height: number; hasAudio: boolean }

/** Decode every video frame of `file` and count them; read fps, size and duration from the same pass. */
export async function decodedFrames(file: string): Promise<Decoded> {
  const { stderr } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-map', '0:v:0', '-f', 'null', '-progress', 'pipe:2', '-'], { maxBuffer: 64 * 1024 * 1024 })
    .catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }));
  const frameMatches = [...stderr.matchAll(/^frame=(\d+)$/gm)];
  const frames = frameMatches.length ? Number(frameMatches[frameMatches.length - 1]![1]) : 0;
  const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const durationSec = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
  const v = /Stream #\d+:\d+[^:]*: Video: [^\n]*?(\d{2,5})x(\d{2,5})[^\n]*?(\d+(?:\.\d+)?) fps/.exec(stderr);
  return {
    frames,
    durationSec,
    width: v ? Number(v[1]) : 0,
    height: v ? Number(v[2]) : 0,
    fps: v ? Number(v[3]) : 0,
    hasAudio: /Stream #\d+:\d+[^:]*: Audio:/.test(stderr),
  };
}

/** The mean loudness of the first `sec` seconds of `file`'s sound, in dB (ffmpeg's volumedetect). */
export async function meanVolumeDb(file: string, sec = 5): Promise<number> {
  const { stderr } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-t', String(sec), '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { maxBuffer: 16 * 1024 * 1024 })
    .catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }));
  const m = /mean_volume: (-?\d+(?:\.\d+)?) dB/.exec(stderr);
  return m ? Number(m[1]) : Number.NaN;
}

/** The mean luma (Y, 0–255) over every decoded frame of `file` (ffmpeg's signalstats), for "brighter" / "darker". */
export async function meanLuma(file: string): Promise<number> {
  const { stderr } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-map', '0:v:0', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 })
    .catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }));
  const ys = [...stderr.matchAll(/lavfi\.signalstats\.YAVG=(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Number.NaN;
}

/**
 * A synthetic file put into `userId`'s own upload folder (`uploads/<uid>/…`, the prefix lib/security/callerMedia
 * accepts as the caller's) with the service role of this run's stack, and a signed link to it written on the APP's
 * Supabase address, as the app hands such links back to the browser.
 */
export async function putOwnUpload(userId: string, file: string, name: string): Promise<{ path: string; url: string }> {
  const path = `${userId}/vc-billing/${name}`;
  const { readFile } = await import('node:fs/promises');
  const body = await readFile(join(MEDIA_DIR, file));
  const put = await fetch(`${url()}/storage/v1/object/uploads/${path}`, {
    method: 'POST',
    headers: { ...headers('service'), 'Content-Type': file.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4', 'x-upsert': 'true' },
    body,
  });
  if (!put.ok) throw new Error(`upload ${path} → ${put.status} ${(await put.text()).slice(0, 200)}`);
  const sign = await fetch(`${url()}/storage/v1/object/sign/uploads/${path}`, {
    method: 'POST',
    headers: { ...headers('service'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  const j = (await sign.json().catch(() => ({}))) as { signedURL?: string };
  if (!sign.ok || !j.signedURL) throw new Error(`sign ${path} → ${sign.status}`);
  return { path, url: `${appSupabaseUrl()}/storage/v1${j.signedURL.startsWith('/') ? '' : '/'}${j.signedURL}` };
}

/** Evidence the job uploads (JSON next to the report), one file per name. */
/** Keys and values that must never reach a file or the (public) CI log, even though every one here is local and throwaway. */
const SECRETISH_KEY = /token|secret|signature|password|apikey|authorization/i;
function redact(_key: string, value: unknown): unknown {
  // a number or a boolean under such a key is a status, not a secret (e.g. `sweepWithoutSecret: 401`)
  if (SECRETISH_KEY.test(_key) && typeof value !== 'number' && typeof value !== 'boolean') return '***';
  if (typeof value === 'string') return value.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***').replace(/([?&](?:token|sig|signature)=)[^&"\s]+/gi, '$1***');
  return value;
}

/** Writes test-results/video-core-live/evidence/<name>.json and prints the same, redacted, as one line of the CI log. */
export function evidence(name: string, data: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, `${name}.json`), `${JSON.stringify(data, redact, 2)}\n`);
  // eslint-disable-next-line no-console
  console.log(`[evidence] ${name} ${JSON.stringify(data, redact)}`);
}

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE_DIR, `${name}.png`) }).catch(() => undefined);
}

/** The studio, signed in (storage state from the setup project), on the chat, consent and tours out of the way. */
export async function openSignedInStudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* private mode */ }
  });
  await page.goto('/en/dashboard?tool=chat');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 30_000 });
}

export async function say(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(text);
  await box.press('Enter');
}

/** The paperclip → the OS file chooser → these synthetic files, then every chip Ready (real sign → PUT → verify). */
export async function attach(page: Page, isMobile: boolean, files: string[], expectReady = true): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  const clip = page.getByTestId('composer-attach');
  if (isMobile) await clip.tap(); else await clip.click();
  await (await chooser).setFiles(files.map((f) => join(MEDIA_DIR, f)));
  const chips = page.getByTestId('composer-attachment');
  await expect(chips).toHaveCount(files.length, { timeout: 30_000 });
  if (!expectReady) return;
  for (let i = 0; i < files.length; i++) await expect(chips.nth(i)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}
