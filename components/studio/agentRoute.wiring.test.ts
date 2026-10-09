/**
 * Pins how OmniStudio.send() uses Agent G's catalog router (lib/catalog/agentRoute, Master Task §52): a request for a
 * panel tool OPENS that tool and spends nothing; a coming-soon service is said, not substituted; the image card never
 * claims a sentence the catalog gives to another tool; and a guest is not walked into a paid tool.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
const sendBody = src.slice(src.indexOf('const send = useCallback(async (opts?:'), src.indexOf('// ── VIDEO REMIX — edit an uploaded video via /api/video/remix'));
const at = (needle: string): number => sendBody.indexOf(needle);

describe('Agent G × the service catalog in send()', () => {
  const branch = sendBody.slice(at('const agentRoute = mode ==='), at('if (chatLane && opts?.confirmed) {'));

  test('the catalog route runs after the studio panels and before any chat dispatch that spends', () => {
    expect(at('const agentRoute = mode ===')).toBeGreaterThan(at('if (studio) {'));
    expect(at('const agentRoute = mode ===')).toBeLessThan(at('if (chatLane && opts?.confirmed) {'));
  });

  test('it only opens a tool or answers: no request, no render, no charge', () => {
    expect(branch).toContain('applyToolRef.current?.(agentRoute.tool)');
    expect(branch).not.toMatch(/fetch\(|runImageJob|runImageBatch|runMusicJob|createStoryboard|runVideoSwap|\/api\//);
    expect(branch).toContain('return;');
  });

  test('a coming-soon service is reported as not available, with the alternative the catalog names', () => {
    expect(branch).toContain("agentRoute.kind === 'open'");
    expect(branch).toContain('agentRoute.alternative?.label[lang]');
    expect(branch).toMatch(/ჯერ არ არის ხელმისაწვდომი/);
  });

  test('the chat image/music card yields to the catalog route', () => {
    const order = sendBody.slice(at('const chatOrder: GateMode | null'), at('const gateMode: GateMode | null = focusGateMode ?? chatOrder;'));
    expect(order).toContain('routeAgentIntent(text)');
  });

  test('a guest who asks for a panel tool is asked to sign in, like every other paid tool', () => {
    expect(src).toContain("routeAgentIntent(guestText)?.kind !== 'open'");
  });
});
