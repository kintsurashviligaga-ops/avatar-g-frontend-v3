/** @jest-environment node */
/**
 * GG's iPhone, Production 2026-10-16: Agent G agreed an image prompt, the user said "კარგია", and the reply claimed the
 * system was "already processing" — nothing ran; and with the image sheet open, the chat bar and a docked Live call stacked
 * into "two screens". OmniStudio is ~12,000 lines behind dozens of providers, so the wiring is pinned on its source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');

test('a yes to Agent G\'s own quoted offer shows its priced card before any other gate; Create is still the only start', () => {
  const offer = src.indexOf('const offer = lastReply && !lastReply.agentG ? offeredPrompt(lastReply.text, here) : null;');
  expect(offer).toBeGreaterThan(0);
  expect(offer).toBeLessThan(src.indexOf('const gateMode: GateMode | null = focusGateMode ?? chatOrder;'));
  const block = src.slice(offer, src.indexOf('const gateMode: GateMode | null = focusGateMode ?? chatOrder;'));
  expect(block).toMatch(/kind: 'confirm', target: offer\.mode/);
  expect(block).not.toMatch(/runImageJob|runMusicJob|confirmed: true/);
  expect(block).toMatch(/inChat \? offer\.mode !== 'video' : offer\.mode === effMode/);
});

test('on a phone the chat bar hides while a tool sheet is open, and the sheet stops under a docked call', () => {
  expect(src).toMatch(/data-testid="composer-bar" className=\{imageWorkspace \|\| \(!isDesktop && optionsOpen && !chatOnly\) \? 'hidden'/);
  expect(src).toMatch(/'studio-sheet sheet-rise relative flex max-h-\[86svh\]/);
  expect(css).toMatch(/html\[data-live-docked\] \.studio-sheet \{ max-height: calc\(100svh - var\(--live-dock-h\) - 12px\) !important; \}/);
});
