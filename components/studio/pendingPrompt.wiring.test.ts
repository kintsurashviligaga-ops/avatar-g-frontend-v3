/** @jest-environment node */
/**
 * The studio keeps a guest's request across sign-in (lib/studio/pendingPrompt), read from the source like the other
 * OmniStudio suites. Pinned: the guest stop keeps the text and tool BEFORE asking for sign-in; a signed-in send clears
 * it; on mount it comes back once into an empty composer, never sent, and before the deep-link effect so an explicit
 * link still wins.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const omni = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');

it('the guest stop keeps the request, then asks for sign-in', () => {
  const stop = omni.slice(omni.indexOf("document.documentElement.dataset.authed === '0') {"), omni.indexOf('const text = (opts?.promptOverride ?? input).trim();'));
  expect(stop).toMatch(/stashPendingPrompt\(guestText, activeToolRef\.current\);\s*window\.dispatchEvent\(new CustomEvent\('myavatar:auth-required'\)\);/);
  expect(stop).toMatch(/\} else \{[\s\S]*clearPendingPrompt\(\);/);
});

it('the product / swap / remix stop keeps it too', () => {
  const run = omni.slice(omni.indexOf('const runTool = (explicitFlag?: boolean'), omni.indexOf('if (!canRun) { openSettings(); return; }'));
  expect(run).toMatch(/stashPendingPrompt\(input, activeTool\);\s*window\.dispatchEvent\(new CustomEvent\('myavatar:auth-required'\)\);/);
});

it('comes back once, into an empty composer, without sending — before the deep link decides', () => {
  const restore = omni.indexOf('const p = takePendingPrompt();');
  const deepLink = omni.indexOf("const tl = url.searchParams.get('tool');");
  expect(restore).toBeGreaterThan(0);
  expect(restore).toBeLessThan(deepLink);
  const body = omni.slice(restore, omni.indexOf('}, []);', restore));
  expect(body).toContain("if (p.tool !== 'chat') selectTool(p.tool);");
  expect(body).toContain('setInput((prev) => (prev.trim() ? prev : p.text));');
  expect(body).not.toMatch(/send\(|runTool\(/);
});
