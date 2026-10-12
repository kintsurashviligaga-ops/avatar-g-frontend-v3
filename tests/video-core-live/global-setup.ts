/**
 * The real-backend E2E's global setup. In order, and every step throws on failure:
 *   1. the fail-closed guard (./guard): an explicit opt-in, every database variable naming this machine, and the stack's
 *      host resolving only to this machine's own addresses — the Production project can never be reached from here;
 *   2. synthetic users through the local auth server's admin API (service role of the LOCAL stack): two admins (one per
 *      browser project) and one ordinary user for the access-denial checks, all with one password generated here, for
 *      this run only (handed to the workers through the environment, never printed or written to disk);
 *   3. synthetic media rendered by ffmpeg-static: two clips, a beat track, a clip with sound for the edits, a file that
 *      is not audio, and a truncated clip that passes the upload's byte sniff but cannot be decoded.
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { assertIsolatedSupabase, assertResolvesToThisMachine } from './guard';
import { EVIDENCE_DIR, FFMPEG, MEDIA_DIR, STATE_DIR, type LiveUser, type UserKey } from './_live';

const run = promisify(execFile);

async function makeUser(base: string, serviceKey: string, key: UserKey, admin: boolean, pw: string, tag: string): Promise<LiveUser> {
  const email = `vc-e2e-${key}-${tag}@example.com`;
  const res = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      email,
      password: pw,
      email_confirm: true,
      user_metadata: { password_set: true, full_name: `Video Core E2E ${key}` },
      ...(admin ? { app_metadata: { role: 'admin' } } : {}),
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string; user?: { id?: string }; msg?: string; error?: string };
  const id = j.id ?? j.user?.id;
  if (!res.ok || !id) throw new Error(`could not create the synthetic user ${key}: ${res.status} ${j.msg ?? j.error ?? ''}`);
  return { key, email, id, admin };
}

async function ffmpeg(args: string[]): Promise<void> {
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 16 * 1024 * 1024 });
}

async function makeMedia(): Promise<void> {
  rmSync(MEDIA_DIR, { recursive: true, force: true });
  mkdirSync(MEDIA_DIR, { recursive: true });
  const m = (f: string) => join(MEDIA_DIR, f);
  const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30'];
  // Two vertical clips that look different (the per-clip QC compares the master with each source), 4 s each, with sound.
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4',
    ...h264, '-c:a', 'aac', '-shortest', m('clip-a.mp4')]);
  await ffmpeg(['-f', 'lavfi', '-i', 'smptehdbars=size=720x1280:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=550:duration=4',
    ...h264, '-c:a', 'aac', '-shortest', m('clip-b.mp4')]);
  // A beat track: 120 BPM clicks over a quiet tone, 8 s, MP3.
  await ffmpeg(['-f', 'lavfi', '-i', "aevalsrc='0.15*sin(2*PI*196*t)+0.8*sin(2*PI*880*t)*lt(mod(t\\,0.5)\\,0.06)':s=44100:d=8",
    '-c:a', 'libmp3lame', '-b:a', '128k', m('beat.mp3')]);
  // The edits' source: 6 s, 30 fps, 1280x720, with sound.
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    ...h264, '-c:a', 'aac', '-shortest', m('edit-source.mp4')]);
  // A longer clip pair for Stop (enough work that Stop lands while it renders): 1080x1920, 12 s each.
  await ffmpeg(['-f', 'lavfi', '-i', 'smptehdbars=size=1080x1920:rate=30:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=262:duration=12',
    ...h264, '-c:a', 'aac', '-shortest', m('long-a.mp4')]);
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=392:duration=12',
    ...h264, '-c:a', 'aac', '-shortest', m('long-b.mp4')]);
  await ffmpeg(['-f', 'lavfi', '-i', "aevalsrc='0.15*sin(2*PI*196*t)+0.8*sin(2*PI*880*t)*lt(mod(t\\,0.5)\\,0.06)':s=44100:d=24",
    '-c:a', 'libmp3lame', '-b:a', '128k', m('long-beat.mp3')]);
  // Not audio at all, named like a song.
  writeFileSync(m('not-a-song.mp3'), 'this is a text file, not an mp3\n'.repeat(64));
  // A clip cut off at 40 %: the upload's sniff sees an MP4 header, but there is no index (moov) to decode it with.
  const whole = readFileSync(m('clip-a.mp4'));
  writeFileSync(m('truncated.mp4'), whole.subarray(0, Math.floor(whole.length * 0.4)));
}

export default async function globalSetup(): Promise<void> {
  const { supabaseUrl, host } = assertIsolatedSupabase(process.env);
  const addrs = await assertResolvesToThisMachine(host);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('the local stack keys are not in the environment');

  mkdirSync(STATE_DIR, { recursive: true });
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const base = supabaseUrl.replace(/\/$/, '');
  const pw = randomBytes(24).toString('base64url');
  const tag = randomBytes(4).toString('hex');
  const users: Record<UserKey, LiveUser> = {
    desktop: await makeUser(base, serviceKey, 'desktop', true, pw, tag),
    mobile: await makeUser(base, serviceKey, 'mobile', true, pw, tag),
    other: await makeUser(base, serviceKey, 'other', false, pw, tag),
  };
  process.env.E2E_PASSWORD = pw;
  process.env.E2E_USERS = JSON.stringify(users);
  await makeMedia();
  writeFileSync(join(EVIDENCE_DIR, 'setup.json'), `${JSON.stringify({
    stack: base, resolvesTo: addrs, users: Object.values(users).map((u) => ({ key: u.key, id: u.id, admin: u.admin })),
    at: new Date().toISOString(),
  }, null, 2)}\n`);
}
