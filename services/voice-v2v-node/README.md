# Voice V2V Node Service

Low-latency websocket gateway for realtime voice conversations.

## Quick Start

From repository root:

- Start service with auto-install: `npm run voice:v2v`

Or manually:

1. `cd services/voice-v2v-node`
2. `npm install`
3. `npm run start`

## Environment

- `VOICE_V2V_PORT` (default: `8787`)
- `APP_HTTP_BASE` (default: `http://localhost:3000`)
- `OPENAI_API_KEY`
- `VOICE_V2V_LLM_MODEL` (default: `gpt-4o-mini`)

The service expects app-side STT/TTS endpoints:

- `POST /api/agent-g/calls/transcribe`
- `POST /api/agent-g/calls/tts`

and should be paired with `VOICE_V2V_WS_URL=ws://localhost:8787/realtime`.
