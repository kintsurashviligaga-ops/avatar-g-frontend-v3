/** @jest-environment node */
import { parseSkillsManifest, enabledToolIds, type SkillsManifest } from './skills-manifest';
import liveManifest from '../../.mcp/skills-manifest.json';

describe('skills-manifest (the shipped .mcp/skills-manifest.json)', () => {
  test('the live manifest is schema-valid + referentially sound', () => {
    const r = parseSkillsManifest(liveManifest);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  test('exposes the three standardized MCP tools', () => {
    const r = parseSkillsManifest(liveManifest);
    expect(enabledToolIds(r.manifest as SkillsManifest).sort()).toEqual(
      ['database_jobs_sync', 'hardware_gpu_render', 'synthesis_voice_ka'],
    );
  });

  test('every agent skill references a declared tool', () => {
    const m = liveManifest as unknown as SkillsManifest;
    const ids = new Set(m.tools.map((t) => t.id));
    for (const a of m.agents) for (const s of a.skills) expect(ids.has(s)).toBe(true);
  });
});

describe('parseSkillsManifest validation', () => {
  const base: SkillsManifest = {
    version: 1,
    server: { name: 's', version: '0.1.0' },
    tools: [{
      id: 'database_jobs_sync', title: 'T', description: 'd', category: 'database',
      enabled: true, route: { path: '/api/x', method: 'GET', kind: 'json', auth: true },
    }],
    agents: [{ id: 'a', label: 'A', skills: ['database_jobs_sync'] }],
  };

  test('rejects an agent referencing an unknown tool', () => {
    const bad = { ...base, agents: [{ id: 'a', label: 'A', skills: ['nonexistent_tool'] }] };
    const r = parseSkillsManifest(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('nonexistent_tool');
  });

  test('rejects a malformed shape (missing server)', () => {
    const { server: _server, ...noServer } = base;
    expect(parseSkillsManifest(noServer).ok).toBe(false);
  });

  test('rejects duplicate tool ids', () => {
    const dup = { ...base, tools: [base.tools[0], base.tools[0]] };
    const r = parseSkillsManifest(dup);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('duplicate');
  });

  test('rejects a non-snake_case tool id', () => {
    const bad = { ...base, tools: [{ ...base.tools[0]!, id: 'BadID' }], agents: [{ id: 'a', label: 'A', skills: ['BadID'] }] };
    expect(parseSkillsManifest(bad).ok).toBe(false);
  });
});
