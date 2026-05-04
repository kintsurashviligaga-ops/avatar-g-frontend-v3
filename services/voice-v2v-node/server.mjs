import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import { WebSocketServer } from 'ws';

const PORT = Number(process.env.VOICE_V2V_PORT || 8787);
const APP_HTTP_BASE = String(process.env.APP_HTTP_BASE || 'http://localhost:3000').replace(/\/$/, '');
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const LLM_MODEL = String(process.env.VOICE_V2V_LLM_MODEL || 'gpt-4o-mini').trim();

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function send(ws, payload) {
  if (ws.readyState !== ws.OPEN) {
    return;
  }

  ws.send(JSON.stringify(payload));
}

function extractBase64FromDataUrl(dataUrl) {
  const value = String(dataUrl || '');
  const index = value.indexOf(',');
  if (index === -1) {
    return '';
  }

  return value.slice(index + 1);
}

function createSemanticAccumulator(minChunkChars = 64) {
  let buffer = '';

  return {
    push(token) {
      buffer += token;
      const chunks = [];

      const sentence = buffer.match(/(.+?[\.!?])(?:\s|$)/);
      if (sentence?.[1] && sentence[1].length >= Math.max(16, minChunkChars * 0.6)) {
        chunks.push(sentence[1].trim());
        buffer = buffer.slice(sentence[0].length).trim();
        return chunks;
      }

      if (buffer.length >= minChunkChars) {
        const splitAt = buffer.lastIndexOf(' ');
        if (splitAt > 24) {
          chunks.push(buffer.slice(0, splitAt).trim());
          buffer = buffer.slice(splitAt + 1).trim();
        }
      }

      return chunks;
    },
    flush() {
      const finalChunk = buffer.trim();
      buffer = '';
      return finalChunk || null;
    },
  };
}

async function callRealtimeTranscribe(payload) {
  const response = await fetch(`${APP_HTTP_BASE}/api/agent-g/calls/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`stt_http_${response.status}`);
  }

  const result = await response.json();
  return result?.data || {};
}

async function callRealtimeTts(payload) {
  const response = await fetch(`${APP_HTTP_BASE}/api/agent-g/calls/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`tts_http_${response.status}`);
  }

  const result = await response.json();
  return result?.data || {};
}

async function transcribePartialIfNeeded(session) {
  if (session.partialBusy) {
    return;
  }

  const now = Date.now();
  if (now - session.lastPartialAt < 260) {
    return;
  }

  if (session.partialFrames.length < 5) {
    return;
  }

  session.partialBusy = true;
  session.lastPartialAt = now;

  const audioBase64 = Buffer.concat(session.partialFrames).toString('base64');

  try {
    const partial = await callRealtimeTranscribe({
      audioBase64,
      language: session.language,
      sampleRate: 16_000,
      mimeType: 'audio/wav',
      isFinal: false,
    });

    const text = String(partial.transcript || '').trim();
    if (text && session.ws.readyState === session.ws.OPEN) {
      send(session.ws, {
        type: 'stt.partial',
        text,
        language: session.language,
      });
    }
  } catch {
    // Partial STT is best-effort.
  } finally {
    session.partialBusy = false;
    session.partialFrames = session.partialFrames.slice(-3);
  }
}

async function* streamAssistantTokens({ language, transcript, history, abortSignal }) {
  if (!OPENAI_API_KEY) {
    yield language === 'ka-GE'
      ? 'მესმის. მოთხოვნას ვამუშავებ.'
      : language === 'ru-RU'
      ? 'Понял. Обрабатываю запрос.'
      : 'Understood. Processing your request.';
    return;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      stream: true,
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content: language === 'ka-GE'
            ? 'You are Agent G. Reply in concise spoken Georgian and keep it natural.'
            : language === 'ru-RU'
            ? 'You are Agent G. Reply in concise spoken Russian and keep it natural.'
            : 'You are Agent G. Reply in concise spoken English and keep it natural.',
        },
        ...history.slice(-6),
        {
          role: 'user',
          content: transcript,
        },
      ],
    }),
    signal: abortSignal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`llm_http_${response.status}`);
  }

  const decoder = new TextDecoder();
  let buffered = '';

  for await (const chunk of response.body) {
    buffered += decoder.decode(chunk, { stream: true });

    let breakIndex = buffered.indexOf('\n');
    while (breakIndex !== -1) {
      const line = buffered.slice(0, breakIndex).trim();
      buffered = buffered.slice(breakIndex + 1);
      breakIndex = buffered.indexOf('\n');

      if (!line.startsWith('data:')) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }

      const parsed = parseJsonSafe(payload);
      const token = parsed?.choices?.[0]?.delta?.content;
      if (token) {
        yield token;
      }
    }
  }
}

function interruptSession(session, reason = 'interrupt') {
  session.generation += 1;

  for (const controller of session.controllers) {
    controller.abort();
  }

  session.controllers.clear();

  send(session.ws, {
    type: 'tts.stopped',
    reason,
  });
}

async function synthesizeAndSendChunk(session, text, generationAtStart) {
  if (!text.trim() || generationAtStart !== session.generation) {
    return;
  }

  const tts = await callRealtimeTts({
    text,
    language: session.language,
  });

  if (generationAtStart !== session.generation) {
    return;
  }

  send(session.ws, {
    type: 'tts.audio',
    chunkId: randomUUID(),
    mimeType: tts.mimeType || 'audio/mpeg',
    audioBase64: extractBase64FromDataUrl(tts.audioDataUrl || ''),
  });
}

async function processSpeechTurn(session) {
  const frames = session.audioFrames;
  session.audioFrames = [];

  if (!frames.length) {
    return;
  }

  const audioBase64 = Buffer.concat(frames).toString('base64');

  const stt = await callRealtimeTranscribe({
    audioBase64,
    language: session.language,
    sampleRate: 16_000,
    mimeType: 'audio/wav',
    isFinal: true,
  });

  const transcript = String(stt.transcript || '').trim();
  if (!transcript) {
    return;
  }

  send(session.ws, {
    type: 'stt.final',
    text: transcript,
    language: session.language,
  });

  session.history.push({ role: 'user', content: transcript });

  const generationAtStart = ++session.generation;
  const chunker = createSemanticAccumulator();
  let assistantText = '';

  const controller = new AbortController();
  session.controllers.add(controller);

  try {
    for await (const token of streamAssistantTokens({
      language: session.language,
      transcript,
      history: session.history,
      abortSignal: controller.signal,
    })) {
      if (generationAtStart !== session.generation) {
        return;
      }

      assistantText += token;
      send(session.ws, {
        type: 'assistant.partial',
        text: assistantText,
      });

      const readyChunks = chunker.push(token);
      for (const chunk of readyChunks) {
        await synthesizeAndSendChunk(session, chunk, generationAtStart);
      }
    }

    const tail = chunker.flush();
    if (tail) {
      await synthesizeAndSendChunk(session, tail, generationAtStart);
    }

    if (generationAtStart === session.generation) {
      send(session.ws, {
        type: 'assistant.final',
        text: assistantText,
      });

      send(session.ws, {
        type: 'tts.end',
      });

      session.history.push({ role: 'assistant', content: assistantText });
    }
  } finally {
    session.controllers.delete(controller);
  }
}

const server = createServer();
const wss = new WebSocketServer({ server, path: '/realtime' });

wss.on('connection', (ws) => {
  const session = {
    ws,
    sessionId: randomUUID(),
    language: 'ka-GE',
    audioFrames: [],
    partialFrames: [],
    partialBusy: false,
    lastPartialAt: 0,
    history: [],
    generation: 0,
    controllers: new Set(),
  };

  send(ws, {
    type: 'session.ready',
    sessionId: session.sessionId,
    sttProvider: process.env.VOICE_V2V_STT_PROVIDER || 'openai',
    ttsProvider: process.env.VOICE_V2V_TTS_PROVIDER || 'elevenlabs',
  });

  ws.on('message', async (raw) => {
    const frame = parseJsonSafe(String(raw || ''));
    if (!frame || typeof frame !== 'object') {
      return;
    }

    try {
      if (frame.type === 'session.start') {
        session.language = frame.language || 'ka-GE';
        return;
      }

      if (frame.type === 'audio.chunk') {
        const audioBase64 = String(frame.audioBase64 || '');
        if (audioBase64) {
          const frameBytes = Buffer.from(audioBase64, 'base64');
          session.audioFrames.push(frameBytes);
          session.partialFrames.push(frameBytes);
        }

        void transcribePartialIfNeeded(session);
        return;
      }

      if (frame.type === 'vad.event' && frame.event === 'speech_start') {
        interruptSession(session, 'barge_in');
        return;
      }

      if (frame.type === 'vad.event' && frame.event === 'speech_end') {
        await processSpeechTurn(session);
        return;
      }

      if (frame.type === 'control.interrupt') {
        interruptSession(session, frame.reason || 'client_interrupt');
        return;
      }

      if (frame.type === 'session.stop') {
        interruptSession(session, frame.reason || 'session_stop');
        ws.close(1000, 'session_stopped');
      }
    } catch (error) {
      send(ws, {
        type: 'error',
        code: 'pipeline_failed',
        message: error instanceof Error ? error.message : 'pipeline_failed',
      });
    }
  });

  ws.on('close', () => {
    interruptSession(session, 'socket_closed');
  });
});

server.listen(PORT, () => {
  console.log(`[voice-v2v-node] ws://localhost:${PORT}/realtime`);
});
