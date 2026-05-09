#!/usr/bin/env node
/**
 * scripts/gemini-health-check.mjs
 * ================================
 * Verifies Gemini API connectivity and measures response latency.
 * Acceptable production TTFT (time-to-first-token): < 3 000 ms.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx node scripts/gemini-health-check.mjs
 *   node scripts/gemini-health-check.mjs            # reads from .env.local via --env-file if Node 20+
 *
 * Exit codes:
 *   0 — healthy
 *   1 — configuration error (missing key)
 *   2 — connectivity / API error
 *   3 — latency above threshold
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.0-flash';
const TTFT_THRESHOLD_MS = 3_000;

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';

if (!apiKey) {
  console.error('[gemini-health] ✗ GEMINI_API_KEY is not set');
  process.exit(1);
}

async function run() {
  const url = `${GEMINI_BASE_URL}/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
    generationConfig: { maxOutputTokens: 8, temperature: 0 },
  });

  console.log(`[gemini-health] Probing ${MODEL}...`);
  const start = Date.now();

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`[gemini-health] ✗ Network error: ${err.message}`);
    process.exit(2);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) {
      // Quota exhausted — key is valid, billing/tier limit reached
      console.warn('[gemini-health] ⚠ HTTP 429: quota exhausted (key is valid, upgrade billing plan)');
      console.warn(`  Detail: ${text.slice(0, 200)}`);
      process.exit(3);
    }
    if (res.status === 403 || res.status === 400) {
      console.error(`[gemini-health] ✗ HTTP ${res.status}: invalid or missing API key`);
      console.error(`  Detail: ${text.slice(0, 200)}`);
      process.exit(1);
    }
    console.error(`[gemini-health] ✗ HTTP ${res.status}: ${text.slice(0, 200)}`);
    process.exit(2);
  }

  // Stream first SSE chunk to measure TTFT
  let firstTokenMs = null;
  let fullText = '';

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json || json === '[DONE]') continue;

      try {
        const parsed = JSON.parse(json);
        const text = parsed.candidates?.[0]?.content?.parts
          ?.map(p => p.text ?? '')
          .join('') ?? '';

        if (text && firstTokenMs === null) {
          firstTokenMs = Date.now() - start;
        }
        fullText += text;
      } catch {
        // partial chunk — ignore
      }
    }

    // Stop after we have something to report
    if (firstTokenMs !== null) break;
  }

  reader.cancel().catch(() => {});

  const totalMs = Date.now() - start;

  if (firstTokenMs === null) {
    console.error('[gemini-health] ✗ No tokens received');
    process.exit(2);
  }

  console.log(`[gemini-health] ✓ Connected`);
  console.log(`  Model       : ${MODEL}`);
  console.log(`  Response    : "${fullText.trim()}"`);
  console.log(`  TTFT        : ${firstTokenMs} ms  (threshold: ${TTFT_THRESHOLD_MS} ms)`);
  console.log(`  Total round : ${totalMs} ms`);

  if (firstTokenMs > TTFT_THRESHOLD_MS) {
    console.warn(`[gemini-health] ⚠ TTFT exceeds ${TTFT_THRESHOLD_MS} ms — latency may affect UX`);
    process.exit(3);
  }

  console.log('[gemini-health] ✓ Latency within acceptable limits');
  process.exit(0);
}

run().catch(err => {
  console.error('[gemini-health] ✗ Unexpected error:', err.message);
  process.exit(2);
});
