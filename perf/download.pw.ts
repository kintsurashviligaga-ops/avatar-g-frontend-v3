/**
 * perf/download.pw.ts — Library Download in a real browser, mock environment (MASTER TASK v3.1 §4.1, §4.3).
 *
 * The film sits on a local HTTPS server that sends a whole-file GET (a download) at a fixed rate, the way a phone on a
 * fair connection receives it; a player's range read and a HEAD are answered at once. Two links to the same film:
 *   · `storage`: our signed Storage link (the browser resolves the Supabase host to the local server), which
 *     lib/media/saveMedia may hand straight to the browser;
 *   · `foreign`: the same film on another origin, which always takes the fetch-then-save path.
 * Timed from the Download click: to the request reaching the server, to the browser's `download` event (saving
 * starts), and to the file being complete on disk. These are the app's own costs over a fixed link, not production.
 *
 * Needs `openssl` (a throwaway self-signed certificate). Run: npm run perf:browser.
 */
import { expect, test, type Browser } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { SUPABASE_URL, fixtureRows, signedInLibrary } from './session';
import { MIN_P95_SAMPLES, summarize, writeResults, type PerfResult } from './stats';

const SAMPLES = Math.max(1, Number(process.env.PERF_SAMPLES) || MIN_P95_SAMPLES);
const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
/** The film's size and the link's speed. Chosen to look like a short film on a fair mobile link, not measured. */
const FILM_MB = num('PERF_DOWNLOAD_MB', 8);
const LINK_MBIT = num('PERF_DOWNLOAD_MBIT', 40);

const clip = readFileSync(path.join(__dirname, '..', 'tests/fixtures/clip.webm')); // Playwright's Chromium plays no H.264
const FILM = Buffer.concat([clip, Buffer.alloc(Math.max(0, Math.round(FILM_MB * 1024 * 1024) - clip.length))]);

function selfSignedCert(): { key: Buffer; cert: Buffer } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'perf-cert-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=perf.local',
      '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { stdio: 'ignore' });
    return { key: readFileSync(path.join(dir, 'key.pem')), cert: readFileSync(path.join(dir, 'cert.pem')) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Serves FILM: HEAD and range reads at once, a whole-file GET in 64 KB chunks paced to LINK_MBIT. Notes each GET. */
function mediaServer(arrivals: number[]) {
  const chunk = 64 * 1024;
  const perChunkMs = ((chunk * 8) / (LINK_MBIT * 1_000_000)) * 1000;
  return https.createServer(selfSignedCert(), (req, res) => {
    const asked = new URL(req.url ?? '/', 'https://x');
    if (!asked.pathname.endsWith('/film_0.webm')) { res.writeHead(404); res.end(); return; } // e.g. the auth client's realtime socket
    const name = asked.searchParams.get('download');
    const head = {
      'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-length, content-range', 'accept-ranges': 'bytes',
      'content-type': 'video/webm', ...(name ? { 'content-disposition': `attachment; filename="${name}"` } : {}),
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...head, 'access-control-allow-headers': 'range' }); res.end(); return; }
    if (req.method === 'HEAD') { res.writeHead(200, { ...head, 'content-length': FILM.length }); res.end(); return; }
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(FILM.length - 1, range[2] ? Number(range[2]) : start + 256 * 1024 - 1);
      res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${FILM.length}`, 'content-length': end - start + 1 });
      res.end(FILM.subarray(start, end + 1));
      return;
    }
    arrivals.push(performance.now());
    res.writeHead(200, { ...head, 'content-length': FILM.length });
    let at = 0;
    const next = () => {
      if (res.destroyed) return;
      if (at >= FILM.length) { res.end(); return; }
      res.write(FILM.subarray(at, at + chunk));
      at += chunk;
      setTimeout(next, perChunkMs);
    };
    next();
  });
}

interface Run { request: number; start: number; done: number }

async function downloads(browser: Browser, baseURL: string | undefined, url: string, arrivals: number[]): Promise<Run[]> {
  const context = await browser.newContext({ acceptDownloads: true, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    const rows = fixtureRows().filter((it) => it.kind === 'film').slice(0, 1).map((it) => ({ ...it, url }));
    await signedInLibrary(page, baseURL, rows);
    await page.goto('/en/library', { waitUntil: 'load' });
    const button = page.getByTestId('library-download');
    await expect(button).toHaveCount(1, { timeout: 120_000 });
    const runs: Run[] = [];
    for (let i = -1; i < SAMPLES; i += 1) { // i = -1 warms the page; not counted
      const seen = arrivals.length;
      const download = page.waitForEvent('download', { timeout: 120_000 });
      const started = performance.now();
      await button.click();
      const file = await download;
      const start = performance.now() - started;
      expect(await file.failure()).toBeNull(); // waits for the whole file
      const done = performance.now() - started;
      await expect(button).not.toHaveAttribute('aria-busy', 'true');
      await file.delete();
      expect(arrivals.length).toBeGreaterThan(seen);
      if (i >= 0) runs.push({ request: arrivals[seen]! - started, start, done });
    }
    return runs;
  } finally {
    await context.close();
  }
}

test(`Library download of a ${FILM_MB} MB film at ${LINK_MBIT} Mbit/s (${SAMPLES} samples per link)`, async ({ playwright, baseURL }) => {
  test.setTimeout(30 * 60_000);
  const arrivals: number[] = [];
  const server = mediaServer(arrivals);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  const storageHost = new URL(SUPABASE_URL).hostname;
  // The Supabase host resolves to the local server for this browser only; no proxy, so the rule applies.
  const browser = await playwright.chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
    args: [`--host-resolver-rules=MAP ${storageHost} 127.0.0.1:${port}`, '--no-proxy-server'],
  });
  try {
    const links = {
      storage: `${SUPABASE_URL}/storage/v1/object/sign/renders/perf-download/film_0.webm?token=perf`,
      foreign: `https://127.0.0.1:${port}/renders/film_0.webm?token=perf`,
    };
    const transferMs = Math.round(((FILM.length * 8) / (LINK_MBIT * 1_000_000)) * 1000);
    const results: PerfResult[] = [];
    for (const [link, url] of Object.entries(links)) {
      const runs = await downloads(browser, baseURL, url, arrivals);
      const base = {
        environment: 'mock' as const,
        payload: `1 film, ${FILM_MB} MB (fixture webm + padding), ${link} link`,
        network: `local HTTPS server, whole-file GET paced to ${LINK_MBIT} Mbit/s (≈${transferMs} ms for the file)`,
        cache: 'cold' as const,
        unit: 'ms' as const,
      };
      const server = process.env.PERF_SERVER ?? 'next dev';
      results.push(
        summarize({ ...base, interaction: `download.${link}.click-to-request`, note: `Click → the file's GET reaching the media server; ${server} server.` }, runs.map((r) => r.request)),
        summarize({ ...base, interaction: `download.${link}.click-to-start`, note: "Click → the browser's download event (saving starts)." }, runs.map((r) => r.start)),
        summarize({ ...base, interaction: `download.${link}.click-to-done`, note: 'Click → the file complete on disk.' }, runs.map((r) => r.done)),
      );
    }
    writeResults('download', results);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});
