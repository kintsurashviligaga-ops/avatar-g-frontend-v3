/** @jest-environment node */
/**
 * The sidebar must name the persona that is active, not merely admit that one is.
 *
 * ⚠️ THE ROW SAID "პერსონა" AND A DOT. The dot told you a persona was selected and nothing else — so the
 * one thing worth knowing, WHO you are talking to, required opening the picker to find out. A persona
 * changes the assistant's tone and which studio it reaches for; leaving that unnamed on the only
 * always-visible surface is the difference between a setting and a setting you can trust.
 *
 * The wiring itself was already correct — picker → OmniStudio → /api/chat/gemini — which is worth saying,
 * because three other things in this codebase were built and never connected. This one was connected and
 * simply did not say so.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const chrome = readFileSync(join(__dirname, 'ChatChrome.tsx'), 'utf8');
const omni = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');

describe('the sidebar persona row', () => {
  it('resolves the active persona to a NAME', () => {
    expect(chrome).toContain('const activePersonaName');
    expect(chrome).toContain('personaName(found, lang)');
  });

  it('looks in the custom personas too', () => {
    // A user's own specialist must be named like the built-ins, not fall back to the generic label.
    expect(chrome).toContain('loadCustomPersonas()');
  });

  it('renders the name, and keeps the dot only as the fallback', () => {
    expect(chrome).toMatch(/\{activePersonaName\s*$|\{activePersonaName\b/m);
    expect(chrome).toContain('title={activePersonaName}');
    // Truncation matters: a long custom name must not push the row wider than the sidebar.
    expect(chrome).toMatch(/truncate text-\[12px\] text-app-accent/);
  });

  it('falls back to Georgian for a locale the personas do not ship', () => {
    expect(chrome).toMatch(/locale === 'en' \|\| locale === 'ru' \? locale : 'ka'/);
  });
});

describe('the persona actually reaches the model', () => {
  it('OmniStudio sends the selection with the request', () => {
    // Guarding the wiring that already worked, because the value of naming it in the sidebar depends on
    // the name being true.
    expect(omni).toContain('loadSelectedPersonaId()');
    expect(omni).toMatch(/\.\.\.\(personaId \? \{ personaId \} : \{\}\)/);
  });

  it('a custom persona travels as its full definition, not just an id', () => {
    // The server cannot look up a persona that lives in the caller's localStorage.
    expect(omni).toContain("personaId.startsWith('custom:')");
  });
});
