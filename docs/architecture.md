# MyAvatar.ge Enterprise Architecture

## A) System Architecture

- **Frontend**: Next.js App Router (`app/`), locale-routed UI (`/ka`, `/en`, `/ru`), shared shell (`AppShell`) and unified service workspace (`UnifiedServiceLayout`).
- **Chat API**: `app/api/chat/route.ts` is the central request entrypoint. It normalizes payloads from main chat and service chats.
- **AI Execution Layer**: `lib/ai/chatEngine.ts` handles agent resolution, model routing (`gpt-4.1` / `gpt-4o`), token/cost metadata, and streaming support.
- **Media Generation**: Replicate endpoints under `app/api/replicate/*` route image/video/audio generation through server-only tokens.
- **Storage/Identity**: Supabase auth/session (optional for demo mode) with future object storage path for generated assets.
- **Observability**: Vercel runtime logs + health endpoint (`/api/health`) for deployment/version/env checks.

## B) AI Agent Brain Structure

Each service has an explicit agent profile:

- `avatar` → image-centric agent
- `video`/`editing` → video-centric agent
- `music`/`audio` → audio-centric agent
- `business`/`software` → strategic + planning agent
- `agent-g` → orchestration/meta agent

Agent contract:

1. **System prompt** from agent registry
2. **Context enrichment** with serviceId + locale + attachments metadata
3. **Tool mapping** for text vs media tasks
4. **Response policy**: language-aware, concise, production-safe output

## C) Agent G Router

Routing rules:

1. Use `serviceId` + `context` to pick base agent.
2. If user intent is text/planning -> route to GPT (`chatEngine`).
3. If user intent is media generation -> route to Replicate endpoint.
4. If attachments exist -> inject sanitized file context in chat engine.
5. Return unified response envelope for all clients.

Model strategy:

- Default: `gpt-4o` for speed
- Upgrade: `gpt-4.1` for complex/long/executive flows
- Fallback: automatic downgrade to `gpt-4o` when `gpt-4.1` fails

## D) Monetization & Environment Architecture

- **Free Demo Mode**: `NEXT_PUBLIC_DEMO_MODE=true` allows testing service chats without login.
- **Paid Plans**: Pricing page and billing APIs remain for authenticated flows.
- **Credits/Usage**: Daily budget controls and usage metadata placeholders already exist in API guard/chat engine.
- **Stripe Future-Ready**: Existing billing/connect routes support upgrade path to full subscription and marketplace payouts.

## Security & Governance Notes

- Keep API keys server-side only (`OPENAI_API_KEY`, `REPLICATE_API_TOKEN`).
- Keep service routes public in demo mode, protect only user-data routes (`/dashboard`, billing, saved assets).
- Keep locale-aware canonical routing to avoid duplicate/legacy rendering.
