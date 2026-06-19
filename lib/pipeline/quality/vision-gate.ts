// Master Prompt §6.3 — AI Quality Gate. THE genuine gap this build adds: Claude Vision
// inspects a rendered frame for severe diffusion artifacts (face-melting, distorted
// hands/eyes, structural collapse) so the per-scene retry loop can re-roll only the bad
// scene. Fails OPEN on any infra error (§9): a QA outage must never block a good clip.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// Fast vision-capable default — frame QA runs once per scene, so speed × 5 matters.
const MODEL = process.env.ANTHROPIC_VISION_MODEL || 'claude-haiku-4-5-20251001';

export interface QaVerdict {
  passed: boolean;
  reason?: string;
}

export class VisionQualityGate {
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  async inspectFrame(frameUrl: string): Promise<QaVerdict> {
    try {
      const b64 = await fetchBase64(frameUrl);
      if (!b64) return { passed: true, reason: 'frame unavailable — fail-open' };

      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'You are an automated QA engineer for AI-generated video. Inspect this frame for SEVERE defects only: ' +
                  'face melting, distorted/extra fingers, collapsed eyes, garbled text, or extreme structural distortion. ' +
                  'Minor softness or styledness is acceptable. Reply with ONLY a JSON object: ' +
                  '{ "passed": boolean, "reason": "string" }. passed=true means broadcast-acceptable.',
              },
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            ],
          },
        ],
      });

      const block = res.content.find((b) => b.type === 'text');
      const text = block && 'text' in block ? (block as { text: string }).text : '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { passed: true, reason: 'no parseable verdict — fail-open' };
      const parsed = JSON.parse(match[0]) as Partial<QaVerdict>;
      return { passed: parsed.passed !== false, reason: parsed.reason };
    } catch (e) {
      // Graceful degradation: never block delivery on a QA infra failure.
      return { passed: true, reason: `qa-error: ${(e as Error).message}` };
    }
  }
}

async function fetchBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.byteLength ? buf.toString('base64') : null;
  } catch {
    return null;
  }
}
