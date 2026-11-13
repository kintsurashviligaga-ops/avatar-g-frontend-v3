/** @jest-environment node */
import { phase4Allowed, phase4Audience } from './flags';

test('every Phase 4 flag fails closed: only the exact value "admins" turns it on, and only for admins', () => {
  for (const raw of [undefined, null, '', 'on', 'everyone', 'true', '1', 'admin', 'Admins ']) {
    expect(phase4Audience(raw)).toBe(raw === 'Admins ' ? 'admins' : 'off');
  }
  const env = { AGENT_BROWSER_AGENT: 'admins', AGENT_SANDBOX_PACKAGES: 'everyone', AGENT_APP_BUILDER: undefined };
  expect(phase4Allowed('AGENT_BROWSER_AGENT', { isAdmin: true }, env)).toBe(true);
  expect(phase4Allowed('AGENT_BROWSER_AGENT', { isAdmin: false }, env)).toBe(false);
  expect(phase4Allowed('AGENT_BROWSER_AGENT', null, env)).toBe(false);
  expect(phase4Allowed('AGENT_SANDBOX_PACKAGES', { isAdmin: true }, env)).toBe(false); // "everyone" is not a value
  expect(phase4Allowed('AGENT_APP_BUILDER', { isAdmin: true }, env)).toBe(false);
  expect(phase4Allowed('NOPE' as never, { isAdmin: true }, { NOPE: 'admins' })).toBe(false);
});

test('off by default: with no env set nobody gets any Phase 4 feature', () => {
  for (const f of ['AGENT_BROWSER_AGENT', 'AGENT_SANDBOX_PACKAGES', 'AGENT_APP_BUILDER'] as const) expect(phase4Allowed(f, { isAdmin: true }, {})).toBe(false);
});
