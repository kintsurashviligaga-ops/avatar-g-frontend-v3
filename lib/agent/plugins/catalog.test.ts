/** @jest-environment node */
/**
 * The 10 plugins are names for things that RUN: every tool is in the live allowlist, every route file exists, every
 * word exists in ka/en/ru, and the resolver never claims more than the facts (an external wait is a blocker, never "ready").
 */
jest.mock('server-only', () => ({}));
jest.mock('../../ai/llmText', () => ({ llmText: jest.fn() }));
jest.mock('../tools/googleSearch', () => ({ groundedWebSearch: jest.fn() }));

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LIVE_TOOL_SPECS } from '../react/bindLiveAgent';
import { PLUGINS, resolvePlugins, type PluginFacts } from './catalog';
import { BLOCKER_TEXT, STATUS_WORD, returnMessage } from './messages';

const off = { open: false, configured: false, tableReady: false, linked: false };
const facts = (o: Partial<PluginFacts> = {}): PluginFacts => ({
  pluginsOn: false, drive: off, notion: off, github: off, sandbox: false, analyze: false, media: false, dbUp: true, ...o,
});
const byId = (f: PluginFacts) => Object.fromEntries(resolvePlugins(f).map((s) => [s.id, s]));

test('exactly the 10 plugins GG asked for, in order', () => {
  expect(PLUGINS.map((p) => p.id)).toEqual(['google_drive', 'web_research', 'code_sandbox', 'documents', 'image_studio', 'voice_music', 'video_avatar', 'notion', 'github', 'calendar']);
});

test('every backing tool is in the live allowlist and every route file exists', () => {
  const names = new Set(LIVE_TOOL_SPECS.map((s) => s.name));
  for (const p of PLUGINS) {
    for (const t of p.tools) expect([p.id, t, names.has(t)]).toEqual([p.id, t, true]);
    for (const r of p.routes) expect([p.id, r, existsSync(join(process.cwd(), r))]).toEqual([p.id, r, true]);
  }
});

test('every name, description, status word and blocker is written in ka, en and ru', () => {
  for (const p of PLUGINS) for (const l of ['ka', 'en', 'ru'] as const) { expect(p.name[l]).toBeTruthy(); expect(p.does[l]).toBeTruthy(); }
  for (const l of ['ka', 'en', 'ru'] as const) {
    expect(Object.values(STATUS_WORD[l]).every(Boolean)).toBe(true);
    expect(Object.keys(BLOCKER_TEXT[l]).sort()).toEqual(Object.keys(BLOCKER_TEXT.en).sort());
  }
  expect(PLUGINS.find((p) => p.id === 'documents')!.does.ka).toMatch(/[ა-ჰ]/);
});

test('all flags empty: connectable plugins are off, the studio services work, calendar is off — nothing pretends', () => {
  const s = byId(facts());
  expect(s.google_drive!.status).toBe('off');
  expect(s.notion!.status).toBe('off');
  expect(s.github!.status).toBe('off');
  expect(s.calendar!.status).toBe('off');
  expect(s.code_sandbox).toMatchObject({ status: 'off', blockers: ['admins_only'] });
  expect(s.web_research!.status).toBe('ready');
  expect(s.image_studio!.status).toBe('ready');
});

test('a connectable plugin walks off → needs setup (app, db, migration) → not connected → ready', () => {
  const open = { open: true, configured: false, tableReady: false, linked: false };
  expect(byId(facts({ notion: open })).notion).toMatchObject({ status: 'needs_setup', blockers: ['provider_app_missing'] });
  expect(byId(facts({ notion: { ...open, configured: true }, dbUp: false })).notion).toMatchObject({ status: 'needs_setup', blockers: ['db_paused'] });
  expect(byId(facts({ notion: { ...open, configured: true } })).notion).toMatchObject({ status: 'needs_setup', blockers: ['migration_pending'] });
  expect(byId(facts({ github: { ...open, configured: true, tableReady: true } })).github).toMatchObject({ status: 'not_connected', linked: false });
  expect(byId(facts({ drive: { open: true, configured: true, tableReady: true, linked: true } })).google_drive).toMatchObject({ status: 'ready', linked: true });
});

test('calendar is partial with its two outside waits named; the studios say partial while the database is paused', () => {
  expect(byId(facts({ pluginsOn: true })).calendar).toMatchObject({ status: 'partial', blockers: ['google_verification', 'migration_pending'] });
  expect(byId(facts({ pluginsOn: true, dbUp: false })).calendar!.blockers).toContain('db_paused');
  expect(byId(facts({ dbUp: false })).video_avatar).toMatchObject({ status: 'partial', blockers: ['db_paused'] });
  expect(byId(facts({ analyze: true })).documents!.status).toBe('partial');
  expect(byId(facts({ analyze: true, sandbox: true })).documents!.status).toBe('ready');
});

test('return messages exist for every reason in every language', () => {
  for (const l of ['ka', 'en', 'ru'] as const) for (const p of ['notion', 'github'] as const) {
    const seen = new Set(['linked', 'denied', 'state', 'scope_missing', 'not_signed_in', 'unavailable', 'other'].map((r) => returnMessage(p, r === 'linked' ? 'linked' : 'error', r, l)));
    expect(seen.size).toBe(7);
  }
  expect(returnMessage('github', 'linked', null, 'ka')).toBe('GitHub დაკავშირებულია.');
});
