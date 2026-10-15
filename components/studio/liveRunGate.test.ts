/** @jest-environment node */
/**
 * Live Voice → the studio's PAID render (final-release master task §8.D, register FR-6): a spoken „კი", a model's tool flag
 * or a transcript may never debit. OmniStudio's `liveRunRef` is the one place a Live call's countdown could start a studio
 * render, so it is pinned on the source (the studio is one 9,000-line client component): a studio target answers
 * `ui_confirmation_required` and never reaches `runTool`, while Agent G's free montage / audio / edit plans keep the yes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
/** Source without comments: the fix's own explanation quotes the call it replaced. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/** The body of `liveRunRef.current = (detail) => { … };` as written in OmniStudio. */
const handler = (() => {
  const at = src.indexOf('liveRunRef.current = (detail: LiveRunDetail): boolean => {');
  const end = src.indexOf('\n  };\n', at);
  return at >= 0 && end > at ? code(src.slice(at, end)) : '';
})();

describe('a Live call never starts a paid studio render', () => {
  test('the handler is found', () => {
    expect(handler.length).toBeGreaterThan(200);
  });

  test('no studio render is started from the voice path', () => {
    expect(handler).not.toMatch(/runTool\s*\(/);
    expect(code(src)).not.toMatch(/runTool\(\s*true\s*,\s*'voice'\s*\)/);
  });

  test('a studio target ends in ui_confirmation_required, nothing started or charged', () => {
    const last = handler.lastIndexOf('return ');
    expect(handler.slice(last)).toMatch(/refuse\('ui_confirmation_required'/);
    expect(handler.slice(last)).toMatch(/Nothing was started or charged/);
  });

  test("Agent G's free plans still take the spoken yes, with the words recorded on the run", () => {
    expect(handler).toMatch(/channel: 'voice-transcript', said/);
    expect(handler).toMatch(/confirmAgentMontage\(plan\.id, approval\)/);
  });
});
