/** @jest-environment node */
/**
 * Structural guard for /api/video/assemble (the handler is ~1,000 lines of ffmpeg behind a dozen provider imports):
 * every request-named URL the route re-signs with the service role passes the owner gate first, and the gate runs
 * before any charge. The gate itself is unit-tested in lib/security/callerMedia.test.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const gateAt = code.indexOf('await firstUnreadableOwnUrl(named, uid)');
const gate = code.slice(code.indexOf('const named: unknown[] = ['), gateAt);

test('the gate refuses with 403 before the first charge or reservation', () => {
  expect(gateAt).toBeGreaterThan(0);
  expect(code).toMatch(/await firstUnreadableOwnUrl\(named, uid\)\) >= 0\) \{\s*return NextResponse\.json\(\{ error: 'media_not_yours'[^\n]*status: 403 \}\);/);
  for (const charge of ['deductCredits(', 'refundCredits(', 'reserve']) {
    const at = code.indexOf(charge);
    if (at >= 0) expect(at).toBeGreaterThan(gateAt);
  }
});

test('every field the route re-signs is in the gated list', () => {
  const resigned = [...code.matchAll(/reSignIfInternal\(([^,)]+)/g)].map((m) => m[1]!.trim());
  expect(resigned.length).toBeGreaterThanOrEqual(8);
  const gatedFields: Record<string, RegExp> = {
    'body.customAudioUrl': /body\.customAudioUrl/,
    'body.musicUrl': /body\.musicUrl/,
    'body.voiceoverUrl': /body\.voiceoverUrl/,
    'body.sfxUrl': /body\.sfxUrl/,
    'segments[0]!.url': /\.\.\.segments\.map\(\(s\) => s\.url\)/,
    's.url': /\.\.\.segments\.map\(\(s\) => s\.url\)|body\.dialogueStems\.slice\(0, 16\)\.map\(\(s\) => s\?\.url\)/,
  };
  for (const arg of resigned) {
    const rule = gatedFields[arg];
    expect([arg, Boolean(rule)]).toEqual([arg, true]);
    expect(gate).toMatch(rule!);
  }
});
