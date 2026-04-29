'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Bold,
  Bot,
  Camera,
  Code2,
  Globe2,
  Italic,
  List,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Send,
  TerminalSquare,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEventHandler, MouseEventHandler } from 'react';

import { useOmniStore } from './store';
import type { CommandLanguage } from './types';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

type CameraState = 'idle' | 'requesting' | 'ready' | 'error';

const LANGUAGE_META: Array<{ id: CommandLanguage; short: string; label: string; speechCode: string }> = [
  { id: 'ka', short: 'KA', label: 'ქართული', speechCode: 'ka-GE' },
  { id: 'en', short: 'EN', label: 'English', speechCode: 'en-US' },
  { id: 'ru', short: 'RU', label: 'Русский', speechCode: 'ru-RU' },
];

function resolveSpeechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function PrimaryAgentChat() {
  const messages = useOmniStore((state) => state.chatMessages);
  const activeServiceId = useOmniStore((state) => state.activeServiceId);
  const commandLanguage = useOmniStore((state) => state.commandLanguage);
  const pendingInputs = useOmniStore((state) => state.pendingInputs);

  const setCommandLanguage = useOmniStore((state) => state.setCommandLanguage);
  const sendPrimaryCommand = useOmniStore((state) => state.sendPrimaryCommand);
  const ingestCommandInput = useOmniStore((state) => state.ingestCommandInput);
  const removePendingInput = useOmniStore((state) => state.removePendingInput);
  const clearPendingInputs = useOmniStore((state) => state.clearPendingInputs);

  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [mediaError, setMediaError] = useState<string | null>(null);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptBufferRef = useRef('');
  const selectionRef = useRef({ start: 0, end: 0 });

  const languageMap = useMemo(
    () =>
      Object.fromEntries(LANGUAGE_META.map((entry) => [entry.id, entry])) as Record<
        CommandLanguage,
        (typeof LANGUAGE_META)[number]
      >,
    [],
  );

  const cameraStatusLabel = useMemo(() => {
    if (cameraState === 'requesting') return 'Starting camera...';
    if (cameraState === 'ready') return 'Camera ready';
    if (cameraState === 'error') return 'Camera unavailable';
    return 'Camera off';
  }, [cameraState]);

  const autoGrow = useCallback(() => {
    const node = composerRef.current;
    if (!node) {
      return;
    }
    node.style.height = '0px';
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, []);

  const syncSelection = useCallback(() => {
    const node = composerRef.current;
    if (!node) {
      return;
    }
    selectionRef.current = {
      start: node.selectionStart,
      end: node.selectionEnd,
    };
  }, []);

  const stopCameraStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    autoGrow();
  }, [prompt, autoGrow]);

  useEffect(() => {
    return () => {
      stopCameraStream();
      recognitionRef.current?.stop();
    };
  }, [stopCameraStream]);

  const onAttachFiles = useCallback(
    async (inputFiles: File[]) => {
      if (inputFiles.length === 0) {
        return;
      }

      setMediaError(null);

      for (const file of inputFiles) {
        try {
          let textContent: string | undefined;
          let sourceUrl: string | undefined;

          if (file.type.startsWith('image/')) {
            sourceUrl = await readFileAsDataUrl(file);
          } else if (
            file.type.startsWith('text/') ||
            file.type.includes('json') ||
            file.type.includes('xml') ||
            file.type.includes('csv') ||
            file.name.endsWith('.md') ||
            file.name.endsWith('.txt')
          ) {
            textContent = await readFileAsText(file);
          }

          ingestCommandInput({
            kind: 'file',
            title: `File • ${file.name}`,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            textContent,
            sourceUrl,
          });
        } catch {
          setMediaError(`Could not process ${file.name}.`);
        }
      }
    },
    [ingestCommandInput],
  );

  const onDropFiles: DragEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const files = Array.from(event.dataTransfer.files || []);
    await onAttachFiles(files);
  };

  const preventToolbarBlur: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
  };

  const applyMarkdownWrap = useCallback(
    (left: string, right: string = left) => {
      const node = composerRef.current;
      if (!node) {
        return;
      }

      const hasFocus = document.activeElement === node;
      const start = hasFocus ? node.selectionStart : selectionRef.current.start;
      const end = hasFocus ? node.selectionEnd : selectionRef.current.end;
      const selected = prompt.slice(start, end);

      const fallbackText = left === '`' ? 'code' : 'text';
      const payload = selected || fallbackText;
      const updated = `${prompt.slice(0, start)}${left}${payload}${right}${prompt.slice(end)}`;
      setPrompt(updated);

      queueMicrotask(() => {
        node.focus();
        const selectionStart = start + left.length;
        const selectionEnd = selectionStart + payload.length;
        node.setSelectionRange(selectionStart, selectionEnd);
        selectionRef.current = { start: selectionStart, end: selectionEnd };
      });
    },
    [prompt],
  );

  const insertBullet = useCallback(() => {
    const node = composerRef.current;
    if (!node) {
      return;
    }

    const hasFocus = document.activeElement === node;
    const start = hasFocus ? node.selectionStart : selectionRef.current.start;
    const end = hasFocus ? node.selectionEnd : selectionRef.current.end;
    const selected = prompt.slice(start, end);

    const list = selected
      ? selected
          .split('\n')
          .map((line) => `- ${line}`)
          .join('\n')
      : '- ';

    const updated = `${prompt.slice(0, start)}${list}${prompt.slice(end)}`;
    setPrompt(updated);

    queueMicrotask(() => {
      node.focus();
      const caret = start + list.length;
      node.setSelectionRange(caret, caret);
      selectionRef.current = { start: caret, end: caret };
    });
  }, [prompt]);

  const startRecording = useCallback(() => {
    const SpeechCtor = resolveSpeechCtor();
    if (!SpeechCtor) {
      setMediaError('Speech-to-text is not supported in this browser.');
      return;
    }

    transcriptBufferRef.current = '';

    const recognition = new SpeechCtor();
    recognition.lang = languageMap[commandLanguage].speechCode;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const firstAlternative = result?.[0];
        if (result?.isFinal && firstAlternative?.transcript) {
          finalChunk += firstAlternative.transcript;
        }
      }

      if (finalChunk.trim()) {
        transcriptBufferRef.current = `${transcriptBufferRef.current}${transcriptBufferRef.current ? ' ' : ''}${finalChunk.trim()}`;
        setPrompt((prev) => `${prev}${prev.trim().length ? ' ' : ''}${finalChunk.trim()}`);
      }
    };

    recognition.onerror = () => {
      setMediaError('Voice recognition failed. Check microphone permissions.');
      setRecording(false);
    };

    recognition.onend = () => {
      const finalTranscript = transcriptBufferRef.current.trim();
      if (finalTranscript) {
        ingestCommandInput({
          kind: 'voice',
          title: `Voice Transcript • ${languageMap[commandLanguage].short}`,
          mimeType: 'text/plain',
          textContent: finalTranscript,
        });
      }
      transcriptBufferRef.current = '';
      setRecording(false);
      recognitionRef.current = null;
    };

    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
    setMediaError(null);
  }, [commandLanguage, ingestCommandInput, languageMap]);

  const toggleRecording = useCallback(() => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    startRecording();
  }, [recording, startRecording]);

  const openCamera = useCallback(async () => {
    if (cameraState === 'requesting') {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setMediaError('Camera API is not available in this browser.');
      return;
    }

    setMediaError(null);
    setCameraState('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('No video track available');
      }

      stopCameraStream();
      streamRef.current = stream;
      setCameraOpen(true);

      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.srcObject = stream;
        try {
          await videoElement.play();
        } catch {
          // Playback can require user gesture on some engines; stream is still attached.
        }

        await new Promise<void>((resolve) => {
          if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            resolve();
            return;
          }

          const onLoadedMetadata = () => {
            resolve();
          };

          videoElement.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
          setTimeout(() => {
            videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
            resolve();
          }, 2200);
        });

        if (videoElement.videoWidth <= 0 || videoElement.videoHeight <= 0) {
          stopCameraStream();
          setCameraOpen(false);
          setCameraState('error');
          setMediaError('Camera opened, but no frames were received. Please try reopening camera.');
          return;
        }
      }

      setCameraState('ready');
    } catch {
      stopCameraStream();
      setCameraOpen(false);
      setCameraState('error');
      setMediaError('Unable to access camera. Please grant camera permission.');
    }
  }, [cameraState, stopCameraStream]);

  const closeCamera = useCallback(() => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraState('idle');
  }, [stopCameraStream]);

  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (width <= 0 || height <= 0) {
      setMediaError('Camera feed is not ready yet. Try again in a moment.');
      return;
    }

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const sourceUrl = canvas.toDataURL('image/png');

    ingestCommandInput({
      kind: 'camera',
      title: 'Camera Capture',
      mimeType: 'image/png',
      sourceUrl,
      size: Math.round(sourceUrl.length * 0.75),
    });

    closeCamera();
  }, [closeCamera, ingestCommandInput]);

  const sendCommand = useCallback(async () => {
    if (running) {
      return;
    }

    const trimmed = prompt.trim();
    if (!trimmed && pendingInputs.length === 0) {
      return;
    }

    setRunning(true);
    try {
      await sendPrimaryCommand(trimmed);
      setPrompt('');
      queueMicrotask(() => {
        const node = composerRef.current;
        if (!node) {
          return;
        }
        node.focus();
        selectionRef.current = { start: 0, end: 0 };
      });
    } finally {
      setRunning(false);
    }
  }, [pendingInputs.length, prompt, running, sendPrimaryCommand]);

  return (
    <section className="omni-card relative z-10 min-w-0 overflow-hidden border border-white/12 bg-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Primary Agent Console</p>
          <h3 className="text-sm font-semibold text-white/85">Multimodal Command Bar</h3>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/35 p-1">
          {LANGUAGE_META.map((language) => (
            <button
              key={language.id}
              type="button"
              onClick={() => setCommandLanguage(language.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] transition ${
                commandLanguage === language.id ? 'bg-white text-black' : 'text-white/70 hover:text-white'
              }`}
              title={language.label}
            >
              {language.short}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[320px] space-y-3 overflow-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-white/45">Start by commanding Agent G. Attach files, voice, or camera context as needed.</p>
        ) : (
          messages.map((message) => (
            <motion.div
              key={message.id}
              layout
              className={`rounded-xl border px-3 py-2.5 text-sm ${
                message.role === 'assistant'
                  ? 'border-white/10 bg-white/[0.045] text-white/86'
                  : 'border-cyan-400/30 bg-cyan-500/[0.12] text-cyan-100'
              }`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.13em] text-white/55">
                {message.role === 'assistant' ? <Bot className="h-3.5 w-3.5" /> : <TerminalSquare className="h-3.5 w-3.5" />}
                {message.role === 'assistant' ? 'Agent G' : 'Operator'}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
            </motion.div>
          ))
        )}
      </div>

      <form
        className={`border-t border-white/10 px-4 py-3 transition ${dragActive ? 'bg-cyan-500/[0.08]' : 'bg-black/10'}`}
        onSubmit={(event) => {
          event.preventDefault();
          void sendCommand();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          void onDropFiles(event);
        }}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/35 p-1">
            <button
              type="button"
              onMouseDown={preventToolbarBlur}
              className="rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white"
              onClick={() => applyMarkdownWrap('**')}
              title="Bold"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={preventToolbarBlur}
              className="rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white"
              onClick={() => applyMarkdownWrap('_')}
              title="Italic"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={preventToolbarBlur}
              className="rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white"
              onClick={() => applyMarkdownWrap('`')}
              title="Inline code"
            >
              <Code2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={preventToolbarBlur}
              className="rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white"
              onClick={insertBullet}
              title="Bullet list"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/35 p-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-white/80 transition hover:bg-white/10 hover:text-white"
              title="Upload file"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
            <button
              type="button"
              onClick={toggleRecording}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
                recording ? 'bg-red-500/30 text-red-100' : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
              title={recording ? 'Stop recording' : 'Start voice input'}
            >
              {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {recording ? 'Stop' : 'Voice'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (cameraOpen) {
                  closeCamera();
                } else {
                  void openCamera();
                }
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
                cameraOpen ? 'bg-cyan-500/25 text-cyan-100' : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
              title={cameraOpen ? 'Close camera' : 'Open camera'}
            >
              <Camera className="h-3.5 w-3.5" />
              Camera
            </button>
          </div>
        </div>

        <AnimatePresence>
          {cameraOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mb-2 rounded-xl border border-white/10 bg-black/40 p-2"
            >
              <div className="mb-1 flex items-center justify-between text-[11px] text-white/60">
                <span>{cameraStatusLabel}</span>
                <span>{cameraState === 'ready' ? 'Live preview' : 'Waiting for camera'}</span>
              </div>
              <video ref={videoRef} autoPlay playsInline muted className="h-48 w-full rounded-lg object-cover" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={captureFromCamera}
                  disabled={cameraState !== 'ready'}
                  className="rounded-lg border border-cyan-300/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Capture
                </button>
                <button
                  type="button"
                  onClick={closeCamera}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80"
                >
                  Close
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <canvas ref={canvasRef} className="hidden" />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            void onAttachFiles(files);
            event.currentTarget.value = '';
          }}
        />

        {mediaError && <p className="mb-2 text-xs text-amber-300">{mediaError}</p>}

        <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-white/45">
          <span className="inline-flex items-center gap-1">
            <Globe2 className="h-3.5 w-3.5" />
            Command language: {languageMap[commandLanguage].label}
          </span>
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3.5 w-3.5" />
            Enter sends · Shift+Enter newline
          </span>
        </div>

        {pendingInputs.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {pendingInputs.map((input) => (
              <span
                key={input.id}
                className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] px-2 py-1 text-[11px] text-white/80"
              >
                {input.kind}
                <span className="max-w-[160px] truncate">{input.title}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-white/60 hover:bg-white/10 hover:text-white"
                  onClick={() => removePendingInput(input.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 hover:bg-white/[0.08]"
              onClick={clearPendingInputs}
            >
              Clear all
            </button>
          </div>
        )}

        <div className="rounded-xl border border-white/12 bg-black/45 p-2">
          <textarea
            ref={composerRef}
            value={prompt}
            rows={1}
            onChange={(event) => setPrompt(event.target.value)}
            onInput={autoGrow}
            onSelect={syncSelection}
            onClick={syncSelection}
            onKeyUp={syncSelection}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendCommand();
              }
            }}
            placeholder={`Command ${activeServiceId} with markdown-rich instructions...`}
            className="max-h-[220px] min-h-[48px] w-full resize-none bg-transparent px-2 py-1.5 text-sm text-white/90 outline-none placeholder:text-white/35"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-white/40">Supports markdown, multimodal attachments, and cross-service context bridging.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPrompt('');
                  queueMicrotask(() => {
                    const node = composerRef.current;
                    if (!node) {
                      return;
                    }
                    node.focus();
                    selectionRef.current = { start: 0, end: 0 };
                  });
                }}
                disabled={!prompt.trim() || running}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/75 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={running || (!prompt.trim() && pendingInputs.length === 0)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/45 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Dispatch
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

export default PrimaryAgentChat;
