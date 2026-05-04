import { expect, test } from '@playwright/test';

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test('voice panel transitions and barge-in interruption', async ({ page }) => {
  await page.addInitScript(() => {
    type VoiceFrame = { type?: string; [key: string]: unknown };

    const runtime = window as Window & {
      __voiceFrames?: VoiceFrame[];
      __voiceV2vTest?: {
        emitFrames: (rms: number, count?: number) => void;
      };
      WebSocket: typeof WebSocket;
    };

    runtime.__voiceFrames = [];

    const toPcmBase64 = (samples = 32000): string => {
      const pcm = new Int16Array(samples);
      for (let index = 0; index < pcm.length; index += 1) {
        pcm[index] = Math.round(Math.sin(index / 8) * 1300);
      }

      const bytes = new Uint8Array(pcm.buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index] || 0);
      }

      return btoa(binary);
    };

    const ttsPcmBase64 = toPcmBase64();

    class MockWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;

      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor() {
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event('open'));
        }, 0);
      }

      send(raw: string): void {
        const frame = JSON.parse(String(raw || '{}')) as VoiceFrame;
        runtime.__voiceFrames?.push(frame);

        if (frame.type === 'session.start') {
          this.serverSend({
            type: 'session.ready',
            sessionId: frame.sessionId || 'smoke-session',
            sttProvider: 'openai-whisper-3-turbo',
            ttsProvider: 'elevenlabs-multilingual-v2',
          }, 0);
          return;
        }

        if (frame.type === 'vad.event' && frame.event === 'speech_end') {
          this.serverSend({ type: 'stt.final', text: 'ტესტური ტრანსკრიპტი', language: 'ka-GE' }, 15);
          this.serverSend({ type: 'assistant.partial', text: 'ტესტური პასუხი მზადდება' }, 35);
          this.serverSend(
            {
              type: 'tts.audio',
              chunkId: 'chunk-1',
              mimeType: 'audio/pcm',
              audioBase64: ttsPcmBase64,
            },
            60,
          );
          return;
        }

        if (frame.type === 'control.interrupt') {
          this.serverSend({ type: 'tts.stopped', reason: frame.reason || 'barge_in' }, 5);
          return;
        }

        if (frame.type === 'session.stop') {
          this.close();
        }
      }

      close(): void {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(new CloseEvent('close', { code: 1000, reason: 'client_close' }));
      }

      private serverSend(payload: VoiceFrame, delayMs: number): void {
        setTimeout(() => {
          if (this.readyState !== MockWebSocket.OPEN) {
            return;
          }

          this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
        }, delayMs);
      }
    }

    const NativeWebSocket = runtime.WebSocket;

    class PatchedWebSocket {
      static readonly CONNECTING = NativeWebSocket.CONNECTING;
      static readonly OPEN = NativeWebSocket.OPEN;
      static readonly CLOSING = NativeWebSocket.CLOSING;
      static readonly CLOSED = NativeWebSocket.CLOSED;

      constructor(url: string | URL, protocols?: string | string[]) {
        const value = String(url || '');
        if (value.includes('voice-mock')) {
          return new MockWebSocket();
        }

        if (typeof protocols === 'undefined') {
          return new NativeWebSocket(url);
        }

        return new NativeWebSocket(url, protocols);
      }
    }

    runtime.WebSocket = PatchedWebSocket as unknown as typeof WebSocket;
  });

  await page.route('**/api/voice/realtime/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        data: {
          sessionId: 'smoke-session',
          token: 'smoke-token',
          wsUrl: 'ws://voice-mock/realtime',
          sampleRate: 16000,
          targetLatencyMs: 800,
          providers: {
            stt: 'openai-whisper-3-turbo',
            tts: 'elevenlabs-multilingual-v2',
          },
        },
      }),
    });
  });

  await page.goto('/ka/voice-smoke');
  await expect(page.getByRole('heading', { name: /Voice Realtime Smoke/i })).toBeVisible({ timeout: 20000 });

  await expect(page.getByTestId('matilda-open')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('matilda-open').click();

  const status = page.getByTestId('matilda-status');
  await expect(status).toContainText(/მზად ვარ|Ready/i);

  await page.getByTestId('matilda-mic-toggle').click();
  await expect(status).toContainText(/გისმენ|Listening/i);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const frames = (window as Window & {
          __voiceFrames?: Array<{ type?: string }>;
        }).__voiceFrames || [];

        return frames.some((frame) => frame.type === 'session.start');
      });
    }, { timeout: 15000 })
    .toBe(true);

  await page.evaluate(() => {
    const debug = (window as Window & {
      __voiceV2vTest?: {
        emitFrames: (rms: number, count?: number) => void;
      };
    }).__voiceV2vTest;

    debug?.emitFrames(0.09, 4);
    debug?.emitFrames(0.001, 12);
  });

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const frames = (window as Window & {
          __voiceFrames?: Array<{ type?: string; event?: string }>;
        }).__voiceFrames || [];

        return frames.some((frame) => frame.type === 'vad.event' && frame.event === 'speech_end');
      });
    }, { timeout: 10000 })
    .toBe(true);

  await expect(status).toContainText(/ვლაპარაკობ|Speaking/i, { timeout: 10000 });

  await page.evaluate(() => {
    const debug = (window as Window & {
      __voiceV2vTest?: {
        emitFrames: (rms: number, count?: number) => void;
      };
    }).__voiceV2vTest;

    debug?.emitFrames(0.09, 3);
  });

  await expect(status).toContainText(/გისმენ|Listening/i, { timeout: 10000 });

  const interruptionSent = await page.evaluate(() => {
    const frames = (window as Window & {
      __voiceFrames?: Array<{ type?: string; reason?: string }>;
    }).__voiceFrames || [];

    return frames.some((frame) => frame.type === 'control.interrupt' && frame.reason === 'barge_in');
  });

  expect(interruptionSent).toBe(true);
});
