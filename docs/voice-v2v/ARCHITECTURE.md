# Voice V2V Architecture (myavatar.ge)

## Frontend Structure (React/Next.js)

- `hooks/useVoiceInput.ts`
  - AudioWorklet capture (`public/worklets/pcm-capture-processor.js`)
  - Local adaptive VAD
  - Full-duplex websocket frames
  - Partial/final transcript handling
  - Interruption kill-switch when user barges in while TTS is speaking
- `components/voice/RealtimeWaveform.tsx`
  - High-fidelity canvas waveform driven by `AnalyserNode`
  - Visual state response for idle/listening/processing/speaking/error
- `components/dashboard/MatildaVoiceChat.tsx`
  - Realtime voice panel
  - State badges + mic toggle + language selector (`GE`, `EN`, `RU`) + reset
  - Partial transcript and assistant streaming text
- `types/voice.ts`
  - Shared websocket frame contracts (`VoiceClientFrame`, `VoiceServerFrame`)
  - Realtime state + language types

## Session Bootstrap

- `app/api/voice/realtime/session/route.ts`
  - Issues short-lived websocket token
  - Returns websocket URL, sample rate, and provider snapshot
- `lib/voice-v2v/session.ts`
  - HMAC token issue/verify helpers for realtime sessions

## Provider Integration Layer

- `lib/voice-v2v/providers.ts`
  - STT: OpenAI transcription path + Deepgram Nova-2 path with fallback
  - LLM: streamed token generation (`chat.completions` stream)
  - Semantic chunk accumulator for pre-emptive synthesis
  - TTS: ElevenLabs Multilingual v2 + Cartesia Sonic fallback

## Existing API Routes Upgraded

- `app/api/agent-g/calls/transcribe/route.ts`
  - Now accepts realtime audio payloads and delegates to provider STT
- `app/api/agent-g/calls/tts/route.ts`
  - Now synthesizes real audio via provider layer

## Standalone Websocket Handler Deliverables

- Node.js handler: `docs/voice-v2v/node-ws-handler.mjs`
- FastAPI handler: `docs/voice-v2v/fastapi-ws-handler.py`

Both implement:
- Full-duplex websocket protocol
- VAD speech boundary handling
- Streaming assistant token flow
- Pre-emptive TTS chunk generation
- Immediate interruption kill-switch

## Latency Target (< 800ms)

Recommended budget:
- Capture + VAD decision: 60-120ms
- STT finalization for turn chunk: 140-220ms
- First LLM semantic chunk: 120-220ms
- First TTS bytes: 120-220ms
- Browser decode/start playback: 60-120ms

Total target: ~500-780ms for first spoken token.

## Environment Keys

Add:
- `VOICE_V2V_WS_URL`
- `NEXT_PUBLIC_VOICE_V2V_WS_URL`
- `VOICE_V2V_WS_TOKEN_SECRET`
- `VOICE_V2V_STT_PROVIDER=openai|deepgram`
- `VOICE_V2V_TTS_PROVIDER=elevenlabs|cartesia`
- `VOICE_V2V_STT_MODEL`
- `VOICE_V2V_LLM_MODEL`
- `VOICE_V2V_DEEPGRAM_MODEL`
- `DEEPGRAM_API_KEY`
- `CARTESIA_API_KEY`
- `CARTESIA_VOICE_ID`
- `CARTESIA_MODEL_ID`
