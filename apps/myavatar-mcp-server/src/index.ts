#!/usr/bin/env node
/**
 * MyAvatar MCP Server (stdio) — the universal "USB port".
 *
 * Reads the declarative skills manifest (.mcp/skills-manifest.json), exposes ONLY
 * the enabled tools, and forwards each to the deployed MyAvatar API. Every tool
 * handler is failure-isolated: a thrown error becomes a structured MCP error
 * (isError) — it never crashes the server or locks the connected client, so the
 * Main Agent can fall back locally while the chat keeps running.
 *
 * Connect from Claude Code via the repo-root .mcp.json, or from Claude Desktop /
 * any MCP client by spawning `node dist/index.js`.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS, type ToolResult } from './tools.js';

const here = dirname(fileURLToPath(import.meta.url));

interface ManifestLite {
  server: { name: string; version: string };
  tools: Array<{ id: string; enabled: boolean }>;
}

function loadManifest(): ManifestLite {
  // dist/index.js → ../../.mcp/skills-manifest.json (package root is one up from dist).
  const path = process.env.MYAVATAR_MCP_MANIFEST ?? join(here, '..', '..', '..', '.mcp', 'skills-manifest.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ManifestLite;
  } catch (e) {
    console.error(`[myavatar-mcp] could not read manifest at ${path}: ${e instanceof Error ? e.message : e}`);
    return { server: { name: 'myavatar-mcp-server', version: '0.1.0' }, tools: TOOLS.map((t) => ({ id: t.id, enabled: true })) };
  }
}

async function main(): Promise<void> {
  const manifest = loadManifest();
  const enabled = new Set(manifest.tools.filter((t) => t.enabled).map((t) => t.id));
  const server = new McpServer({ name: manifest.server.name, version: manifest.server.version });

  const registered: string[] = [];
  for (const def of TOOLS) {
    if (!enabled.has(def.id)) continue; // manifest gate — disabled skills are never exposed
    server.tool(
      def.id,
      def.description,
      def.params,
      // Failure isolation boundary: a tool crash is contained as a structured error.
      (async (args: Record<string, unknown>): Promise<ToolResult> => {
        try {
          return await def.handler(args);
        } catch (e) {
          return { content: [{ type: 'text', text: `[${def.id}] failed: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
        }
      }) as never,
    );
    registered.push(def.id);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP wire protocol.
  console.error(`[myavatar-mcp] ready · tools: ${registered.join(', ') || '(none enabled)'}`);
}

main().catch((e) => {
  console.error('[myavatar-mcp] fatal:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
