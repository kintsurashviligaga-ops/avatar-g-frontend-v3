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

import { getLocalizedService, localizeCommandLanguage, normalizeOmniLocale, type OmniLocale } from './i18n';
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

const QUICK_COMMANDS: Record<OmniLocale, Array<{ label: string; prompt: string }>> = {
  ka: [
    { label: '◉ AvATAR', prompt: 'შექმენი AvATAR: ' },
    { label: '▶ ვიდეო', prompt: 'შექმენი ვიდეო: ' },
    { label: '✦ სურათი', prompt: 'შექმენი სურათი: ' },
    { label: '♪ მუსიკა', prompt: 'შექმენი მუსიკა: ' },
    { label: '⬡ თამაში', prompt: 'შექმენი თამაშის კონცეფცია: ' },
    { label: '◫ ინტერიერი', prompt: 'გამიდიზაინე ინტერიერი: ' },
    { label: '⌥ Prompt', prompt: 'ააშენე prompt: ' },
    { label: '>_ კოდი', prompt: 'დამიწერე კოდი: ' },
  ],
  en: [
    { label: '◉ Avatar', prompt: 'Create Avatar: ' },
    { label: '▶ Video', prompt: 'Create Video: ' },
    { label: '✦ Image', prompt: 'Create Image: ' },
    { label: '♪ Music', prompt: 'Create Music: ' },
    { label: '⬡ Game', prompt: 'Create Game Concept: ' },
    { label: '◫ Interior', prompt: 'Design Interior: ' },
    { label: '⌥ Prompt', prompt: 'Build Prompt: ' },
    { label: '>_ Code', prompt: 'Write Code: ' },
  ],
  ru: [
    { label: '◉ Аватар', prompt: 'Создай аватар: ' },
    { label: '▶ Видео', prompt: 'Создай видео: ' },
    { label: '✦ Изображение', prompt: 'Создай изображение: ' },
    { label: '♪ Музыка', prompt: 'Создай музыку: ' },
    { label: '⬡ Игра', prompt: 'Создай концепцию игры: ' },
    { label: '◫ Интерьер', prompt: 'Сделай дизайн интерьера: ' },
    { label: '⌥ Промпт', prompt: 'Построй промпт: ' },
    { label: '>_ Код', prompt: 'Напиши код: ' },
  ],
};

const CHAT_COPY = {
  ka: {
    primaryConsole: 'ძირითადი აგენტის კონსოლი',
    multimodalBar: 'მულტიმოდალური ბრძანებების პანელი',
    intro: 'დაწერე ერთხელ. მე ვანაწილებ დავალებას სერვისებში და საუკეთესო შედეგს აქვე გაბრუნებ.',
    empty:
      'დაიწყე მიზნის მოკლე აღწერით. შეგიძლია დაამატო ფაილი, ხმა ან კამერა და Agent G ავტომატურად ააწყობს პროცესს.',
    agentLabel: 'Agent G',
    operatorLabel: 'ოპერატორი',
    smartBar: 'ჭკვიანი შეყვანა',
    routingTo: 'მიმდინარეობს:',
    quickStart: 'სწრაფი დასაწყისი',
    templatesHint: 'ერთი შეხებით შაბლონები',
    cameraStarting: 'კამერა ირთვება...',
    cameraReady: 'კამერა მზადაა',
    cameraUnavailable: 'კამერა მიუწვდომელია',
    cameraOff: 'კამერა გამორთულია',
    livePreview: 'ცოცხალი პრევიუ',
    waitingCamera: 'კამერის მოლოდინი',
    capture: 'გადაღება',
    close: 'დახურვა',
    attachedContext: 'დამატებული კონტექსტი',
    clearAll: 'გასუფთავება',
    promptComposer: 'ბრძანების კომპოზიტორი',
    chars: 'სიმბოლო',
    placeholderPrefix: 'მართე',
    placeholderSuffix: 'სერვისი markdown-ით და ზუსტი მითითებებით...',
    upload: 'ატვირთვა',
    stop: 'შეჩერება',
    voice: 'ხმა',
    camera: 'კამერა',
    clear: 'გასუფთავება',
    dispatch: 'გაგზავნა',
    commandLanguage: 'ბრძანების ენა',
    enterHint: 'Enter — გაგზავნა / Shift+Enter — ახალი ხაზი',
    supports: 'მხარს უჭერს markdown-ს, მულტიმოდალურ input-ს და სერვისებს შორის კონტექსტის გაზიარებას.',
    voiceTranscript: 'ხმოვანი ტრანსკრიფტი',
    cameraCapture: 'კამერის კადრი',
    uploadFile: 'ფაილის ატვირთვა',
    stopRecording: 'ჩაწერის შეჩერება',
    startVoice: 'ხმოვანი შეყვანის დაწყება',
    closeCamera: 'კამერის დახურვა',
    openCamera: 'კამერის გახსნა',
    clearPrompt: 'ტექსტის გასუფთავება',
    speechUnsupported: 'ხმოვანი ამოცნობა ამ ბრაუზერში არ არის მხარდაჭერილი.',
    speechFailed: 'ხმოვანი ამოცნობა ვერ შესრულდა. შეამოწმე მიკროფონის წვდომა.',
    couldNotProcess: 'ვერ დამუშავდა ფაილი:',
    cameraApiMissing: 'კამერის API ამ ბრაუზერში არ არის ხელმისაწვდომი.',
    cameraNoFrame: 'კამერა ჩაირთო, მაგრამ კადრი ვერ მივიღეთ. სცადე თავიდან.',
    cameraPermissionError: 'კამერაზე წვდომა ვერ მოხერხდა. გთხოვ, დაუშვი ნებართვა.',
    cameraNotReady: 'კამერის ნაკადი ჯერ მზად არაა. სცადე კიდევ ერთხელ.',
  },
  en: {
    primaryConsole: 'Primary Agent Console',
    multimodalBar: 'Multimodal Command Bar',
    intro: 'Write once. I route tasks across services and return the best output here.',
    empty:
      'Start by describing your goal in natural language. You can attach files, voice, or camera context and Agent G will orchestrate all services automatically.',
    agentLabel: 'Agent G',
    operatorLabel: 'Operator',
    smartBar: 'Smart Input Bar',
    routingTo: 'Routing to:',
    quickStart: 'Quick Start',
    templatesHint: 'One tap templates',
    cameraStarting: 'Starting camera...',
    cameraReady: 'Camera ready',
    cameraUnavailable: 'Camera unavailable',
    cameraOff: 'Camera off',
    livePreview: 'Live preview',
    waitingCamera: 'Waiting for camera',
    capture: 'Capture',
    close: 'Close',
    attachedContext: 'Attached Context',
    clearAll: 'Clear all',
    promptComposer: 'Prompt Composer',
    chars: 'chars',
    placeholderPrefix: 'Command',
    placeholderSuffix: 'with markdown-rich instructions...',
    upload: 'Upload',
    stop: 'Stop',
    voice: 'Voice',
    camera: 'Camera',
    clear: 'Clear',
    dispatch: 'Dispatch',
    commandLanguage: 'Command language',
    enterHint: 'Enter sends / Shift+Enter newline',
    supports: 'Supports markdown, multimodal attachments, and cross-service context bridging.',
    voiceTranscript: 'Voice Transcript',
    cameraCapture: 'Camera Capture',
    uploadFile: 'Upload file',
    stopRecording: 'Stop recording',
    startVoice: 'Start voice input',
    closeCamera: 'Close camera',
    openCamera: 'Open camera',
    clearPrompt: 'Clear text',
    speechUnsupported: 'Speech-to-text is not supported in this browser.',
    speechFailed: 'Voice recognition failed. Check microphone permissions.',
    couldNotProcess: 'Could not process file:',
    cameraApiMissing: 'Camera API is not available in this browser.',
    cameraNoFrame: 'Camera opened, but no frames were received. Please try reopening camera.',
    cameraPermissionError: 'Unable to access camera. Please grant camera permission.',
    cameraNotReady: 'Camera feed is not ready yet. Try again in a moment.',
  },
  ru: {
    primaryConsole: 'Основная консоль агента',
    multimodalBar: 'Мультимодальная панель команд',
    intro: 'Пишите один раз. Я распределю задачу по сервисам и верну лучший результат здесь.',
    empty:
      'Начните с описания цели. Можно добавить файлы, голос или камеру, и Agent G автоматически соберет весь пайплайн.',
    agentLabel: 'Agent G',
    operatorLabel: 'Оператор',
    smartBar: 'Умная панель ввода',
    routingTo: 'Маршрут в:',
    quickStart: 'Быстрый старт',
    templatesHint: 'Шаблоны в один тап',
    cameraStarting: 'Запуск камеры...',
    cameraReady: 'Камера готова',
    cameraUnavailable: 'Камера недоступна',
    cameraOff: 'Камера выключена',
    livePreview: 'Live preview',
    waitingCamera: 'Ожидание камеры',
    capture: 'Снять',
    close: 'Закрыть',
    attachedContext: 'Добавленный контекст',
    clearAll: 'Очистить всё',
    promptComposer: 'Редактор команды',
    chars: 'символов',
    placeholderPrefix: 'Управляй сервисом',
    placeholderSuffix: 'с markdown-инструкциями...',
    upload: 'Загрузить',
    stop: 'Стоп',
    voice: 'Голос',
    camera: 'Камера',
    clear: 'Очистить',
    dispatch: 'Отправить',
    commandLanguage: 'Язык команды',
    enterHint: 'Enter отправляет / Shift+Enter новая строка',
    supports: 'Поддерживает markdown, мультимодальные вложения и передачу контекста между сервисами.',
    voiceTranscript: 'Голосовая расшифровка',
    cameraCapture: 'Снимок с камеры',
    uploadFile: 'Загрузить файл',
    stopRecording: 'Остановить запись',
    startVoice: 'Начать голосовой ввод',
    closeCamera: 'Закрыть камеру',
    openCamera: 'Открыть камеру',
    clearPrompt: 'Очистить текст',
    speechUnsupported: 'Распознавание речи не поддерживается в этом браузере.',
    speechFailed: 'Ошибка распознавания речи. Проверьте доступ к микрофону.',
    couldNotProcess: 'Не удалось обработать файл:',
    cameraApiMissing: 'Camera API недоступен в этом браузере.',
    cameraNoFrame: 'Камера включилась, но кадры не получены. Попробуйте снова.',
    cameraPermissionError: 'Не удалось получить доступ к камере. Разрешите доступ.',
    cameraNotReady: 'Поток камеры еще не готов. Попробуйте снова.',
  },
} as const;

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
  const locale = useOmniStore((state) => state.locale);

  const localeCode = normalizeOmniLocale(locale);
  const copy = CHAT_COPY[localeCode];
  const quickCommands = QUICK_COMMANDS[localeCode];

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
    if (cameraState === 'requesting') return copy.cameraStarting;
    if (cameraState === 'ready') return copy.cameraReady;
    if (cameraState === 'error') return copy.cameraUnavailable;
    return copy.cameraOff;
  }, [cameraState, copy]);

  const activeServiceTitle = getLocalizedService(activeServiceId, localeCode).title;

  const autoGrow = useCallback(() => {
    const node = composerRef.current;
    if (!node) {
      return;
    }
    node.style.height = '0px';
    node.style.height = `${Math.min(node.scrollHeight, 320)}px`;
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

  useEffect(() => {
    const focusComposer = () => {
      const node = composerRef.current;
      if (!node) {
        return;
      }
      node.focus();
      const end = node.value.length;
      node.setSelectionRange(end, end);
      selectionRef.current = { start: end, end };
    };

    window.addEventListener('omni:focus-composer', focusComposer);
    return () => {
      window.removeEventListener('omni:focus-composer', focusComposer);
    };
  }, []);

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
          setMediaError(`${copy.couldNotProcess} ${file.name}.`);
        }
      }
    },
    [copy.couldNotProcess, ingestCommandInput],
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
      setMediaError(copy.speechUnsupported);
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
      setMediaError(copy.speechFailed);
      setRecording(false);
    };

    recognition.onend = () => {
      const finalTranscript = transcriptBufferRef.current.trim();
      if (finalTranscript) {
        ingestCommandInput({
          kind: 'voice',
          title: `${copy.voiceTranscript} • ${languageMap[commandLanguage].short}`,
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
  }, [
    commandLanguage,
    copy.speechFailed,
    copy.speechUnsupported,
    copy.voiceTranscript,
    ingestCommandInput,
    languageMap,
  ]);

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
      setMediaError(copy.cameraApiMissing);
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
          setMediaError(copy.cameraNoFrame);
          return;
        }
      }

      setCameraState('ready');
    } catch {
      stopCameraStream();
      setCameraOpen(false);
      setCameraState('error');
      setMediaError(copy.cameraPermissionError);
    }
  }, [cameraState, copy.cameraApiMissing, copy.cameraNoFrame, copy.cameraPermissionError, stopCameraStream]);

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
      setMediaError(copy.cameraNotReady);
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
      title: copy.cameraCapture,
      mimeType: 'image/png',
      sourceUrl,
      size: Math.round(sourceUrl.length * 0.75),
    });

    closeCamera();
  }, [closeCamera, copy.cameraCapture, copy.cameraNotReady, ingestCommandInput]);

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

  const applyQuickCommand = useCallback((value: string) => {
    setPrompt(value);
    queueMicrotask(() => {
      const node = composerRef.current;
      if (!node) {
        return;
      }
      node.focus();
      const end = value.length;
      node.setSelectionRange(end, end);
      selectionRef.current = { start: end, end };
    });
  }, []);

  return (
    <section className="omni-card omni-chat-pane relative z-10 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/12 bg-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">{copy.primaryConsole}</p>
          <h3 className="text-sm font-semibold text-white/85">{copy.multimodalBar}</h3>
          <p className="mt-0.5 text-[12px] text-white/50">{copy.intro}</p>
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

      <div className="omni-chat-scroll min-h-[360px] flex-1 space-y-3 overflow-y-auto bg-black/15 px-4 py-4 pb-24 md:pb-4 lg:min-h-[440px] xl:min-h-[520px]">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">{copy.empty}</div>
        ) : (
          messages.map((message) => (
            <motion.div key={message.id} layout className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <div
                className={`omni-chat-line w-full max-w-[94%] text-sm ${
                  message.role === 'assistant' ? 'is-assistant text-white/86' : 'is-user text-cyan-100'
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.13em] text-white/55">
                  {message.role === 'assistant' ? <Bot className="h-3.5 w-3.5" /> : <TerminalSquare className="h-3.5 w-3.5" />}
                  {message.role === 'assistant' ? copy.agentLabel : copy.operatorLabel}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <form
        className={`sticky bottom-0 z-20 border-t border-white/10 px-3 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] backdrop-blur-md transition md:px-4 md:py-3 md:pb-3 md:backdrop-blur-none ${dragActive ? 'bg-cyan-500/[0.08]' : 'bg-black/25'}`}
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
        <div className="mb-2 flex items-center justify-between rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 md:hidden">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/75">{copy.smartBar}</p>
            <p className="text-xs text-cyan-50/90">{copy.routingTo} {activeServiceTitle}</p>
          </div>
          <span className="rounded-full border border-cyan-200/40 bg-black/25 px-2 py-1 text-[11px] font-semibold text-cyan-100">
            {languageMap[commandLanguage].short}
          </span>
        </div>

        <div className="mb-3 hidden rounded-xl border border-white/10 bg-black/35 p-2.5 md:block">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{copy.quickStart}</p>
            <span className="text-[11px] text-white/45">{copy.templatesHint}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickCommands.map((command) => (
              <button
                key={command.label}
                type="button"
                onClick={() => applyQuickCommand(command.prompt)}
                className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/[0.1]"
              >
                {command.label}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {cameraOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mb-3 rounded-xl border border-white/10 bg-black/40 p-2"
            >
              <div className="mb-1 flex items-center justify-between text-[11px] text-white/60">
                <span>{cameraStatusLabel}</span>
                <span>{cameraState === 'ready' ? copy.livePreview : copy.waitingCamera}</span>
              </div>
              <video ref={videoRef} autoPlay playsInline muted className="h-48 w-full rounded-lg object-cover" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={captureFromCamera}
                  disabled={cameraState !== 'ready'}
                  className="min-h-[44px] rounded-lg border border-cyan-300/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {copy.capture}
                </button>
                <button
                  type="button"
                  onClick={closeCamera}
                  className="min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80"
                >
                  {copy.close}
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

        {pendingInputs.length > 0 && (
          <div className="mb-3 rounded-xl border border-white/10 bg-black/35 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{copy.attachedContext}</p>
              <button
                type="button"
                className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 hover:bg-white/[0.08]"
                onClick={clearPendingInputs}
              >
                {copy.clearAll}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
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
            </div>
          </div>
        )}

        <div className="rounded-xl border border-white/12 bg-black/45 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{copy.promptComposer}</p>
            <p className="text-[11px] text-white/45">{prompt.length} {copy.chars}</p>
          </div>

          <textarea
            ref={composerRef}
            value={prompt}
            rows={4}
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
            placeholder={`${copy.placeholderPrefix} ${activeServiceTitle} ${copy.placeholderSuffix}`}
            className="max-h-[320px] min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-sm text-white/90 outline-none placeholder:text-white/35 md:min-h-[150px]"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 p-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 py-1.5 text-xs text-white/80 transition hover:bg-white/10 hover:text-white"
                title={copy.uploadFile}
              >
                <Upload className="h-3.5 w-3.5" />
                {copy.upload}
              </button>
              <button
                type="button"
                onClick={toggleRecording}
                className={`inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
                  recording ? 'bg-red-500/30 text-red-100' : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
                title={recording ? copy.stopRecording : copy.startVoice}
              >
                {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {recording ? copy.stop : copy.voice}
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
                className={`inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
                  cameraOpen ? 'bg-cyan-500/25 text-cyan-100' : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
                title={cameraOpen ? copy.closeCamera : copy.openCamera}
              >
                <Camera className="h-3.5 w-3.5" />
                {copy.camera}
              </button>

              <div className="mx-1 hidden h-4 w-px bg-white/15 sm:block" />

              <button
                type="button"
                onMouseDown={preventToolbarBlur}
                className="hidden h-11 w-11 items-center justify-center rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white sm:inline-flex"
                onClick={() => applyMarkdownWrap('**')}
                title="Bold"
              >
                <Bold className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={preventToolbarBlur}
                className="hidden h-11 w-11 items-center justify-center rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white sm:inline-flex"
                onClick={() => applyMarkdownWrap('_')}
                title="Italic"
              >
                <Italic className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={preventToolbarBlur}
                className="hidden h-11 w-11 items-center justify-center rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white sm:inline-flex"
                onClick={() => applyMarkdownWrap('`')}
                title="Inline code"
              >
                <Code2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={preventToolbarBlur}
                className="hidden h-11 w-11 items-center justify-center rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white sm:inline-flex"
                onClick={insertBullet}
                title="Bullet list"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

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
                className="min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/75 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {copy.clear}
              </button>
              <button
                type="submit"
                disabled={running || (!prompt.trim() && pendingInputs.length === 0)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-cyan-300/45 bg-cyan-500/20 px-4 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {copy.dispatch}
              </button>
            </div>
          </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-white/45">
              <span className="inline-flex items-center gap-1">
                <Globe2 className="h-3.5 w-3.5" />
                {copy.commandLanguage}: {localizeCommandLanguage(commandLanguage, localeCode)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                {copy.enterHint}
              </span>
            </div>

            <p className="mt-1 text-[11px] text-white/40">{copy.supports}</p>
        </div>
      </form>
    </section>
  );
}

export default PrimaryAgentChat;
