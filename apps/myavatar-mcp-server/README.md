# MyAvatar MCP Server

The universal **tool bus** ("USB port") for MyAvatar.ge. A standalone Node/TypeScript
[Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
produce / jobs / voice pipelines as schema-defined MCP **tools**, so any MCP client
— **Claude Code**, Claude Desktop, or an automation runtime — can drive the platform
through one decoupled, standardized interface.

It holds **no vendor SDKs and no business logic**: every tool forwards to the deployed
MyAvatar HTTP API (the same routes the browser uses), so there is a single source of
truth for generation, credits, and billing.

## Tools (manifest-gated)

Exposed only when `enabled: true` in [`../../.mcp/skills-manifest.json`](../../.mcp/skills-manifest.json):

| Tool | Maps to | Purpose |
|------|---------|---------|
| `database_jobs_sync` | `GET /api/orchestrator/jobs` | Read `generation_jobs` (reload-recovery state) |
| `hardware_gpu_render` | `POST /api/orchestrator/produce` (SSE) | Full 30s film pipeline → signed master URL |
| `synthesis_voice_ka` | `POST /api/elevenlabs/tts` | Premium Georgian TTS → base64 audio/mpeg |

Every handler is **failure-isolated**: a thrown error becomes a structured MCP error
(`isError: true`) — it never crashes the server or locks the connected client.

## Setup

```bash
# from the repo root
npm run mcp:install      # installs deps + builds dist/
```

Then connect:

- **Claude Code** auto-loads the repo-root [`.mcp.json`](../../.mcp.json). Set
  `MYAVATAR_API_TOKEN` there (a Supabase bearer JWT) to unlock the authed
  produce/jobs tools.
- **Anything else**: `node apps/myavatar-mcp-server/dist/index.js` over stdio.

### Env

| Var | Default | Notes |
|-----|---------|-------|
| `MYAVATAR_API_BASE` | `https://myavatar.ge` | API origin the tools forward to |
| `MYAVATAR_API_TOKEN` | — | Supabase JWT for authed produce/jobs routes |
| `MYAVATAR_MCP_MANIFEST` | `../../.mcp/skills-manifest.json` | manifest path override |

## Installing a new skill (no code changes)

The manifest is the install surface. Use the harness:

```bash
npm run mcp:skill list
npm run mcp:skill enable  hardware_gpu_render
npm run mcp:skill disable synthesis_voice_ka
# install a brand-new competency and route it to an agent:
npm run mcp:skill add image_upscale_4k vision /api/orchestrator/image/produce POST sse --agent=video-swarm
```

Every write is re-validated against the shared zod contract
(`lib/mcp/skills-manifest.ts`), so an invalid install can never ship. Restart the
server to expose the change.

## Verify

```bash
npm --prefix apps/myavatar-mcp-server run build      # tsc → dist/
# live protocol check (initialize + tools/list) is in the repo's CI notes
```
