'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Camera,
  LayoutGrid,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type { DragEventHandler } from 'react';

import { getLocalizedService, normalizeOmniLocale } from './i18n';
import { OMNI_SERVICES } from './services';
import { useOmniStore } from './store';
import type { CommandLanguage, PreviewArtifact, ServiceId } from './types';
import { ClarificationMessage } from '@/components/chat/ClarificationMessage';
import { ConfirmationCard } from '@/components/chat/ConfirmationCard';
import { GenerationProgress, type GenerationStage } from '@/components/chat/GenerationProgress';
import { OutputCard } from '@/components/chat/OutputCard';
import type { ClarificationQuestion } from '@/lib/agent-g-clarifier';
import type { ServiceId as RegistryServiceId } from '@/lib/registry';

// ─── Pipeline types ───────────────────────────────────────────────────────────

type PipelineStage = 'idle' | 'detecting' | 'clarifying' | 'confirming' | 'generating' | 'done';

interface PipelineState {
  stage: PipelineStage;
  serviceId?: RegistryServiceId;
  serviceName?: string;
  userInput?: string;
  questions: ClarificationQuestion[];
  currentQuestionIndex: number;
  answers: Record<string, string | string[]>;
  finalPrompt?: string;
  creditCost?: number;
  estimatedSeconds?: number;
  generationStage?: GenerationStage;
  outputUrl?: string;
  outputText?: string;
  outputKind?: 'image' | 'video' | 'audio' | 'text' | 'code';
  tokensUsed?: number;
  cancelled?: boolean;
  userBalance: number;
}

const GENERATION_STAGE_ORDER: GenerationStage[] = [
  'received', 'processing', 'generating', 'optimizing', 'delivering',
];

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

type SeedCommandDetail = {
  prompt?: string;
  serviceId?: ServiceId;
};

const CHAT_COPY = {
  ka: {
    emptyHint: 'პირველი პასუხი აქ გამოჩნდება. დაიწყე მოკლე, ზუსტი დავალებით.',
    assistant: 'Agent G',
    operator: 'ოპერატორი',
    serviceSwitcher: 'სერვისების სია',
    serviceSwitcherHint: '8 სერვისი',
    file: 'ფაილი',
    voice: 'ხმა',
    camera: 'კამერა',
    send: 'გაგზავნა',
    stop: 'შეჩერება',
    clear: 'გასუფთავება',
    clearAll: 'ყველას წაშლა',
    attachedContext: 'მიმაგრებული კონტექსტი',
    placeholder: 'აღწერე მიზანი ზუსტად და ქართულად...',
    cameraStarting: 'კამერა ირთვება...',
    cameraReady: 'კამერა მზადაა',
    cameraUnavailable: 'კამერა მიუწვდომელია',
    cameraOff: 'კამერა გამორთულია',
    capture: 'კადრის აღება',
    close: 'დახურვა',
    waitingCamera: 'კადრის მოლოდინი',
    livePreview: 'ცოცხალი პრევიუ',
    uploadFile: 'ფაილის ატვირთვა',
    startVoice: 'ხმის ჩაწერის დაწყება',
    stopVoice: 'ხმის ჩაწერის შეჩერება',
    openCamera: 'კამერის გახსნა',
    closeCamera: 'კამერის დახურვა',
    sendHint: 'Enter გაგზავნისთვის • Shift+Enter ახალი ხაზისთვის',
    speechUnsupported: 'ხმის ამოცნობა ამ ბრაუზერში არ არის მხარდაჭერილი.',
    speechFailed: 'ხმის ამოცნობა ვერ შესრულდა. შეამოწმე მიკროფონის წვდომა.',
    couldNotProcess: 'ფაილი ვერ დამუშავდა:',
    cameraApiMissing: 'კამერის API მიუწვდომელია ამ ბრაუზერში.',
    cameraNoFrame: 'კამერა ჩაირთო, მაგრამ კადრი ვერ მივიღეთ. სცადე თავიდან.',
    cameraPermissionError: 'კამერაზე წვდომა ვერ მოხერხდა. დაუშვი ნებართვა.',
    cameraNotReady: 'კამერის ნაკადი ჯერ მზად არაა. სცადე კიდევ ერთხელ.',
    voiceTranscript: 'ხმოვანი ტრანსკრიფტი',
    cameraCapture: 'კამერის კადრი',
    languageLabel: 'ენა',
    openServiceHub: 'სერვისების ჰაბი',
    mediaPreviewTitle: 'გენერირებული პრევიუ',
    openFullscreen: 'სრული ეკრანი',
    closeFullscreen: 'დახურვა',
    videoPreviewFallback: 'ვიდეო პრევიუ ხელმისაწვდომია სრულ ეკრანზე.',
  },
  en: {
    emptyHint: 'Your first response will appear here. Start with a short, precise instruction.',
    assistant: 'Agent G',
    operator: 'Operator',
    serviceSwitcher: 'Services',
    serviceSwitcherHint: '8 services',
    file: 'File',
    voice: 'Voice',
    camera: 'Camera',
    send: 'Send',
    stop: 'Stop',
    clear: 'Clear',
    clearAll: 'Clear all',
    attachedContext: 'Attached context',
    placeholder: 'Describe your goal with precision...',
    cameraStarting: 'Starting camera...',
    cameraReady: 'Camera ready',
    cameraUnavailable: 'Camera unavailable',
    cameraOff: 'Camera off',
    capture: 'Capture',
    close: 'Close',
    waitingCamera: 'Waiting for camera',
    livePreview: 'Live preview',
    uploadFile: 'Upload file',
    startVoice: 'Start voice recording',
    stopVoice: 'Stop voice recording',
    openCamera: 'Open camera',
    closeCamera: 'Close camera',
    sendHint: 'Enter to send • Shift+Enter for newline',
    speechUnsupported: 'Speech recognition is not supported in this browser.',
    speechFailed: 'Voice recognition failed. Check microphone permissions.',
    couldNotProcess: 'Could not process file:',
    cameraApiMissing: 'Camera API is unavailable in this browser.',
    cameraNoFrame: 'Camera opened, but no frames were received. Try reopening camera.',
    cameraPermissionError: 'Unable to access camera. Please allow permission.',
    cameraNotReady: 'Camera stream is not ready yet. Try again in a moment.',
    voiceTranscript: 'Voice transcript',
    cameraCapture: 'Camera capture',
    languageLabel: 'Lang',
    openServiceHub: 'Service hub',
    mediaPreviewTitle: 'Generated previews',
    openFullscreen: 'Fullscreen',
    closeFullscreen: 'Close',
    videoPreviewFallback: 'Video preview is available in fullscreen mode.',
  },
  ru: {
    emptyHint: 'Первый ответ появится здесь. Начните с короткой и точной задачи.',
    assistant: 'Agent G',
    operator: 'Оператор',
    serviceSwitcher: 'Сервисы',
    serviceSwitcherHint: '8 сервисов',
    file: 'Файл',
    voice: 'Голос',
    camera: 'Камера',
    send: 'Отправить',
    stop: 'Стоп',
    clear: 'Очистить',
    clearAll: 'Очистить всё',
    attachedContext: 'Прикрепленный контекст',
    placeholder: 'Опишите задачу максимально точно...',
    cameraStarting: 'Запуск камеры...',
    cameraReady: 'Камера готова',
    cameraUnavailable: 'Камера недоступна',
    cameraOff: 'Камера выключена',
    capture: 'Снять',
    close: 'Закрыть',
    waitingCamera: 'Ожидание камеры',
    livePreview: 'Live preview',
    uploadFile: 'Загрузить файл',
    startVoice: 'Запустить запись голоса',
    stopVoice: 'Остановить запись голоса',
    openCamera: 'Открыть камеру',
    closeCamera: 'Закрыть камеру',
    sendHint: 'Enter отправляет • Shift+Enter новая строка',
    speechUnsupported: 'Распознавание речи не поддерживается в этом браузере.',
    speechFailed: 'Ошибка распознавания речи. Проверьте доступ к микрофону.',
    couldNotProcess: 'Не удалось обработать файл:',
    cameraApiMissing: 'Camera API недоступен в этом браузере.',
    cameraNoFrame: 'Камера включилась, но кадры не получены. Попробуйте снова.',
    cameraPermissionError: 'Не удалось получить доступ к камере. Разрешите доступ.',
    cameraNotReady: 'Поток камеры еще не готов. Попробуйте снова.',
    voiceTranscript: 'Голосовая расшифровка',
    cameraCapture: 'Снимок с камеры',
    languageLabel: 'Язык',
    openServiceHub: 'Хаб сервисов',
    mediaPreviewTitle: 'Сгенерированные превью',
    openFullscreen: 'Полный экран',
    closeFullscreen: 'Закрыть',
    videoPreviewFallback: 'Превью видео доступно в полноэкранном режиме.',
  },
} as const;

const LANGUAGE_OPTIONS: Array<{ id: CommandLanguage; label: string }> = [
  { id: 'ka', label: 'GE' },
  { id: 'en', label: 'EN' },
  { id: 'ru', label: 'RU' },
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

export default function CommandCenterChat() {
  const locale = useOmniStore((state) => state.locale);
  const localeCode = normalizeOmniLocale(locale);
  const copy = CHAT_COPY[localeCode];

  const messages = useOmniStore((state) => state.chatMessages);
  const activeServiceId = useOmniStore((state) => state.activeServiceId);
  const commandLanguage = useOmniStore((state) => state.commandLanguage);
  const pendingInputs = useOmniStore((state) => state.pendingInputs);
  const sharedAssets = useOmniStore((state) => state.sharedAssets);

  const setActiveService = useOmniStore((state) => state.setActiveService);
  const setLocale = useOmniStore((state) => state.setLocale);
  const setCommandLanguage = useOmniStore((state) => state.setCommandLanguage);
  const sendPrimaryCommand = useOmniStore((state) => state.sendPrimaryCommand);
  const ingestCommandInput = useOmniStore((state) => state.ingestCommandInput);
  const removePendingInput = useOmniStore((state) => state.removePendingInput);
  const clearPendingInputs = useOmniStore((state) => state.clearPendingInputs);
  const focusPreview = useOmniStore((state) => state.focusPreview);

  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineState>({
    stage: 'idle',
    questions: [],
    currentQuestionIndex: 0,
    answers: {},
    userBalance: 100,
  });
  const pipelineRef = useRef(pipeline);
  pipelineRef.current = pipeline;
  const [recording, setRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [expandedAsset, setExpandedAsset] = useState<PreviewArtifact | null>(null);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptBufferRef = useRef('');
  const interimTranscriptRef = useRef('');
  const recordingPromptBaseRef = useRef('');

  const activeService = getLocalizedService(activeServiceId, localeCode);
  const mediaAssets = useMemo(
    () =>
      sharedAssets
        .filter((asset) => asset.kind === 'image' || asset.kind === 'video')
        .slice(0, 6),
    [sharedAssets],
  );

  const cameraStatusLabel = useMemo(() => {
    if (cameraState === 'requesting') return copy.cameraStarting;
    if (cameraState === 'ready') return copy.cameraReady;
    if (cameraState === 'error') return copy.cameraUnavailable;
    return copy.cameraOff;
  }, [cameraState, copy.cameraOff, copy.cameraReady, copy.cameraStarting, copy.cameraUnavailable]);

  const autoGrow = useCallback(() => {
    const node = composerRef.current;
    if (!node) {
      return;
    }

    node.style.height = '0px';
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
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
    };

    const seedCommand = (event: Event) => {
      const custom = event as CustomEvent<SeedCommandDetail>;
      if (custom.detail?.serviceId) {
        setActiveService(custom.detail.serviceId);
      }
      if (custom.detail?.prompt) {
        setPrompt(custom.detail.prompt);
      }
      queueMicrotask(focusComposer);
    };

    const openServiceHub = () => {
      setSwitcherOpen(true);
    };

    const toggleServiceHub = () => {
      setSwitcherOpen((value) => !value);
    };

    window.addEventListener('omni:focus-composer', focusComposer);
    window.addEventListener('omni:seed-command', seedCommand as EventListener);
    window.addEventListener('omni:open-service-hub', openServiceHub);
    window.addEventListener('omni:toggle-service-hub', toggleServiceHub);

    return () => {
      window.removeEventListener('omni:focus-composer', focusComposer);
      window.removeEventListener('omni:seed-command', seedCommand as EventListener);
      window.removeEventListener('omni:open-service-hub', openServiceHub);
      window.removeEventListener('omni:toggle-service-hub', toggleServiceHub);
    };
  }, [setActiveService]);

  useEffect(() => {
    if (!expandedAsset) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedAsset(null);
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [expandedAsset]);

  useEffect(() => {
    if (!switcherOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (barRef.current?.contains(node)) {
        return;
      }
      setSwitcherOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSwitcherOpen(false);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [switcherOpen]);

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
    const files = Array.from(event.dataTransfer.files || []);
    await onAttachFiles(files);
  };

  const startRecording = useCallback(() => {
    const SpeechCtor = resolveSpeechCtor();
    if (!SpeechCtor) {
      setMediaError(copy.speechUnsupported);
      return;
    }

    transcriptBufferRef.current = '';
    interimTranscriptRef.current = '';
    recordingPromptBaseRef.current = prompt.trim();

    const recognition = new SpeechCtor();
    recognition.lang = localeCode === 'ka' ? 'ka-GE' : localeCode === 'ru' ? 'ru-RU' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript?.trim();
        if (!transcript) {
          continue;
        }

        if (result?.isFinal) {
          finalChunk += `${finalChunk ? ' ' : ''}${transcript}`;
        } else {
          interimChunk += `${interimChunk ? ' ' : ''}${transcript}`;
        }
      }

      if (finalChunk) {
        transcriptBufferRef.current = finalChunk;
      }

      interimTranscriptRef.current = interimChunk;

      const speechText = [transcriptBufferRef.current, interimChunk].filter(Boolean).join(' ').trim();
      if (speechText) {
        const basePrompt = recordingPromptBaseRef.current;
        setPrompt(basePrompt ? `${basePrompt} ${speechText}` : speechText);
      }
    };

    recognition.onerror = () => {
      setMediaError(copy.speechFailed);
      setRecording(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      const transcript = [transcriptBufferRef.current, interimTranscriptRef.current]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (transcript) {
        ingestCommandInput({
          kind: 'voice',
          title: copy.voiceTranscript,
          mimeType: 'text/plain',
          textContent: transcript,
        });

        const basePrompt = recordingPromptBaseRef.current;
        setPrompt(basePrompt ? `${basePrompt} ${transcript}` : transcript);
      }

      transcriptBufferRef.current = '';
      interimTranscriptRef.current = '';
      recordingPromptBaseRef.current = '';
      setRecording(false);
      recognitionRef.current = null;
    };

    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
    setMediaError(null);
  }, [copy.speechFailed, copy.speechUnsupported, copy.voiceTranscript, ingestCommandInput, localeCode, prompt]);

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

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      const videoElement = videoRef.current;
      if (!videoElement) {
        stopCameraStream();
        setCameraOpen(false);
        setCameraState('error');
        setMediaError(copy.cameraNoFrame);
        return;
      }

      videoElement.srcObject = stream;
      try {
        await videoElement.play();
      } catch {
        // Some browsers require another user gesture before playback.
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

  const callPipeline = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, locale: localeCode }),
    });
    return res.json() as Promise<Record<string, unknown>>;
  }, [localeCode]);

  const handlePipelineAnswer = useCallback(async (questionId: string, value: string | string[]) => {
    const p = pipelineRef.current;
    const newAnswers = { ...p.answers, [questionId]: value };
    const nextIndex = p.currentQuestionIndex + 1;
    const done = nextIndex >= p.questions.length;

    setPipeline(prev => ({ ...prev, answers: newAnswers, currentQuestionIndex: done ? prev.currentQuestionIndex : nextIndex }));

    if (!done) return;

    setPipeline(prev => ({ ...prev, stage: 'confirming' }));
    try {
      const data = await callPipeline({ action: 'confirm', serviceId: p.serviceId, userInput: p.userInput, answers: newAnswers });
      setPipeline(prev => ({
        ...prev,
        stage: 'confirming',
        finalPrompt: data.finalPrompt as string,
        creditCost: data.creditCost as number,
        estimatedSeconds: data.estimatedSeconds as number,
      }));
    } catch {
      setPipeline(prev => ({ ...prev, stage: 'idle' }));
    }
  }, [callPipeline]);

  const handlePipelineGenerate = useCallback(async () => {
    const p = pipelineRef.current;
    setPipeline(prev => ({ ...prev, stage: 'generating', generationStage: 'received', cancelled: false }));

    const stageInterval = setInterval(() => {
      setPipeline(prev => {
        if (prev.stage !== 'generating' || prev.cancelled) { clearInterval(stageInterval); return prev; }
        const idx = GENERATION_STAGE_ORDER.indexOf(prev.generationStage ?? 'received');
        if (idx < GENERATION_STAGE_ORDER.length - 2) return { ...prev, generationStage: GENERATION_STAGE_ORDER[idx + 1] };
        return prev;
      });
    }, Math.max(1500, ((p.estimatedSeconds ?? 10) * 1000) / 4));

    try {
      const data = await callPipeline({
        action: 'generate',
        serviceId: p.serviceId,
        userInput: p.finalPrompt ?? p.userInput,
        answers: p.answers,
      }) as Record<string, unknown>;

      clearInterval(stageInterval);
      setPipeline(prev => ({
        ...prev,
        stage: 'done',
        generationStage: 'delivering',
        userBalance: Math.max(0, prev.userBalance - (prev.creditCost ?? 0)),
        outputUrl: (data.result_url ?? data.url ?? undefined) as string | undefined,
        outputText: (data.outputKind === 'text' || data.outputKind === 'code') ? data.result as string : undefined,
        outputKind: data.outputKind as PipelineState['outputKind'],
        tokensUsed: data.tokensUsed as number | undefined,
      }));
    } catch {
      clearInterval(stageInterval);
      setPipeline(prev => ({ ...prev, stage: 'idle', generationStage: undefined }));
    }
  }, [callPipeline]);

  const handlePipelineCancel = useCallback(() => {
    setPipeline(prev => ({ ...prev, cancelled: true }));
    setTimeout(() => setPipeline(prev => ({ ...prev, stage: 'idle', generationStage: undefined, cancelled: false })), 1500);
  }, []);

  const handlePipelineNewRequest = useCallback(() => {
    setPipeline(prev => ({ stage: 'idle', questions: [], currentQuestionIndex: 0, answers: {}, userBalance: prev.userBalance }));
  }, []);

  const sendCommand = useCallback(async () => {
    if (running || pipeline.stage !== 'idle') return;

    const trimmed = prompt.trim();
    if (!trimmed && pendingInputs.length === 0) return;

    setRunning(true);
    try {
      // 1. Show user message immediately
      const userText = trimmed || '(attachment)';
      setPrompt('');

      // 2. Detect intent via pipeline API
      setPipeline(prev => ({ ...prev, stage: 'detecting', userInput: userText }));

      const data = await callPipeline({ action: 'detect_intent', userInput: userText });

      if (!data.detected) {
        // No service intent → fall back to existing Gemini/store flow
        setPipeline(prev => ({ ...prev, stage: 'idle' }));
        await sendPrimaryCommand(userText);
      } else {
        // Service detected → run clarification flow
        const qData = await callPipeline({ action: 'get_questions', serviceId: data.serviceId });
        setPipeline(prev => ({
          ...prev,
          stage: 'clarifying',
          serviceId: data.serviceId as RegistryServiceId,
          serviceName: data.serviceName as string,
          userInput: userText,
          questions: (qData.questions as ClarificationQuestion[]) ?? [],
          currentQuestionIndex: 0,
          answers: {},
        }));
        // Add a chat line so user sees their message
        await sendPrimaryCommand(`[PIPELINE_START:${data.serviceId as string}] ${userText}`);
      }

      queueMicrotask(() => composerRef.current?.focus());
    } catch {
      setPipeline(prev => ({ ...prev, stage: 'idle' }));
      await sendPrimaryCommand(prompt.trim()).catch(() => undefined);
    } finally {
      setRunning(false);
    }
  }, [running, pipeline.stage, prompt, pendingInputs.length, callPipeline, sendPrimaryCommand]);

  const kindLabel = (kind: string) => {
    if (kind === 'camera') return copy.camera;
    if (kind === 'voice') return copy.voice;
    return copy.file;
  };

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[310px] sm:px-6 sm:pt-6 sm:pb-[330px]">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-black/20 px-5 py-6 text-sm text-white/60 backdrop-blur-lg">
            {copy.emptyHint}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
            {messages.filter(m => !m.content.startsWith('[PIPELINE_START:')).map((message) => (
              <div key={message.id} className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                <article
                  className={`max-w-[92%] rounded-3xl border px-4 py-3 text-sm leading-relaxed shadow-[0_14px_30px_rgba(0,0,0,0.35)] ${
                    message.role === 'assistant'
                      ? 'border-white/15 bg-white/[0.06] text-white/90'
                      : 'border-cyan-200/40 bg-cyan-500/16 text-cyan-50'
                  }`}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/50">
                    {message.role === 'assistant' ? copy.assistant : copy.operator}
                  </p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </article>
              </div>
            ))}

            {mediaAssets.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="px-1 text-[11px] uppercase tracking-[0.14em] text-white/45">{copy.mediaPreviewTitle}</p>
                {mediaAssets.map((asset) => (
                  <div key={asset.id} className="flex justify-start">
                    <button
                      type="button"
                      onClick={() => {
                        focusPreview(asset.id);
                        setExpandedAsset(asset);
                      }}
                      className="w-full max-w-[92%] rounded-3xl border border-white/15 bg-white/[0.05] p-3 text-left text-white/90 shadow-[0_14px_30px_rgba(0,0,0,0.35)]"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold">{asset.title}</p>
                        <span className="rounded-full border border-white/20 bg-white/[0.06] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/65">
                          {copy.openFullscreen}
                        </span>
                      </div>

                      {asset.kind === 'image' && asset.sourceUrl ? (
                        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10">
                          <Image
                            src={asset.sourceUrl}
                            alt={asset.title}
                            fill
                            sizes="(max-width: 1024px) 92vw, 760px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ) : asset.kind === 'video' && asset.sourceUrl ? (
                        <video
                          src={asset.sourceUrl}
                          controls
                          autoPlay
                          loop
                          className="w-full rounded-2xl bg-black"
                          style={{ maxHeight: 260 }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : asset.kind === 'video' ? (
                        <div className="flex min-h-[164px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-8">
                          <div className="h-1.5 w-48 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full w-1/3 rounded-full bg-cyan-400/60 animate-pulse" />
                          </div>
                          <p className="text-center text-xs text-white/40">{copy.videoPreviewFallback}</p>
                        </div>
                      ) : (
                        <div className="flex min-h-[164px] items-center justify-center rounded-2xl border border-white/10 bg-black/25 px-4 py-8 text-center text-sm text-white/70">
                          {asset.textBody || asset.summary || copy.videoPreviewFallback}
                        </div>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Pipeline cards ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {pipeline.stage !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute inset-x-0 bottom-[310px] sm:bottom-[330px] z-30 flex justify-center px-4 sm:px-6"
          >
            <div className="w-full max-w-lg">
              {pipeline.stage === 'detecting' && (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  <span className="text-sm text-white/60">
                    {localeCode === 'ka' ? 'სერვისს ვანალიზებ...' : localeCode === 'ru' ? 'Анализирую...' : 'Detecting service...'}
                  </span>
                </div>
              )}

              {pipeline.stage === 'clarifying' && (() => {
                const q = pipeline.questions[pipeline.currentQuestionIndex];
                return q ? (
                  <ClarificationMessage
                    question={q}
                    stepNumber={pipeline.currentQuestionIndex + 1}
                    totalSteps={pipeline.questions.length || 4}
                    locale={localeCode}
                    onAnswer={handlePipelineAnswer}
                    selectedValue={pipeline.answers[q.id]}
                  />
                ) : null;
              })()}

              {pipeline.stage === 'confirming' && !pipeline.finalPrompt && (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  <span className="text-sm text-white/60">
                    {localeCode === 'ka' ? 'prompt-ს ვამზადებ...' : 'Building prompt...'}
                  </span>
                </div>
              )}

              {pipeline.stage === 'confirming' && pipeline.finalPrompt && pipeline.creditCost !== undefined && (
                <ConfirmationCard
                  service={pipeline.serviceId!}
                  answers={pipeline.answers}
                  finalPrompt={pipeline.finalPrompt}
                  creditCost={pipeline.creditCost}
                  userBalance={pipeline.userBalance}
                  estimatedSeconds={pipeline.estimatedSeconds ?? 20}
                  locale={localeCode}
                  onEdit={(field) => {
                    if (field === 'answers') setPipeline(prev => ({ ...prev, stage: 'clarifying', currentQuestionIndex: 0, answers: {} }));
                  }}
                  onGenerate={handlePipelineGenerate}
                  onCancel={() => setPipeline(prev => ({ ...prev, stage: 'idle' }))}
                />
              )}

              {pipeline.stage === 'generating' && (
                <GenerationProgress
                  service={pipeline.serviceId!}
                  stage={pipeline.generationStage ?? 'received'}
                  estimatedSeconds={pipeline.estimatedSeconds ?? 20}
                  creditCost={pipeline.creditCost ?? 0}
                  locale={localeCode}
                  onCancel={handlePipelineCancel}
                  cancelled={pipeline.cancelled}
                />
              )}

              {pipeline.stage === 'done' && (
                <OutputCard
                  service={pipeline.serviceId!}
                  outputKind={pipeline.outputKind}
                  resultUrl={pipeline.outputUrl}
                  resultText={pipeline.outputText}
                  creditCost={pipeline.creditCost ?? 0}
                  tokensUsed={pipeline.tokensUsed}
                  locale={localeCode}
                  onNewRequest={handlePipelineNewRequest}
                  onDownload={pipeline.outputUrl ? () => {
                    const a = document.createElement('a');
                    a.href = pipeline.outputUrl!;
                    a.download = `myavatar-${pipeline.serviceId ?? 'output'}-${Date.now()}`;
                    a.click();
                  } : undefined}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] sm:px-4">
        <div ref={barRef} className="pointer-events-auto w-full max-w-5xl">
          {switcherOpen && (
            <div
              id="omni-service-switcher"
              role="listbox"
              aria-label="Service switcher"
              className="mb-3 max-h-[52vh] overflow-auto rounded-3xl border border-white/15 bg-[rgba(10,14,24,0.92)] p-3 backdrop-blur-2xl shadow-[0_22px_50px_rgba(0,0,0,0.55)]"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{copy.serviceSwitcherHint}</p>
                <button
                  type="button"
                  onClick={() => setSwitcherOpen(false)}
                  className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {OMNI_SERVICES.map((service) => {
                  const localized = getLocalizedService(service.id, localeCode);
                  const isActive = activeServiceId === service.id;

                  return (
                    <button
                      key={service.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        setActiveService(service.id);
                        setSwitcherOpen(false);
                        queueMicrotask(() => composerRef.current?.focus());
                      }}
                      className={`rounded-2xl border px-3 py-2 text-left transition ${
                        isActive
                          ? 'border-cyan-200/45 bg-cyan-500/15 text-cyan-50'
                          : 'border-white/10 bg-white/[0.04] text-white/80 hover:border-white/20 hover:bg-white/[0.08]'
                      }`}
                    >
                      <p className="text-xs font-semibold">{localized.title}</p>
                      <p className="mt-0.5 text-[11px] text-white/55">{localized.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />

          {pendingInputs.length > 0 && (
            <div className="mb-3 rounded-3xl border border-white/15 bg-[rgba(10,14,24,0.9)] p-2.5 backdrop-blur-2xl">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-white/60">{copy.attachedContext}</p>
                <button
                  type="button"
                  className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] text-white/75 hover:bg-white/[0.1]"
                  onClick={clearPendingInputs}
                >
                  {copy.clearAll}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {pendingInputs.map((input) => (
                  <span
                    key={input.id}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2 py-1 text-[11px] text-white/80"
                  >
                    {kindLabel(input.kind)}
                    <span className="max-w-[170px] truncate">{input.title}</span>
                    <button
                      type="button"
                      onClick={() => removePendingInput(input.id)}
                      className="rounded-full p-0.5 text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <form
            className="overflow-hidden rounded-[30px] border border-white/20 bg-[rgba(12,18,28,0.74)] px-3 py-3 backdrop-blur-2xl shadow-[0_28px_56px_rgba(0,0,0,0.58)]"
            onSubmit={(event) => {
              event.preventDefault();
              void sendCommand();
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              void onDropFiles(event);
            }}
          >
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

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex min-h-[44px] items-center rounded-full border border-cyan-200/30 bg-cyan-500/12 px-3 text-xs font-medium text-cyan-100">
                {activeService.title}
              </span>

              <div className="inline-flex min-h-[44px] items-center gap-1 rounded-2xl border border-white/15 bg-white/[0.06] px-1.5 py-1">
                <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55">{copy.languageLabel}</span>
                {LANGUAGE_OPTIONS.map((option) => {
                  const active = commandLanguage === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setCommandLanguage(option.id);
                        setLocale(option.id);
                      }}
                      className={`rounded-xl px-2 py-1 text-[11px] font-semibold transition ${
                        active
                          ? 'bg-cyan-500/25 text-cyan-100'
                          : 'text-white/75 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                aria-label={copy.openServiceHub}
                onClick={() => setSwitcherOpen((open) => !open)}
                className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] text-white/85 hover:bg-white/[0.12]"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setPrompt('');
                  queueMicrotask(() => composerRef.current?.focus());
                }}
                disabled={!prompt.trim() || running || pipeline.stage !== 'idle'}
                className="inline-flex min-h-[44px] items-center rounded-2xl border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/80 disabled:opacity-45"
              >
                {copy.clear}
              </button>
            </div>

            <textarea
              ref={composerRef}
              value={prompt}
              rows={1}
              onInput={autoGrow}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendCommand();
                }
              }}
              placeholder={copy.placeholder}
              className="max-h-[180px] min-h-[50px] w-full resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/38"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={copy.uploadFile}
                aria-label={copy.uploadFile}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.05] text-white/82 hover:bg-white/[0.12]"
              >
                <Plus className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={toggleRecording}
                title={recording ? copy.stopVoice : copy.startVoice}
                className={`inline-flex min-h-[44px] items-center gap-1 rounded-2xl border px-3 py-1.5 text-xs transition ${
                  recording
                    ? 'border-red-300/45 bg-red-500/18 text-red-100'
                    : 'border-white/15 bg-white/[0.05] text-white/82 hover:bg-white/[0.12]'
                }`}
              >
                {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
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
                title={cameraOpen ? copy.closeCamera : copy.openCamera}
                className={`inline-flex min-h-[44px] items-center gap-1 rounded-2xl border px-3 py-1.5 text-xs transition ${
                  cameraOpen
                    ? 'border-cyan-300/45 bg-cyan-500/20 text-cyan-100'
                    : 'border-white/15 bg-white/[0.05] text-white/82 hover:bg-white/[0.12]'
                }`}
              >
                <Camera className="h-4 w-4" />
                {copy.camera}
              </button>

              <button
                type="submit"
                disabled={running || pipeline.stage !== 'idle' || (!prompt.trim() && pendingInputs.length === 0)}
                className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl border border-cyan-300/45 bg-cyan-500/18 px-4 py-1.5 text-xs font-semibold text-cyan-50 disabled:opacity-40"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {copy.send}
              </button>
            </div>

            <div className="mt-2 flex items-center gap-1 text-[11px] text-white/45">
              <Sparkles className="h-3.5 w-3.5" />
              {copy.sendHint}
            </div>
          </form>

          {mediaError && (
            <p className="mt-2 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {mediaError}
            </p>
          )}
        </div>
      </div>

      {expandedAsset && (
        <div
          className="fixed inset-0 z-[120] bg-black/82 backdrop-blur-md"
          onClick={() => setExpandedAsset(null)}
          role="presentation"
        >
          <div
            className="mx-auto flex h-full w-full max-w-6xl flex-col px-4 pb-[max(env(safe-area-inset-bottom,0px),20px)] pt-[max(env(safe-area-inset-top,0px),20px)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={expandedAsset.title}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-white/55">{copy.mediaPreviewTitle}</p>
                <p className="text-sm font-semibold text-white">{expandedAsset.title}</p>
              </div>

              <button
                type="button"
                aria-label={copy.closeFullscreen}
                onClick={() => setExpandedAsset(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.07] text-white/85 transition hover:bg-white/[0.14]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-3xl border border-white/15 bg-[rgba(8,12,22,0.88)] shadow-[0_26px_70px_rgba(0,0,0,0.6)]">
              {expandedAsset.kind === 'image' && expandedAsset.sourceUrl ? (
                <Image
                  src={expandedAsset.sourceUrl}
                  alt={expandedAsset.title}
                  fill
                  sizes="100vw"
                  className="object-contain"
                  unoptimized
                />
              ) : expandedAsset.kind === 'video' && expandedAsset.sourceUrl ? (
                <video
                  src={expandedAsset.sourceUrl}
                  controls
                  autoPlay
                  loop
                  className="h-full w-full object-contain bg-black"
                />
              ) : expandedAsset.kind === 'video' ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
                  <div className="h-2 w-64 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-cyan-400/60 animate-pulse" />
                  </div>
                  <p className="text-center text-sm text-white/40">{copy.videoPreviewFallback}</p>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/75">
                  {expandedAsset.textBody || expandedAsset.summary || copy.videoPreviewFallback}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div
          className="fixed inset-0 z-[125] bg-black/82 backdrop-blur-md"
          onClick={closeCamera}
          role="presentation"
        >
          <div
            className="mx-auto flex h-full w-full max-w-6xl flex-col px-4 pb-[max(env(safe-area-inset-bottom,0px),20px)] pt-[max(env(safe-area-inset-top,0px),20px)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={copy.camera}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-white/55">{cameraStatusLabel}</p>
                <p className="text-sm font-semibold text-white">
                  {cameraState === 'ready' ? copy.livePreview : copy.waitingCamera}
                </p>
              </div>

              <button
                type="button"
                aria-label={copy.closeCamera}
                onClick={closeCamera}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.07] text-white/85 transition hover:bg-white/[0.14]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-3xl border border-white/15 bg-[rgba(8,12,22,0.88)] shadow-[0_26px_70px_rgba(0,0,0,0.6)]">
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={captureFromCamera}
                disabled={cameraState !== 'ready'}
                className="min-h-[44px] rounded-2xl border border-cyan-300/45 bg-cyan-500/18 px-4 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-45"
              >
                {copy.capture}
              </button>
              <button
                type="button"
                onClick={closeCamera}
                className="min-h-[44px] rounded-2xl border border-white/20 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/80"
              >
                {copy.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
