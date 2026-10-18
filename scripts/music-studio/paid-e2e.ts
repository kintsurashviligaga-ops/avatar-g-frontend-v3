/**
 * scripts/music-studio/paid-e2e.ts — Phase 8: the REAL Google Lyria test (one instrumental, one vocal), PAID.
 *
 * ⚠️ DOES NOTHING WITHOUT THE OWNER'S WRITTEN APPROVAL. It refuses unless MUSIC_PAID_E2E_APPROVED is set to the approval
 * reference (e.g. "GG-2026-10-14 $5") AND the planned spend fits MUSIC_PAID_E2E_CAP_USD (default 5). It never touches
 * Production user credits or another customer's data: it calls the provider directly with the owner's own GCP / Gemini
 * credentials, measures the audio with the same ffmpeg QC the studio uses, and writes the evidence (sizes, lengths,
 * levels, digests, HTTP outcome — never a key) to docs/handoffs/music-studio/evidence/.
 *
 * Price basis: lyria-3-clip-preview ≈ $0.04 per track on Vertex (gcp-part0-report T2.3, 2026-10-08). Re-check the live
 * price on the Google Cloud pricing page before approving; the planned spend below uses MUSIC_PAID_E2E_USD_PER_TRACK.
 *
 * The Library-delivery and ledger-reconciliation half of Phase 8 runs through the deployed Preview (the owner's test
 * account, MUSIC_STUDIO_ENABLED=1 on Preview only) — see docs/handoffs/music-studio/06_PROVIDER_VERIFICATION.md.
 *
 *   usage: MUSIC_PAID_E2E_APPROVED="<approval ref>" GEMINI_TRANSPORT=vertex … npx tsx scripts/music-studio/paid-e2e.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const approval = (process.env.MUSIC_PAID_E2E_APPROVED ?? '').trim();
const cap = Number(process.env.MUSIC_PAID_E2E_CAP_USD ?? '5');
const perTrack = Number(process.env.MUSIC_PAID_E2E_USD_PER_TRACK ?? '0.04');
const CASES = [
  { name: 'instrumental', input: 'Calm cinematic cello and piano over soft rain, slow tempo.\n\nInstrumental only, no vocals.' },
  { name: 'vocal-ka', input: 'A warm Georgian folk-pop song about Tbilisi at dusk.\n\nfemale lead vocal. Sung in Georgian.\n\nLyrics:\nთბილისის შუქი ღამეში ანთია\nმტკვარი მღერის, გული ხარობს' },
];

async function main(): Promise<void> {
  if (!approval) {
    console.error('REFUSED: MUSIC_PAID_E2E_APPROVED is not set. This test spends real money; it needs the owner\'s written approval.');
    process.exit(2);
  }
  const planned = CASES.length * perTrack * 2; // ×2: room for one retry each, still counted against the cap
  if (!(planned <= cap)) {
    console.error(`REFUSED: planned spend $${planned.toFixed(2)} exceeds the cap $${cap.toFixed(2)}.`);
    process.exit(2);
  }
  // Loaded only after the approval check, so a refused run cannot reach a provider module at all.
  const { lyriaRequest } = await import('../../lib/ai/lyriaMusic');
  const { measureAudio, assertDeliverable, formatOfMime } = await import('../../lib/music/studio/audio');
  const model = process.env.LYRIA_MODEL || 'lyria-3-clip-preview';
  const out: Record<string, unknown>[] = [];
  for (const c of CASES) {
    const t0 = Date.now();
    const r = await lyriaRequest(c.input, model, AbortSignal.timeout(170_000));
    const row: Record<string, unknown> = { case: c.name, model, ms: Date.now() - t0, ok: r.ok };
    if (r.ok) {
      const bytes = Buffer.from(r.track.base64, 'base64');
      const fmt = formatOfMime(r.track.mime) ?? 'mp3';
      const qc = await measureAudio(bytes, fmt);
      let deliverable = true;
      try { assertDeliverable(qc, { minSec: 10, maxSec: 90 }); } catch (e) { deliverable = false; row.qcError = (e as Error).message; }
      Object.assign(row, { mime: r.track.mime, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), qc, deliverable, captionChars: r.caption?.length ?? 0 });
      const dir = join('docs/handoffs/music-studio/evidence', 'paid-e2e');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${c.name}.${fmt}`), bytes);
    } else {
      Object.assign(row, { reason: r.reason, status: r.status ?? null });
    }
    out.push(row);
    console.log(JSON.stringify(row));
  }
  mkdirSync('docs/handoffs/music-studio/evidence', { recursive: true });
  writeFileSync('docs/handoffs/music-studio/evidence/paid-e2e.json', JSON.stringify({ approval, at: new Date().toISOString(), plannedUsd: planned, capUsd: cap, results: out }, null, 2));
}

void main();
