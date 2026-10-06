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
- `WORKER_INTERNAL_TOKEN` (must match the application)
- `VOICE_V2V_WS_TOKEN_SECRET` (must match the application; existing Supabase service-role secret is a compatibility fallback)

The service expects app-side STT/TTS endpoints:

- `POST /api/agent-g/calls/transcribe`
- `POST /api/agent-g/calls/tts`
- `POST /api/agent-g/calls/chat`

Transcription and dialog use Gemini through the app's selected Google transport. TTS uses ElevenLabs. The gateway holds no AI provider credentials. WebSocket connections require an unexpired signed token for an authenticated user from `/api/voice/realtime/session`. Missing worker/session secrets fail startup.

and should be paired with `VOICE_V2V_WS_URL=ws://localhost:8787/realtime`.
