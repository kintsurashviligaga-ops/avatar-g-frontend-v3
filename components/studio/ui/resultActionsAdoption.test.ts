/** @jest-environment node */
/**
 * Every studio that shows a finished asset must use ResultActions.
 *
 * ⚠️ THE DOWNLOAD LINKS DID NOT DOWNLOAD, AND THE SHARED FIX WAS BUILT AND NEVER WIRED IN. The panels
 * used `<a href={url} download>`, and a browser IGNORES the `download` attribute when the href is
 * cross-origin — which every one of these is, being a signed storage link. The tap navigated AWAY from
 * the app to the raw file instead of saving it; on a phone that means the render the user just paid for
 * vanishes from view with no obvious way back.
 *
 * ResultActions already fetched the bytes into a Blob, offered the iOS share sheet (the only route to
 * the Photos library) and filed the asset into the Library. It existed, with that exact bug written in
 * its header comment, and zero studios imported it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..');
const studios = readdirSync(dir).filter((f) => /Studio\.tsx$/.test(f));

/** Source with comments stripped — the fixes quote the broken pattern in their own explanations. */
const codeOf = (f: string) =>
  readFileSync(join(dir, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

/** Panels wired to the shared actions. Add to this list as more are migrated — never shrink it. */
const WIRED = ['DubbingStudio.tsx', 'Model3dStudio.tsx', 'MontageStudio.tsx'];

describe('ResultActions adoption', () => {
  it.each(WIRED)('%s renders the shared result actions', (f) => {
    expect(readFileSync(join(dir, f), 'utf8')).toContain('<ResultActions');
  });

  it.each(WIRED)('%s has no cross-origin <a download> left', (f) => {
    // The exact shape that silently fails. A same-origin download is fine, but none of these are.
    // Comment lines are stripped first — the fix's own explanation quotes the broken pattern verbatim.
    expect(codeOf(f)).not.toMatch(/<a\s+href=\{[^}]+\}\s+download\b/);
  });

  it('lists studios still to migrate, so the gap stays visible', () => {
    const remaining = studios.filter((f) => {
      const src = codeOf(f);
      return /<a\s+href=\{[^}]+\}\s+download\b/.test(src) && !src.includes('<ResultActions');
    });
    // Not a failure — a ledger. Shrinking it is the work; this asserts it never GROWS unnoticed.
    expect(remaining.length).toBeLessThanOrEqual(4);
  });
});
