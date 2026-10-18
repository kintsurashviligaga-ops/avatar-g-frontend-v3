/**
 * tests/music-studio-live/_music.ts — what the Music Studio real-backend specs share (on top of ../video-core-live/_live:
 * the synthetic users, REST as service / anon / a user, the ledger and job readers, evidence and screenshots).
 *
 * The provider is the isolated E2E's stand-in (lib/music/studio/e2eProvider): a synthetic ffmpeg MP3, never Lyria.
 * Everything else is the branch's real code on a throwaway local Supabase stack.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, type Locator, type Page } from '@playwright/test';
import { FFMPEG, logExpensive, paced, rows } from '../video-core-live/_live';

const run = promisify(execFile);

export const MUSIC_PRICE = 5;
export const STUDIO_REF = (jobId: string) => `music-studio-v1:${jobId}`;

export interface AudioFacts { durationSec: number; codec: string | null; sampleRate: number | null; channels: string | null; maxDb: number }

/** Decode the whole file with ffmpeg: its length, codec, rate, channels and peak (volumedetect). */
export async function audioFacts(file: string): Promise<AudioFacts> {
  const { stderr } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { maxBuffer: 32 * 1024 * 1024 })
    .catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }));
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const a = /Stream #\d+:\d+[^:]*: Audio: ([a-z0-9_]+)[^,\n]*,\s*(\d+) Hz,\s*([a-z0-9.() ]+?)(?:,|\n)/i.exec(stderr);
  const m = /max_volume: (-?\d+(?:\.\d+)?|-inf) dB/.exec(stderr);
  return {
    durationSec: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    codec: a?.[1] ?? null,
    sampleRate: a ? Number(a[2]) : null,
    channels: a?.[3]?.trim() ?? null,
    maxDb: m ? (m[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(m[1])) : Number.NaN,
  };
}

/** The studio signed in, on the chat (consent and tours out of the way). */
export async function openStudio(page: Page, locale: 'en' | 'ka' | 'ru' = 'en', tool: 'chat' | 'music' = 'chat'): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
      // These journeys drive the Lyrics and Styles fields: Advanced, as someone who chose it (a first visit opens Simple).
      localStorage.setItem('myavatar:music-ui-mode', 'advanced');
    } catch { /* private mode */ }
  });
  await page.goto(`/${locale}/dashboard?tool=${tool}`);
  await studioReady(page);
}

/**
 * Signed in AND the studio's live-action listener mounted. `data-authed` is set by the identity provider, before
 * OmniStudio's code has mounted: a call dispatched in that gap is not taken (run 38550746462: the RU plan, 4 ms after
 * `data-authed`, answered took=false / reply=null, so no card). The probe is `status` — read-only, never a card or a charge.
 */
export async function studioReady(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 90_000 });
  // History is uid-scoped (lib/chat/historyKeys): ChatChrome publishes data-authed BEFORE data-uid, and a turn made in that
  // gap is filed in the guest archive (run 38557521565, phone: `conversations::anon`). That shared-chat race is recorded in
  // docs/handoffs/music-studio/PHASE2_STATE.md (patch proposal, not applied); the specs start once the uid is known.
  await expect(page.locator('html')).toHaveAttribute('data-uid', /^[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect.poll(async () => (await voice(page, { action: 'status' })).took, { timeout: 60_000 }).toBe(true);
}

export interface VoiceAnswer { took: boolean; reply: { ok?: boolean; error?: string; message?: string; state?: Record<string, unknown> } | null }

/**
 * A validated Live Voice `music_studio` call, exactly as the call's executor hands it to the studio
 * (components/voice/live/liveActions → window `myavatar:live-action`, cancelable; preventDefault = the receipt).
 * This is the TOOL-DISPATCH layer: no microphone, no speech recognition, no Gemini Live session.
 */
export async function voice(page: Page, args: Record<string, unknown>): Promise<VoiceAnswer> {
  return page.evaluate((a) => {
    const detail: Record<string, unknown> = { type: 'music_studio', ...a };
    const ev = new CustomEvent('myavatar:live-action', { detail, cancelable: true });
    window.dispatchEvent(ev);
    return { took: ev.defaultPrevented, reply: (detail.reply as VoiceAnswer['reply']) ?? null };
  }, args);
}

export const cards = (page: Page): Locator => page.getByTestId('music-card');
export const newestCard = (page: Page): Locator => cards(page).last();

export async function waitPhase(card: Locator, phase: string | RegExp, timeout = 120_000): Promise<void> {
  await expect(card).toHaveAttribute('data-phase', phase, { timeout });
}

/** A new job answers 202 (queued); a replay of the same quote answers 200 with the same job. */
export const STARTED = [200, 202];

/** Press the card's Create (the user's own tap) and return the job id the server answered with. */
export async function confirm(page: Page, card: Locator, userId: string, how: 'click' | 'tap' | 'keyboard' = 'click'): Promise<{ jobId: string; status: number }> {
  const btn = card.getByTestId('music-confirm');
  await expect(btn).toBeEnabled();
  // Starts are limited to 5 a minute per user (RATE_LIMITS.EXPENSIVE): wait for room, as a person would be told to.
  await paced(userId);
  logExpensive(userId);
  const started = page.waitForResponse((r) => r.url().endsWith('/api/music/studio/jobs') && r.request().method() === 'POST');
  if (how === 'tap') await btn.tap();
  else if (how === 'keyboard') { await btn.focus(); await page.keyboard.press('Enter'); }
  else await btn.click();
  const res = await started;
  const j = (await res.json().catch(() => ({}))) as { jobId?: string };
  return { jobId: j.jobId ?? '', status: res.status() };
}

export interface MusicLedgerRow { delta: number; reason: string; metadata: Record<string, unknown> | null }
/** Ledger rows of one Music Studio job: its debit (ref) and any refund (ref:refund). */
export async function ledgerForJob(userId: string, jobId: string): Promise<MusicLedgerRow[]> {
  const all = await rows<MusicLedgerRow & { created_at: string }>(`credit_ledger?user_id=eq.${userId}&select=delta,reason,metadata,created_at&order=created_at.asc`);
  const ref = STUDIO_REF(jobId);
  return all.filter((r) => JSON.stringify(r).includes(ref)).map(({ delta, reason, metadata }) => ({ delta, reason, metadata }));
}

export interface StudioJobRow { id: string; user_id: string; service_type: string; status: string; error: string | null; result: Record<string, unknown> | null; params: Record<string, unknown> | null }
export async function jobRow(id: string): Promise<StudioJobRow | null> {
  const [r] = await rows<StudioJobRow>(`generation_jobs?id=eq.${id}&select=id,user_id,service_type,status,error,result,params`);
  return r ?? null;
}

/** Bytes of a stored object, read with the LOCAL stack's service role (the truth, not the app's link). */
export async function storedBytes(bucket: string, path: string): Promise<Buffer> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`storage GET ${bucket}/${path} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
