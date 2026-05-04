"""
FastAPI realtime V2V websocket handler (reference implementation)

pip install fastapi uvicorn httpx
uvicorn fastapi-ws-handler:app --host 0.0.0.0 --port 8788
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

APP_HTTP_BASE = os.getenv("APP_HTTP_BASE", "http://localhost:3000").rstrip("/")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
LLM_MODEL = os.getenv("VOICE_V2V_LLM_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

app = FastAPI(title="voice-v2v-fastapi")


@dataclass
class VoiceSession:
    websocket: WebSocket
    session_id: str
    language: str = "ka-GE"
    audio_frames: list[bytes] = field(default_factory=list)
    partial_frames: list[bytes] = field(default_factory=list)
    partial_busy: bool = False
    last_partial_at_ms: float = 0.0
    generation: int = 0
    controllers: set[asyncio.Task[Any]] = field(default_factory=set)
    history: list[dict[str, str]] = field(default_factory=list)


def semantic_chunks_push(buffer: str, token: str, min_chars: int = 64) -> tuple[str, list[str]]:
    buffer += token
    chunks: list[str] = []

    sentence = re.search(r"(.+?[.!?])(?:\s|$)", buffer)
    if sentence and len(sentence.group(1)) >= max(16, int(min_chars * 0.6)):
        chunks.append(sentence.group(1).strip())
        buffer = buffer[len(sentence.group(0)) :].strip()
        return buffer, chunks

    if len(buffer) >= min_chars:
        split_at = buffer.rfind(" ")
        if split_at > 24:
            chunks.append(buffer[:split_at].strip())
            buffer = buffer[split_at + 1 :].strip()

    return buffer, chunks


async def ws_send(ws: WebSocket, payload: dict[str, Any]) -> None:
    await ws.send_text(json.dumps(payload, ensure_ascii=False))


async def call_transcribe(audio_base64: str, language: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            f"{APP_HTTP_BASE}/api/agent-g/calls/transcribe",
            json={
                "audioBase64": audio_base64,
                "language": language,
                "sampleRate": 16000,
                "mimeType": "audio/wav",
                "isFinal": True,
            },
        )

    response.raise_for_status()
    payload = response.json()
    return payload.get("data", {})


async def call_tts(text: str, language: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            f"{APP_HTTP_BASE}/api/agent-g/calls/tts",
            json={
                "text": text,
                "language": language,
                "voiceStyle": "realtime",
            },
        )

    response.raise_for_status()
    payload = response.json()
    return payload.get("data", {})


async def transcribe_partial_if_needed(session: VoiceSession) -> None:
    if session.partial_busy:
        return

    now_ms = asyncio.get_running_loop().time() * 1000
    if now_ms - session.last_partial_at_ms < 260:
        return

    if len(session.partial_frames) < 5:
        return

    session.partial_busy = True
    session.last_partial_at_ms = now_ms

    try:
        partial_bytes = b"".join(session.partial_frames)
        stt = await call_transcribe(base64.b64encode(partial_bytes).decode("utf-8"), session.language)
        text = str(stt.get("transcript", "")).strip()
        if text:
            await ws_send(session.websocket, {"type": "stt.partial", "text": text, "language": session.language})
    except Exception:  # noqa: BLE001
        pass
    finally:
        session.partial_busy = False
        session.partial_frames = session.partial_frames[-3:]


def parse_data_url(data_url: str) -> str:
    if "," not in data_url:
        return ""
    return data_url.split(",", 1)[1]


async def stream_assistant_tokens(language: str, transcript: str, history: list[dict[str, str]]) -> AsyncGenerator[str, None]:
    if not OPENAI_API_KEY:
        if language == "ka-GE":
            yield "მესმის. ახლავე ვამუშავებ მოთხოვნას."
            return
        if language == "ru-RU":
            yield "Понял. Уже обрабатываю запрос."
            return
        yield "Understood. Processing your request now."
        return

    system_prompt = (
        "You are Agent G for myavatar.ge. Keep replies concise and voice-friendly. "
        "Preserve technical words and slang naturally. "
    )
    if language == "ka-GE":
        system_prompt += "Reply in Georgian by default."
    elif language == "ru-RU":
        system_prompt += "Reply in Russian by default."
    else:
        system_prompt += "Reply in English by default."

    request_body = {
        "model": LLM_MODEL,
        "stream": True,
        "temperature": 0.35,
        "messages": [
            {"role": "system", "content": system_prompt},
            *history[-6:],
            {"role": "user", "content": transcript},
        ],
    }

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=request_body,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    continue
                try:
                    item = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                token = item.get("choices", [{}])[0].get("delta", {}).get("content")
                if token:
                    yield token


async def interrupt_session(session: VoiceSession, reason: str) -> None:
    session.generation += 1
    for task in list(session.controllers):
        task.cancel()
    session.controllers.clear()
    await ws_send(session.websocket, {"type": "tts.stopped", "reason": reason})


async def process_turn(session: VoiceSession) -> None:
    if not session.audio_frames:
        return

    merged = b"".join(session.audio_frames)
    session.audio_frames = []

    stt = await call_transcribe(base64.b64encode(merged).decode("utf-8"), session.language)
    transcript = str(stt.get("transcript", "")).strip()
    if not transcript:
        return

    await ws_send(session.websocket, {"type": "stt.final", "text": transcript, "language": session.language})

    session.history.append({"role": "user", "content": transcript})
    generation_at_start = session.generation + 1
    session.generation = generation_at_start

    token_buffer = ""
    assistant_text = ""

    async def synthesize_chunk(chunk_text: str) -> None:
        if generation_at_start != session.generation:
            return
        tts = await call_tts(chunk_text, session.language)
        if generation_at_start != session.generation:
            return
        await ws_send(
            session.websocket,
            {
                "type": "tts.audio",
                "chunkId": str(uuid.uuid4()),
                "mimeType": tts.get("mimeType", "audio/mpeg"),
                "audioBase64": parse_data_url(str(tts.get("audioDataUrl", ""))),
            },
        )

    stream_task = asyncio.current_task()
    if stream_task:
        session.controllers.add(stream_task)

    try:
        async for token in stream_assistant_tokens(session.language, transcript, session.history):
            if generation_at_start != session.generation:
                return

            assistant_text += token
            await ws_send(session.websocket, {"type": "assistant.partial", "text": assistant_text})

            token_buffer, chunks = semantic_chunks_push(token_buffer, token)
            for chunk in chunks:
                await synthesize_chunk(chunk)

        remainder = token_buffer.strip()
        if remainder:
            await synthesize_chunk(remainder)

        if generation_at_start == session.generation:
            await ws_send(session.websocket, {"type": "assistant.final", "text": assistant_text})
            await ws_send(session.websocket, {"type": "tts.end"})
            session.history.append({"role": "assistant", "content": assistant_text})
    finally:
        if stream_task in session.controllers:
            session.controllers.remove(stream_task)


@app.websocket("/realtime")
async def realtime_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    session = VoiceSession(
        websocket=websocket,
        session_id=str(uuid.uuid4()),
    )

    await ws_send(
        websocket,
        {
            "type": "session.ready",
            "sessionId": session.session_id,
            "sttProvider": os.getenv("VOICE_V2V_STT_PROVIDER", "openai"),
            "ttsProvider": os.getenv("VOICE_V2V_TTS_PROVIDER", "elevenlabs"),
        },
    )

    try:
        while True:
            raw = await websocket.receive_text()
            frame = json.loads(raw)
            frame_type = frame.get("type")

            if frame_type == "session.start":
                session.language = frame.get("language", "ka-GE")
                continue

            if frame_type == "audio.chunk":
                audio_b64 = str(frame.get("audioBase64", ""))
                if audio_b64:
                    frame_bytes = base64.b64decode(audio_b64)
                    session.audio_frames.append(frame_bytes)
                    session.partial_frames.append(frame_bytes)

                asyncio.create_task(transcribe_partial_if_needed(session))
                continue

            if frame_type == "vad.event" and frame.get("event") == "speech_start":
                await interrupt_session(session, "barge_in")
                continue

            if frame_type == "vad.event" and frame.get("event") == "speech_end":
                await process_turn(session)
                continue

            if frame_type == "control.interrupt":
                await interrupt_session(session, frame.get("reason", "client_interrupt"))
                continue

            if frame_type == "session.stop":
                await interrupt_session(session, frame.get("reason", "session_stop"))
                await websocket.close(code=1000)
                break

    except WebSocketDisconnect:
        await interrupt_session(session, "socket_closed")
    except Exception as exc:  # noqa: BLE001
        await ws_send(websocket, {"type": "error", "code": "pipeline_failed", "message": str(exc)})
        await interrupt_session(session, "pipeline_failed")
