#!/usr/bin/env node
/**
 * Dynamic MCP skill-install harness.
 *
 * Lets Claude Code (or any script) register / toggle a tool competency in
 * .mcp/skills-manifest.json WITHOUT touching any other code — the MCP server
 * picks it up on its next boot. Every write is re-validated against the same
 * zod contract the app + server use, so a bad install can never ship.
 *
 *   node scripts/mcp-skill.mjs list
 *   node scripts/mcp-skill.mjs enable  <toolId>
 *   node scripts/mcp-skill.mjs disable <toolId>
 *   node scripts/mcp-skill.mjs add <toolId> <category> <path> <GET|POST> <json|sse|binary> [--auth] [--agent=<id>]
 *
 * Example (install a 4K upscale competency for the video swarm):
 *   node scripts/mcp-skill.mjs add image_upscale_4k vision /api/orchestrator/image/produce POST sse --agent=video-swarm
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, '..', '.mcp', 'skills-manifest.json');
const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m' };

function die(msg) { console.error(`${C.red}✗ ${msg}${C.reset}`); process.exit(1); }
function read() { try { return JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch (e) { die(`cannot read ${MANIFEST}: ${e.message}`); } }

// Mirror of lib/mcp/skills-manifest.ts validation (kept dependency-free here).
function validate(m) {
  const errs = [];
  if (m.version !== 1) errs.push('version must be 1');
  if (!m.server?.name || !m.server?.version) errs.push('server.name/version required');
  if (!Array.isArray(m.tools) || m.tools.length === 0) errs.push('tools[] required');
  const ids = new Set();
  for (const t of m.tools ?? []) {
    if (!/^[a-z][a-z0-9_]*$/.test(t.id || '')) errs.push(`tool id not snake_case: ${t.id}`);
    if (ids.has(t.id)) errs.push(`duplicate tool id: ${t.id}`);
    ids.add(t.id);
    if (!['database', 'hardware', 'synthesis', 'vision', 'assembly'].includes(t.category)) errs.push(`bad category for ${t.id}: ${t.category}`);
    if (!t.route?.path?.startsWith('/')) errs.push(`bad route.path for ${t.id}`);
    if (!['GET', 'POST'].includes(t.route?.method)) errs.push(`bad route.method for ${t.id}`);
    if (!['json', 'sse', 'binary'].includes(t.route?.kind)) errs.push(`bad route.kind for ${t.id}`);
  }
  for (const a of m.agents ?? []) for (const s of a.skills ?? []) if (!ids.has(s)) errs.push(`agent ${a.id} → unknown tool ${s}`);
  return errs;
}

function save(m) {
  const errs = validate(m);
  if (errs.length) die(`refusing to write invalid manifest:\n  - ${errs.join('\n  - ')}`);
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
  console.log(`${C.green}✓ manifest updated${C.reset} ${C.dim}(${MANIFEST})${C.reset}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const m = read();

if (!cmd || cmd === 'list') {
  console.log(`${C.bold}${m.server.name} v${m.server.version}${C.reset}`);
  for (const t of m.tools) {
    const dot = t.enabled ? `${C.green}●${C.reset}` : `${C.dim}○${C.reset}`;
    console.log(`  ${dot} ${C.cyan}${t.id}${C.reset} ${C.dim}[${t.category}] ${t.route.method} ${t.route.path} (${t.route.kind})${C.reset}`);
  }
  console.log(`${C.dim}agents:${C.reset}`);
  for (const a of m.agents) console.log(`  ${C.yellow}${a.id}${C.reset} → ${a.skills.join(', ')}`);
  process.exit(0);
}

if (cmd === 'enable' || cmd === 'disable') {
  const id = rest[0];
  const t = m.tools.find((x) => x.id === id);
  if (!t) die(`unknown tool: ${id}`);
  t.enabled = cmd === 'enable';
  save(m);
  console.log(`${C.bold}${id}${C.reset} → ${t.enabled ? `${C.green}enabled` : `${C.yellow}disabled`}${C.reset}`);
  process.exit(0);
}

if (cmd === 'add') {
  const [id, category, path, method, kind] = rest;
  if (!id || !category || !path || !method || !kind) {
    die('usage: add <toolId> <category> <path> <GET|POST> <json|sse|binary> [--auth] [--agent=<id>]');
  }
  if (m.tools.some((t) => t.id === id)) die(`tool already exists: ${id}`);
  const auth = rest.includes('--auth');
  const agentArg = rest.find((r) => r.startsWith('--agent='));
  m.tools.push({
    id, title: id.replace(/_/g, ' '), description: `Auto-installed competency: ${id}`,
    category, enabled: true, route: { path, method, kind, auth },
  });
  if (agentArg) {
    const agentId = agentArg.split('=')[1];
    const agent = m.agents.find((a) => a.id === agentId);
    if (!agent) die(`unknown agent: ${agentId}`);
    agent.skills.push(id);
  }
  save(m);
  console.log(`${C.green}✓ installed skill${C.reset} ${C.cyan}${id}${C.reset}${agentArg ? ` → ${agentArg.split('=')[1]}` : ''}`);
  console.log(`${C.dim}restart the MCP server to expose it.${C.reset}`);
  process.exit(0);
}

die(`unknown command: ${cmd} (use: list | enable | disable | add)`);
