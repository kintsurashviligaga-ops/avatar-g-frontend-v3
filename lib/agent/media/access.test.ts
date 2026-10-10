/** @jest-environment node */
/**
 * Who may have Agent G read a whole file with Gemini (lib/agent/media/access agentAnalyzeAccess): every analysis is a
 * paid model call, so AGENT_G_FILE_ANALYSIS is off everywhere until the owner sets it, a Preview included (unlike
 * AGENT_G_MEDIA_EXEC, whose Preview default is `admin`); the two flags never open each other.
 */
jest.mock('../../admin/guard', () => ({ isAdminUser: (u: { email?: string } | null) => u?.email === 'admin@example.com' }));

import type { User } from '@supabase/supabase-js';
import { agentAnalyzeAccess, agentAnalyzeOpenTo, agentMediaAccess } from './access';

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const admin = { id: 'a', email: 'admin@example.com' } as User;
const someone = { id: 's', email: 'someone@example.com' } as User;

test('unset is off everywhere, a Preview included', () => {
  for (const VERCEL_ENV of ['', 'preview', 'production', 'development']) {
    expect(agentAnalyzeAccess(env({ VERCEL_ENV }))).toBe('off');
  }
  // The media flag's Preview default does not open analysis.
  expect(agentMediaAccess(env({ VERCEL_ENV: 'preview' }))).toBe('admin');
  expect(agentAnalyzeAccess(env({ VERCEL_ENV: 'preview' }))).toBe('off');
});

test('admin, all, and anything else off', () => {
  expect(agentAnalyzeAccess(env({ AGENT_G_FILE_ANALYSIS: ' Admin ' }))).toBe('admin');
  for (const v of ['1', 'true', 'ON']) expect(agentAnalyzeAccess(env({ AGENT_G_FILE_ANALYSIS: v }))).toBe('all');
  for (const v of ['0', 'off', 'false', 'yes', 'preview']) expect(agentAnalyzeAccess(env({ AGENT_G_FILE_ANALYSIS: v }))).toBe('off');
});

test('the flags are separate: media execution on does not open analysis, nor the reverse', () => {
  expect(agentAnalyzeAccess(env({ AGENT_G_MEDIA_EXEC: 'on' }))).toBe('off');
  expect(agentMediaAccess(env({ AGENT_G_FILE_ANALYSIS: 'on' }))).toBe('off');
});

test('who it is open to', () => {
  expect(agentAnalyzeOpenTo(null, env({ AGENT_G_FILE_ANALYSIS: 'on' }))).toBe(false);
  expect(agentAnalyzeOpenTo(someone, env({ AGENT_G_FILE_ANALYSIS: 'on' }))).toBe(true);
  expect(agentAnalyzeOpenTo(someone, env({ AGENT_G_FILE_ANALYSIS: 'admin' }))).toBe(false);
  expect(agentAnalyzeOpenTo(admin, env({ AGENT_G_FILE_ANALYSIS: 'admin' }))).toBe(true);
  expect(agentAnalyzeOpenTo(admin, env({}))).toBe(false);
});
