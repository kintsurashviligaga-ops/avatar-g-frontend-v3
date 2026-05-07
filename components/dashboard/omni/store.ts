'use client';

import { create } from 'zustand';
import { useGlobalStore, useStore } from '@/lib/store';
import type { ServiceType } from '@/lib/store';
import { OMNI_SERVICE_MAP, OMNI_SERVICES } from './services';
import {
  getLocalizedService,
  localizeBooleanState,
  localizeCommandLanguage,
  normalizeOmniLocale,
} from './i18n';
import type {
  ActivityLevel,
  ActivityItem,
  AuthSnapshot,
  ChatMessage,
  CommandLanguage,
  ExternalCommandInput,
  ExpertSettings,
  PreviewArtifact,
  PreviewKind,
  ServiceId,
  ServiceRuntimeState,
} from './types';

const MAX_LOG_ITEMS = 220;
const MAX_CHAT_ITEMS = 90;
const MAX_OUTPUTS_PER_SERVICE = 12;
const MAX_PENDING_INPUTS = 24;
const BASELINE_GEL = 2000;
const DEFAULT_CREDITS = 4200;

const syncGlobalServiceSelection = (serviceId: ServiceId) => {
  useGlobalStore.getState().setActiveService(serviceId as ServiceType);
  useStore.getState().setCurrentService(serviceId);
};

const AUTO_BRIDGE_TARGETS: Record<ServiceId, ServiceId[]> = {
  avatar: ['image', 'video'],
  video: ['image', 'music'],
  image: ['video', 'prompt-builder'],
  music: ['video', 'game-creation'],
  'game-creation': ['prompt-builder', 'terminal-coding'],
  'interior-design': ['image', 'video'],
  'prompt-builder': ['terminal-coding', 'game-creation'],
  'terminal-coding': ['prompt-builder', 'game-creation'],
};

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });


const createTextImage = (title: string, accent: string, line: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#101828" />
          <stop offset="100%" stop-color="#1f2937" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#g)" />
      <rect x="52" y="52" width="1176" height="616" rx="24" fill="none" stroke="${accent}" stroke-width="3" opacity="0.75"/>
      <text x="90" y="180" fill="#e5f6ff" font-size="64" font-family="Inter, Arial, sans-serif" font-weight="700">${title}</text>
      <text x="90" y="240" fill="#9fc2d8" font-size="30" font-family="Inter, Arial, sans-serif">${line}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

function defaultExpert(serviceId: ServiceId): ExpertSettings {
  if (serviceId === 'prompt-builder') {
    return { seed: 11, sampling: 54, weights: 67, temperature: 72 };
  }
  if (serviceId === 'music') {
    return { seed: 38, sampling: 62, weights: 74, temperature: 36 };
  }
  if (serviceId === 'image' || serviceId === 'video') {
    return { seed: 57, sampling: 70, weights: 64, temperature: 48 };
  }
  return { seed: 29, sampling: 60, weights: 58, temperature: 44 };
}

const STORE_COPY = {
  ka: {
    guestOperator: 'სტუმარი ოპერატორი',
    guestTier: 'სტუმარი',
    outputSuffix: 'შედეგი',
    inputPrefix: 'შეყვანა',
    summaryTitle: 'შეჯამება',
    nextActionTitle: 'შემდეგი ნაბიჯი',
    actionValidate: '- გადაამოწმე დამოკიდებულებები',
    actionQuality: '- გაუშვი ხარისხის კონტროლის ეტაპი',
    actionExport: '- გაიტანე აღმასრულებელი ანგარიში',
    audioBlueprintPrefix: 'აუდიო გეგმა შეიქმნა:',
    workflowStagedPrefix: 'Workflow ჯაჭვი მომზადდა სერვისისთვის',
    videoFallback: 'ვიდეო სტორიბორდი მზადაა. რენდერის რიგი სინქრონიზებულია.',
    imageGenerating: 'სურათი იქმნება...',
    avatarGenerating: 'ავატარი იქმნება HeyGen-ით...',
    musicGenerating: 'ბგერა/მუსიკა იქმნება ElevenLabs-ით...',
    initLog: 'Omni-Dashboard ჩაიტვირთა. ერთ-ფანჯრიანი ბრძანების ცენტრი მზადაა.',
    initChat: 'Primary Agent მზადაა. აღწერე მიზანი და ყველა სერვისს ავტომატურად დავაორკესტრირებ.',
    routingComplete: 'PrimaryAgent მარშრუტიზაცია დასრულდა:',
    selectedFrom: 'არჩეულია კონტექსტიდან',
    workerCompleted: 'დაასრულა პაკეტის გენერაცია live რეჟიმში',
    bridgeLabel: 'უნივერსალური bridge:',
    outputSharedWith: 'შედეგი გაეზიარა სერვისებს',
    assistantFinished: 'ვორკერი დასრულდა.',
    previewLive: 'შედეგი უკვე ჩანს პრევიუში.',
    modulesActive: 'მოდული აქტიურია',
    jobsRunning: 'პროცესი გაშვებულია',
    assistantDispatched: 'ასისტენტის პასუხი გაგზავნილია',
    focusSwitched: 'ფოკუსი გადავიდა სერვისზე',
    commandLanguageSet: 'ბრძანების ენა განახლდა:',
    multimodalAttached: 'დამატებულია მულტიმოდალური input:',
    pendingCleared: 'მოლოდინში მყოფი მულტიმოდალური input-ები გასუფთავდა.',
    processAttached: 'დამუშავე მიმაგრებული მულტიმოდალური input-ები.',
    attachedInputs: 'მიმაგრებული input-ები',
    byteUnit: 'ბაიტი',
    commandReceived: 'PrimaryAgent-მა ბრძანება მიიღო ენაზე',
    previewFocus: 'პრევიუს ფოკუსი გადავიდა არტეფაქტზე',
    manualBridge: 'ხელით bridge:',
    pushedTo: 'გადაიგზავნა სერვისში',
    activityCleared: 'აქტივობის ჟურნალი გასუფთავდა ოპერატორის მიერ.',
  },
  en: {
    guestOperator: 'Guest Operator',
    guestTier: 'Guest',
    outputSuffix: 'Output',
    inputPrefix: 'Input',
    summaryTitle: 'SUMMARY',
    nextActionTitle: 'NEXT ACTION',
    actionValidate: '- Validate dependencies',
    actionQuality: '- Trigger quality gate',
    actionExport: '- Export executive report',
    audioBlueprintPrefix: 'Audio blueprint generated for:',
    workflowStagedPrefix: 'Workflow chain staged for service',
    videoFallback: 'Storyboard staged. Real-time render queue synchronized.',
    imageGenerating: 'Generating image...',
    avatarGenerating: 'Generating avatar with HeyGen...',
    musicGenerating: 'Generating sound with ElevenLabs...',
    initLog: 'Omni-Dashboard initialized. One-window command center online.',
    initChat: 'Primary Agent online. Describe a goal and I will route worker agents while keeping every module synchronized.',
    routingComplete: 'PrimaryAgent routing complete:',
    selectedFrom: 'selected from context',
    workerCompleted: 'completed render package in live mode',
    bridgeLabel: 'Universal bridge:',
    outputSharedWith: 'output shared with',
    assistantFinished: 'Worker finished.',
    previewLive: 'Output is now live in the preview pane.',
    modulesActive: 'modules are active',
    jobsRunning: 'jobs are running',
    assistantDispatched: 'Assistant response dispatched',
    focusSwitched: 'Focus switched to',
    commandLanguageSet: 'Command language set to:',
    multimodalAttached: 'Multimodal input attached:',
    pendingCleared: 'Pending multimodal inputs cleared.',
    processAttached: 'Process attached multimodal inputs.',
    attachedInputs: 'Attached Inputs',
    byteUnit: 'bytes',
    commandReceived: 'PrimaryAgent received command in',
    previewFocus: 'Preview focus switched to',
    manualBridge: 'Manual bridge:',
    pushedTo: 'pushed to',
    activityCleared: 'Activity log cleared by operator.',
  },
  ru: {
    guestOperator: 'Гостевой оператор',
    guestTier: 'Гость',
    outputSuffix: 'Результат',
    inputPrefix: 'Вход',
    summaryTitle: 'СВОДКА',
    nextActionTitle: 'СЛЕДУЮЩИЕ ШАГИ',
    actionValidate: '- Проверь зависимости',
    actionQuality: '- Запусти этап контроля качества',
    actionExport: '- Выгрузи executive-отчет',
    audioBlueprintPrefix: 'Аудио-план подготовлен для:',
    workflowStagedPrefix: 'Workflow-цепочка подготовлена для сервиса',
    videoFallback: 'Сториборд готов. Очередь рендера синхронизирована.',
    imageGenerating: 'Генерация изображения...',
    avatarGenerating: 'Создание аватара через HeyGen...',
    musicGenerating: 'Генерация звука через ElevenLabs...',
    initLog: 'Omni-Dashboard инициализирован. Командный центр в одном окне готов.',
    initChat: 'Primary Agent онлайн. Опишите цель, и я автоматически оркестрирую все сервисы.',
    routingComplete: 'Маршрутизация PrimaryAgent завершена:',
    selectedFrom: 'выбрано из контекста',
    workerCompleted: 'завершил пакет рендера в live-режиме',
    bridgeLabel: 'Универсальный bridge:',
    outputSharedWith: 'результат передан сервисам',
    assistantFinished: 'Воркер завершил задачу.',
    previewLive: 'Результат уже доступен в превью.',
    modulesActive: 'модулей активно',
    jobsRunning: 'задач выполняется',
    assistantDispatched: 'Ответ ассистента отправлен',
    focusSwitched: 'Фокус переключен на сервис',
    commandLanguageSet: 'Язык команды изменен:',
    multimodalAttached: 'Добавлен мультимодальный input:',
    pendingCleared: 'Ожидающие мультимодальные input очищены.',
    processAttached: 'Обработай прикрепленные мультимодальные input.',
    attachedInputs: 'Прикрепленные input',
    byteUnit: 'байт',
    commandReceived: 'PrimaryAgent получил команду на языке',
    previewFocus: 'Фокус превью переключен на',
    manualBridge: 'Ручной bridge:',
    pushedTo: 'передан в сервис',
    activityCleared: 'Журнал активности очищен оператором.',
  },
} as const;

const getStoreCopy = (locale: string) => STORE_COPY[normalizeOmniLocale(locale)];

function defaultModuleSettings(serviceId: ServiceId): Record<string, string | number | boolean> {
  if (serviceId === 'terminal-coding') {
    return { shellSafety: true, staticAnalysis: true, retries: 2 };
  }
  if (serviceId === 'music') {
    return { waveformFocus: 58, denoise: true, phonemeLock: 64 };
  }
  if (serviceId === 'image') {
    return { brush: 34, texture: 72, canvasGrid: true };
  }
  if (serviceId === 'game-creation') {
    return { gameplayLoops: 3, balanceFocus: 74, progressionMap: true };
  }
  if (serviceId === 'prompt-builder') {
    return { cadence: 64, persuasion: 71, markdownMode: true };
  }
  if (serviceId === 'interior-design') {
    return { styleRange: 4, layoutPrecision: 72, materialMode: true };
  }
  return { precision: 61, throughput: 55, safetyLock: true };
}

function initializeServiceState(): Record<ServiceId, ServiceRuntimeState> {
  return OMNI_SERVICES.reduce(
    (acc, service) => {
      acc[service.id] = {
        enabled: true,
        autopilot: service.id === 'avatar',
        syncPreview: true,
        fidelity: 74,
        intensity: 58,
        expert: defaultExpert(service.id),
        moduleSettings: defaultModuleSettings(service.id),
        status: 'ready',
        queueDepth: 0,
        lastPrompt: service.defaultPrompt,
        outputs: [],
        referenceIds: [],
      };
      return acc;
    },
    {} as Record<ServiceId, ServiceRuntimeState>,
  );
}

function routeWorkerService(prompt: string, fallback: ServiceId): ServiceId {
  const query = prompt.toLowerCase();
  const rules: Array<{ serviceId: ServiceId; keys: string[] }> = [
    { serviceId: 'avatar', keys: ['avatar', 'persona', 'portrait', 'ავატარ', 'პორტრეტ'] },
    { serviceId: 'video', keys: ['video', 'scene', 'teaser', 'cinematic', 'ვიდეო', 'სცენა'] },
    { serviceId: 'image', keys: ['image', 'poster', 'visual', 'photo', 'canvas', 'სურათ', 'ფოტო'] },
    { serviceId: 'music', keys: ['music', 'soundtrack', 'beat', 'audio bed', 'მუსიკ', 'საუნდტრეკ'] },
    { serviceId: 'game-creation', keys: ['game', 'level', 'gameplay', 'npc', 'თამაშ', 'გეიმ'] },
    { serviceId: 'interior-design', keys: ['interior', 'space', 'furniture', 'room', 'ინტერიერ', 'დიზაინ'] },
    { serviceId: 'prompt-builder', keys: ['prompt', 'template', 'instruction', 'markdown', 'პრომპტ', 'prompt-'] },
    { serviceId: 'terminal-coding', keys: ['terminal', 'code', 'coding', 'script', 'api', 'ტერმინალ', 'კოდ'] },
    { serviceId: 'content-writer', keys: ['article', 'blog', 'copy', 'write', 'სტატი', 'კონტენტ', 'ბლოგ'] },
    { serviceId: 'podcast', keys: ['podcast', 'episode', 'audio script', 'პოდკასტ', 'ეპიზოდ'] },
    { serviceId: 'character', keys: ['character', 'persona', 'backstory', 'fiction', 'პერსონაჟ', 'ქარექტერ'] },
    { serviceId: 'event', keys: ['event', 'conference', 'ceremony', 'ივენთ', 'ღონისძიებ', 'კონფერენც'] },
    { serviceId: 'tourism', keys: ['travel', 'tourism', 'trip', 'itinerary', 'მოგზაურ', 'ტური', 'ადგილ'] },
    { serviceId: 'voice-studio', keys: ['voiceover', 'tts', 'narrate', 'voice-over', 'ხმის სინთ', 'ნარაც'] },
  ];

  const match = rules.find((rule) => rule.keys.some((key) => query.includes(key)));
  return match?.serviceId ?? fallback;
}

function buildArtifact(serviceId: ServiceId, prompt: string, locale: string): PreviewArtifact {
  const copy = getStoreCopy(locale);
  const service = OMNI_SERVICE_MAP[serviceId];
  const localizedService = getLocalizedService(serviceId, locale);
  const shortPrompt = prompt.length > 110 ? `${prompt.slice(0, 107)}...` : prompt;
  const common = {
    id: createId(),
    serviceId,
    title: `${localizedService.title} ${copy.outputSuffix}`,
    summary: shortPrompt,
    createdAt: Date.now(),
  };

  const kind: PreviewKind = service.previewKind;
  if (kind === 'image') {
    return {
      ...common,
      kind,
      sourceUrl: createTextImage(localizedService.title, service.accent, shortPrompt),
    };
  }

  if (kind === 'text') {
    return {
      ...common,
      kind,
      textBody: `${copy.summaryTitle}\n${shortPrompt}\n\n${copy.nextActionTitle}\n${copy.actionValidate}\n${copy.actionQuality}\n${copy.actionExport}`,
    };
  }

  if (kind === 'audio') {
    return {
      ...common,
      kind,
      textBody: `${copy.audioBlueprintPrefix} ${shortPrompt}`,
    };
  }

  if (kind === 'workflow') {
    return {
      ...common,
      kind,
      textBody: `${copy.workflowStagedPrefix} ${localizedService.title}.`,
    };
  }

  return {
    ...common,
    kind: 'video',
    textBody: copy.videoFallback,
  };
}

function previewKindFromInput(input: Omit<ExternalCommandInput, 'id' | 'createdAt'>): PreviewKind {
  if (input.sourceUrl && input.mimeType?.startsWith('image/')) return 'image';
  if (input.kind === 'voice') return 'audio';
  return 'text';
}

function buildInputArtifact(
  serviceId: ServiceId,
  input: ExternalCommandInput,
  locale: string,
): PreviewArtifact | null {
  const copy = getStoreCopy(locale);
  const kind = previewKindFromInput(input);
  const summary = input.textContent ?? input.fileName ?? input.title;

  if (!summary && !input.sourceUrl) {
    return null;
  }

  return {
    id: createId(),
    serviceId,
    kind,
    title: `${copy.inputPrefix} · ${input.title}`,
    summary,
    createdAt: input.createdAt,
    sourceUrl: input.sourceUrl,
    textBody: input.textContent,
  };
}

function addLogLine(
  state: OmniDashboardState,
  level: ActivityLevel,
  message: string,
): Pick<OmniDashboardState, 'activityLog'> {
  const next: ActivityItem = {
    id: createId(),
    level,
    message,
    ts: Date.now(),
  };
  return {
    activityLog: [...state.activityLog, next].slice(-MAX_LOG_ITEMS),
  };
}

function addChatLine(
  state: OmniDashboardState,
  role: ChatMessage['role'],
  content: string,
): Pick<OmniDashboardState, 'chatMessages'> {
  const next: ChatMessage = {
    id: createId(),
    role,
    content,
    ts: Date.now(),
  };
  return {
    chatMessages: [...state.chatMessages, next].slice(-MAX_CHAT_ITEMS),
  };
}

function autoBridgeOutput(
  services: Record<ServiceId, ServiceRuntimeState>,
  sourceService: ServiceId,
  outputId: string,
) {
  const targets = AUTO_BRIDGE_TARGETS[sourceService] ?? [];
  for (const target of targets) {
    const targetState = services[target];
    services[target] = {
      ...targetState,
      referenceIds: [outputId, ...targetState.referenceIds].slice(0, MAX_OUTPUTS_PER_SERVICE),
    };
  }
  return targets;
}

export interface OmniDashboardState {
  locale: string;
  baselineGel: number;
  credits: number;
  auth: AuthSnapshot;
  activeServiceId: ServiceId;
  commandLanguage: CommandLanguage;
  services: Record<ServiceId, ServiceRuntimeState>;
  sharedAssets: PreviewArtifact[];
  preview: PreviewArtifact | null;
  activityLog: ActivityItem[];
  chatMessages: ChatMessage[];
  pendingInputs: ExternalCommandInput[];
  setLocale: (locale: string) => void;
  setAuthSnapshot: (auth: AuthSnapshot) => void;
  setActiveService: (serviceId: ServiceId) => void;
  setCommandLanguage: (language: CommandLanguage) => void;
  setServiceDial: (serviceId: ServiceId, key: 'fidelity' | 'intensity', value: number) => void;
  setExpertSetting: (serviceId: ServiceId, key: keyof ExpertSettings, value: number) => void;
  setModuleSetting: (serviceId: ServiceId, key: string, value: string | number | boolean) => void;
  toggleServiceFlag: (serviceId: ServiceId, key: 'enabled' | 'autopilot' | 'syncPreview') => void;
  ingestCommandInput: (input: Omit<ExternalCommandInput, 'id' | 'createdAt'>) => void;
  removePendingInput: (inputId: string) => void;
  clearPendingInputs: () => void;
  runServiceNow: (serviceId: ServiceId, prompt?: string) => Promise<void>;
  sendPrimaryCommand: (prompt: string) => Promise<void>;
  focusPreview: (assetId: string) => void;
  bridgeAssetToService: (assetId: string, targetServiceId: ServiceId) => void;
  clearActivity: () => void;
}

export const useOmniDashboardStore = create<OmniDashboardState>((set, get) => {
  const runWorker = async (serviceId: ServiceId, prompt: string, source: 'chat' | 'panel') => {
    const locale = normalizeOmniLocale(get().locale);
    const copy = getStoreCopy(locale);
    const descriptor = OMNI_SERVICE_MAP[serviceId];
    const localizedDescriptor = getLocalizedService(serviceId, locale);
    const traceId = createId();

    // Strip [language=...] metadata prefix so it never leaks into UI
    const cleanPrompt = prompt.replace(/^\[language=[^\]]*\]\s*/m, '').trim();

    set((state) => {
      const current = state.services[serviceId];
      return {
        services: {
          ...state.services,
          [serviceId]: { ...current, status: 'running', queueDepth: current.queueDepth + 1, lastPrompt: cleanPrompt },
        },
        ...addLogLine(state, 'api', `POST /api/agents/orchestrate worker=${descriptor.worker} trace=${traceId}`),
      };
    });

    await delay(220);

    set((state) => ({
      ...addLogLine(
        state,
        'agent',
        `${copy.routingComplete} ${localizedDescriptor.title} ${copy.selectedFrom} ${getLocalizedService(state.activeServiceId, locale).title}.`,
      ),
    }));

    // --- Video: call real LTX API ---
    if (serviceId === 'video') {
      const videoArtifactId = createId();

      // Add a loading placeholder into sharedAssets + preview
      const loadingArtifact: PreviewArtifact = {
        id: videoArtifactId,
        serviceId,
        kind: 'video',
        title: `${localizedDescriptor.title} — ${cleanPrompt.slice(0, 50)}`,
        summary: cleanPrompt,
        createdAt: Date.now(),
        textBody: copy.videoFallback,
      };

      set((state) => {
        const svc = state.services[serviceId];
        return {
          services: {
            ...state.services,
            [serviceId]: { ...svc, outputs: [loadingArtifact, ...svc.outputs].slice(0, MAX_OUTPUTS_PER_SERVICE) },
          },
          sharedAssets: [loadingArtifact, ...state.sharedAssets].slice(0, 140),
          preview: loadingArtifact,
        };
      });

      if (source === 'chat') {
        const msgId = createId();
        set((state) => ({
          chatMessages: [
            ...state.chatMessages,
            { id: msgId, role: 'assistant' as const, content: copy.videoFallback, ts: Date.now() },
          ].slice(-MAX_CHAT_ITEMS),
          ...addLogLine(state, 'agent', `${copy.assistantDispatched} trace=${traceId}`),
        }));
      }

      try {
        const res = await fetch('/api/ltx-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: cleanPrompt, model: 'ltx-2-3-fast', resolution: '1920x1080', duration: 6, fps: 24 }),
        });

        const contentType = res.headers.get('content-type') ?? '';
        if (res.ok && contentType.includes('video')) {
          const blob = await res.blob();
          const videoUrl = URL.createObjectURL(blob);

          const readyArtifact: PreviewArtifact = { ...loadingArtifact, sourceUrl: videoUrl, textBody: undefined };

          set((state) => {
            const svc = state.services[serviceId];
            const updatedOutputs = svc.outputs.map((o) => o.id === videoArtifactId ? readyArtifact : o);
            const updatedAssets = state.sharedAssets.map((a) => a.id === videoArtifactId ? readyArtifact : a);
            return {
              services: {
                ...state.services,
                [serviceId]: { ...svc, status: 'ready', queueDepth: Math.max(0, svc.queueDepth - 1), outputs: updatedOutputs },
              },
              sharedAssets: updatedAssets,
              preview: readyArtifact,
              ...addLogLine(state, 'worker', `${descriptor.worker} ${copy.workerCompleted}`),
            };
          });
        } else {
          const errData = await res.json().catch(() => ({})) as { error?: string };
          const errMsg = errData.error ?? `Error ${res.status}`;
          set((state) => {
            const svc = state.services[serviceId];
            return {
              services: { ...state.services, [serviceId]: { ...svc, status: 'error', queueDepth: Math.max(0, svc.queueDepth - 1) } },
              ...addLogLine(state, 'system', `video worker error: ${errMsg}`),
            };
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'network error';
        set((state) => {
          const svc = state.services[serviceId];
          return {
            services: { ...state.services, [serviceId]: { ...svc, status: 'error', queueDepth: Math.max(0, svc.queueDepth - 1) } },
            ...addLogLine(state, 'system', `video worker exception: ${msg}`),
          };
        });
      }

      return;
    }

    // --- Avatar: call HeyGen API ---
    if (serviceId === 'avatar') {
      const avatarArtifactId = createId();

      const loadingArtifact: PreviewArtifact = {
        id: avatarArtifactId,
        serviceId,
        kind: 'video',
        title: `${localizedDescriptor.title} — ${cleanPrompt.slice(0, 50)}`,
        summary: cleanPrompt,
        createdAt: Date.now(),
        textBody: copy.avatarGenerating,
      };

      set((state) => {
        const svc = state.services[serviceId];
        return {
          services: {
            ...state.services,
            [serviceId]: { ...svc, outputs: [loadingArtifact, ...svc.outputs].slice(0, MAX_OUTPUTS_PER_SERVICE) },
          },
          sharedAssets: [loadingArtifact, ...state.sharedAssets].slice(0, 140),
          preview: loadingArtifact,
        };
      });

      if (source === 'chat') {
        const msgId = createId();
        set((state) => ({
          chatMessages: [
            ...state.chatMessages,
            { id: msgId, role: 'assistant' as const, content: copy.avatarGenerating, ts: Date.now() },
          ].slice(-MAX_CHAT_ITEMS),
          ...addLogLine(state, 'agent', `${copy.assistantDispatched} trace=${traceId}`),
        }));
      }

      try {
        const res = await fetch('/api/heygen/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: cleanPrompt }),
        });

        const data = await res.json() as { success: boolean; url: string | null; error?: string };

        if (res.ok && data.success && data.url) {
          const readyArtifact: PreviewArtifact = { ...loadingArtifact, sourceUrl: data.url, textBody: undefined };

          set((state) => {
            const svc = state.services[serviceId];
            const updatedOutputs = svc.outputs.map((o) => o.id === avatarArtifactId ? readyArtifact : o);
            const updatedAssets = state.sharedAssets.map((a) => a.id === avatarArtifactId ? readyArtifact : a);
            return {
              services: {
                ...state.services,
                [serviceId]: { ...svc, status: 'ready', queueDepth: Math.max(0, svc.queueDepth - 1), outputs: updatedOutputs },
              },
              sharedAssets: updatedAssets,
              preview: readyArtifact,
              ...addLogLine(state, 'worker', `${descriptor.worker} ${copy.workerCompleted}`),
            };
          });
        } else {
          const errMsg = data.error ?? `Error ${res.status}`;
          set((state) => {
            const svc = state.services[serviceId];
            return {
              services: { ...state.services, [serviceId]: { ...svc, status: 'error', queueDepth: Math.max(0, svc.queueDepth - 1) } },
              ...addLogLine(state, 'system', `avatar worker error: ${errMsg}`),
            };
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'network error';
        set((state) => {
          const svc = state.services[serviceId];
          return {
            services: { ...state.services, [serviceId]: { ...svc, status: 'error', queueDepth: Math.max(0, svc.queueDepth - 1) } },
            ...addLogLine(state, 'system', `avatar worker exception: ${msg}`),
          };
        });
      }

      return;
    }

    // --- Image / Interior Design: call real Replicate API ---
    if (serviceId === 'image' || serviceId === 'interior-design') {
      const imageArtifactId = createId();

      const loadingArtifact: PreviewArtifact = {
        id: imageArtifactId,
        serviceId,
        kind: 'image',
        title: `${localizedDescriptor.title} — ${cleanPrompt.slice(0, 50)}`,
        summary: cleanPrompt,
        createdAt: Date.now(),
      };

      set((state) => {
        const svc = state.services[serviceId];
        return {
          services: {
            ...state.services,
            [serviceId]: { ...svc, outputs: [loadingArtifact, ...svc.outputs].slice(0, MAX_OUTPUTS_PER_SERVICE) },
          },
          sharedAssets: [loadingArtifact, ...state.sharedAssets].slice(0, 140),
          preview: loadingArtifact,
        };
      });

      if (source === 'chat') {
        const msgId = createId();
        set((state) => ({
          chatMessages: [
            ...state.chatMessages,
            { id: msgId, role: 'assistant' as const, content: copy.imageGenerating, ts: Date.now() },
          ].slice(-MAX_CHAT_ITEMS),
          ...addLogLine(state, 'agent', `${copy.assistantDispatched} trace=${traceId}`),
        }));
      }

      try {
        const res = await fetch('/api/replicate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: 'image', prompt: cleanPrompt, quality: 'standard' }),
        });

        const data = await res.json() as { success: boolean; url: string | null; error?: string };

        if (res.ok && data.success && data.url) {
          const readyArtifact: PreviewArtifact = { ...loadingArtifact, sourceUrl: data.url };

          set((state) => {
            const svc = state.services[serviceId];
            const updatedOutputs = svc.outputs.map((o) => o.id === imageArtifactId ? readyArtifact : o);
            const updatedAssets = state.sharedAssets.map((a) => a.id === imageArtifactId ? readyArtifact : a);
            return {
              services: {
                ...state.services,
                [serviceId]: { ...svc, status: 'ready', queueDepth: Math.max(0, svc.queueDepth - 1), outputs: updatedOutputs },
              },
              sharedAssets: updatedAssets,
              preview: readyArtifact,
              ...addLogLine(state, 'worker', `${descriptor.worker} ${copy.workerCompleted}`),
            };
          });
        } else {
          const errMsg = data.error ?? `Error ${res.status}`;
          set((state) => {
            const svc = state.services[serviceId];
            return {
              services: { ...state.services, [serviceId]: { ...svc, status: 'error', queueDepth: Math.max(0, svc.queueDepth - 1) } },
              ...addLogLine(state, 'system', `image worker error: ${errMsg}`),
            };
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'network error';
        set((state) => {
          const svc = state.services[serviceId];
          return {
            services: { ...state.services, [serviceId]: { ...svc, status: 'error', queueDepth: Math.max(0, svc.queueDepth - 1) } },
            ...addLogLine(state, 'system', `image worker exception: ${msg}`),
          };
        });
      }

      return;
    }

    // --- Music: call ElevenLabs Sound Effects API ---
    if (serviceId === 'music') {
      const musicArtifactId = createId();

      const loadingArtifact: PreviewArtifact = {
        id: musicArtifactId,
        serviceId,
        kind: 'audio',
        title: `${localizedDescriptor.title} — ${cleanPrompt.slice(0, 50)}`,
        summary: cleanPrompt,
        createdAt: Date.now(),
        textBody: copy.musicGenerating,
      };

      set((state) => {
        const svc = state.services[serviceId];
        return {
          services: {
            ...state.services,
            [serviceId]: { ...svc, outputs: [loadingArtifact, ...svc.outputs].slice(0, MAX_OUTPUTS_PER_SERVICE) },
          },
          sharedAssets: [loadingArtifact, ...state.sharedAssets].slice(0, 140),
          preview: loadingArtifact,
        };
      });

      if (source === 'chat') {
        const msgId = createId();
        set((state) => ({
          chatMessages: [
            ...state.chatMessages,
            { id: msgId, role: 'assistant' as const, content: copy.musicGenerating, ts: Date.now() },
          ].slice(-MAX_CHAT_ITEMS),
          ...addLogLine(state, 'agent', `${copy.assistantDispatched} trace=${traceId}`),
        }));
      }

      try {
        const res = await fetch('/api/elevenlabs/sound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: cleanPrompt, duration: 22 }),
        });

        const data = await res.json() as { success: boolean; audio?: string; error?: string };

        if (res.ok && data.success && data.audio) {
          const sourceUrl = `data:audio/mpeg;base64,${data.audio}`;
          const readyArtifact: PreviewArtifact = { ...loadingArtifact, sourceUrl, textBody: undefined };

          set((state) => {
            const svc = state.services[serviceId];
            const updatedOutputs = svc.outputs.map((o) => o.id === musicArtifactId ? readyArtifact : o);
            const updatedAssets = state.sharedAssets.map((a) => a.id === musicArtifactId ? readyArtifact : a);
            return {
              services: {
                ...state.services,
                [serviceId]: { ...svc, status: 'ready', queueDepth: Math.max(0, svc.queueDepth - 1), outputs: updatedOutputs },
              },
              sharedAssets: updatedAssets,
              preview: readyArtifact,
              ...addLogLine(state, 'worker', `${descriptor.worker} ${copy.workerCompleted}`),
            };
          });
        } else {
          const errMsg = data.error ?? `Error ${res.status}`;
          set((state) => {
            const svc = state.services[serviceId];
            return {
              services: { ...state.services, [serviceId]: { ...svc, status: 'error', queueDepth: Math.max(0, svc.queueDepth - 1) } },
              ...addLogLine(state, 'system', `music worker error: ${errMsg}`),
            };
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'network error';
        set((state) => {
          const svc = state.services[serviceId];
          return {
            services: { ...state.services, [serviceId]: { ...svc, status: 'error', queueDepth: Math.max(0, svc.queueDepth - 1) } },
            ...addLogLine(state, 'system', `music worker exception: ${msg}`),
          };
        });
      }

      return;
    }

    // --- All other services: build artifact + Claude chat response ---
    const output = buildArtifact(serviceId, cleanPrompt, locale);

    set((state) => {
      const targetState = state.services[serviceId];
      const updatedTarget: ServiceRuntimeState = {
        ...targetState,
        status: 'ready',
        queueDepth: Math.max(0, targetState.queueDepth - 1),
        outputs: [output, ...targetState.outputs].slice(0, MAX_OUTPUTS_PER_SERVICE),
      };

      const nextServices: Record<ServiceId, ServiceRuntimeState> = {
        ...state.services,
        [serviceId]: updatedTarget,
      };

      const bridgedTargets = autoBridgeOutput(nextServices, serviceId, output.id);

      const shouldSyncPreview = nextServices[serviceId].syncPreview;
      const preview = shouldSyncPreview ? output : state.preview;

      let logChain = addLogLine(state, 'worker', `${descriptor.worker} ${copy.workerCompleted}`);

      if (bridgedTargets.length > 0) {
        const bridgeLog: ActivityItem = {
          id: createId(),
          level: 'system',
          message: `${copy.bridgeLabel} ${localizedDescriptor.title} ${copy.outputSharedWith} ${bridgedTargets
            .map((target) => getLocalizedService(target, locale).short)
            .join(', ')}`,
          ts: Date.now(),
        };
        logChain = { activityLog: [...logChain.activityLog, bridgeLog].slice(-MAX_LOG_ITEMS) };
      }

      return {
        services: nextServices,
        sharedAssets: [output, ...state.sharedAssets].slice(0, 140),
        preview,
        ...logChain,
      };
    });

    // --- TTS: fire-and-forget voice for text-based services ---
    if (['game-creation', 'prompt-builder', 'terminal-coding', 'content-writer', 'podcast', 'character', 'event', 'tourism', 'voice-studio'].includes(serviceId)) {
      const voiceText = (output.textBody ?? output.summary).slice(0, 1200);
      fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: voiceText }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json() as { success: boolean; audio?: string };
          if (!data.success || !data.audio) return;
          const audioUrl = `data:audio/mpeg;base64,${data.audio}`;
          set((state) => {
            const svc = state.services[serviceId];
            const updatedOutputs = svc.outputs.map((o) => o.id === output.id ? { ...o, audioUrl } : o);
            const updatedAssets = state.sharedAssets.map((a) => a.id === output.id ? { ...a, audioUrl } : a);
            const newPreview = state.preview?.id === output.id ? { ...state.preview, audioUrl } : state.preview;
            return {
              services: { ...state.services, [serviceId]: { ...svc, outputs: updatedOutputs } },
              sharedAssets: updatedAssets,
              preview: newPreview,
            };
          });
        })
        .catch(() => {});
    }

    if (source === 'chat') {
      const streamingMsgId = createId();
      set((state) => ({
        chatMessages: [
          ...state.chatMessages,
          { id: streamingMsgId, role: 'assistant' as const, content: '', ts: Date.now() },
        ].slice(-MAX_CHAT_ITEMS),
        ...addLogLine(state, 'agent', `${copy.assistantDispatched} trace=${traceId}`),
      }));

      try {
        const history = get().chatMessages;
        const uiMessages = history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m, i) => ({
            id: `m${i}`,
            role: m.role as 'user' | 'assistant',
            parts: [{ type: 'text' as const, text: m.content }],
            metadata: undefined,
          }));

        const res = await fetch('/api/chat/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: uiMessages }),
        });

        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') continue;
              try {
                const event = JSON.parse(raw) as { type: string; delta?: string };
                if (event.type === 'text-delta' && event.delta) {
                  fullText += event.delta;
                  set((state) => ({
                    chatMessages: state.chatMessages.map((m) =>
                      m.id === streamingMsgId ? { ...m, content: fullText } : m,
                    ),
                  }));
                }
              } catch { /* skip malformed lines */ }
            }
          }
        } else {
          set((state) => ({
            chatMessages: state.chatMessages.map((m) =>
              m.id === streamingMsgId ? { ...m, content: copy.assistantFinished + ' (error)' } : m,
            ),
          }));
        }
      } catch {
        set((state) => ({
          chatMessages: state.chatMessages.map((m) =>
            m.id === streamingMsgId ? { ...m, content: copy.assistantFinished + ' (error)' } : m,
          ),
        }));
      }
    }
  };

  const initialCopy = getStoreCopy('ka');

  return {
    locale: 'ka',
    baselineGel: BASELINE_GEL,
    credits: DEFAULT_CREDITS,
    auth: {
      status: 'guest',
      displayName: initialCopy.guestOperator,
      tierLabel: initialCopy.guestTier,
    },
    activeServiceId: 'avatar',
    commandLanguage: 'ka',
    services: initializeServiceState(),
    sharedAssets: [],
    preview: null,
    activityLog: [
      {
        id: createId(),
        level: 'system',
        message: initialCopy.initLog,
        ts: Date.now(),
      },
    ],
    chatMessages: [
      {
        id: createId(),
        role: 'assistant',
        content: initialCopy.initChat,
        ts: Date.now(),
      },
    ],
    pendingInputs: [],
    setLocale: (locale) => {
      set({ locale });
    },
    setAuthSnapshot: (auth) => {
      set({ auth });
    },
    setActiveService: (serviceId) => {
      set((state) => {
        const copy = getStoreCopy(state.locale);
        return {
          activeServiceId: serviceId,
          ...addLogLine(state, 'system', `${copy.focusSwitched} ${getLocalizedService(serviceId, state.locale).title}`),
        };
      });
      syncGlobalServiceSelection(serviceId);
    },
    setCommandLanguage: (language) => {
      set((state) => {
        const copy = getStoreCopy(state.locale);
        return {
          commandLanguage: language,
          ...addLogLine(
            state,
            'system',
            `${copy.commandLanguageSet} ${localizeCommandLanguage(language, state.locale)}`,
          ),
        };
      });
    },
    setServiceDial: (serviceId, key, value) => {
      set((state) => {
        const current = state.services[serviceId];
        return {
          services: {
            ...state.services,
            [serviceId]: {
              ...current,
              [key]: value,
            },
          },
        };
      });
    },
    setExpertSetting: (serviceId, key, value) => {
      set((state) => {
        const current = state.services[serviceId];
        return {
          services: {
            ...state.services,
            [serviceId]: {
              ...current,
              expert: {
                ...current.expert,
                [key]: value,
              },
            },
          },
        };
      });
    },
    setModuleSetting: (serviceId, key, value) => {
      set((state) => {
        const current = state.services[serviceId];
        return {
          services: {
            ...state.services,
            [serviceId]: {
              ...current,
              moduleSettings: {
                ...current.moduleSettings,
                [key]: value,
              },
            },
          },
        };
      });
    },
    toggleServiceFlag: (serviceId, key) => {
      set((state) => {
        const current = state.services[serviceId];
        const nextState: ServiceRuntimeState = {
          ...current,
          [key]: !current[key],
        };

        return {
          services: {
            ...state.services,
            [serviceId]: nextState,
          },
          ...addLogLine(
            state,
            'system',
            `${getLocalizedService(serviceId, state.locale).title} ${key} → ${localizeBooleanState(Boolean(nextState[key]), state.locale)}`,
          ),
        };
      });
    },
    ingestCommandInput: (input) => {
      set((state) => {
        const copy = getStoreCopy(state.locale);
        const normalizedInput: ExternalCommandInput = {
          ...input,
          id: createId(),
          createdAt: Date.now(),
        };

        const artifact = buildInputArtifact(state.activeServiceId, normalizedInput, state.locale);
        const pendingInputs = [...state.pendingInputs, normalizedInput].slice(-MAX_PENDING_INPUTS);

        const result: Partial<OmniDashboardState> = {
          pendingInputs,
          ...addLogLine(state, 'system', `${copy.multimodalAttached} ${normalizedInput.title}`),
        };

        if (artifact) {
          result.sharedAssets = [artifact, ...state.sharedAssets].slice(0, 140);
          if (artifact.kind === 'image') {
            result.preview = artifact;
          }
        }

        return result as OmniDashboardState;
      });
    },
    removePendingInput: (inputId) => {
      set((state) => ({
        pendingInputs: state.pendingInputs.filter((input) => input.id !== inputId),
      }));
    },
    clearPendingInputs: () => {
      set((state) => ({
        pendingInputs: [],
        ...addLogLine(state, 'system', getStoreCopy(state.locale).pendingCleared),
      }));
    },
    runServiceNow: async (serviceId, prompt) => {
      const fallback = OMNI_SERVICE_MAP[serviceId].defaultPrompt;
      await runWorker(serviceId, (prompt ?? fallback).trim(), 'panel');
    },
    sendPrimaryCommand: async (prompt) => {
      const trimmed = prompt.trim();
      const snapshot = get();
      const copy = getStoreCopy(snapshot.locale);
      const pendingInputs = snapshot.pendingInputs;

      if (!trimmed && pendingInputs.length === 0) return;

      const userLine = trimmed || copy.processAttached;
      const language = snapshot.commandLanguage;
      const attachmentDigest = pendingInputs
        .map((input) => {
          const detail = input.textContent
            ? input.textContent.slice(0, 90)
            : input.fileName
              ? `${input.fileName} (${input.size ?? 0} ${copy.byteUnit})`
              : input.title;
          return `- ${input.kind.toUpperCase()}: ${detail}`;
        })
        .join('\n');

      const commandPayload =
        `[language=${localizeCommandLanguage(language, snapshot.locale)}]\n` +
        `${userLine}\n` +
        (attachmentDigest ? `\n${copy.attachedInputs}:\n${attachmentDigest}` : '');

      const routed = routeWorkerService(commandPayload, snapshot.activeServiceId);

      set((state) => ({
        pendingInputs: [],
        activeServiceId: routed,
        ...addChatLine(state, 'user', userLine),
        ...addLogLine(
          state,
          'agent',
          `${getStoreCopy(state.locale).commandReceived} ${localizeCommandLanguage(language, state.locale)}`,
        ),
      }));

      syncGlobalServiceSelection(routed);

      await runWorker(routed, commandPayload, 'chat');
    },
    focusPreview: (assetId) => {
      set((state) => {
        const selected = state.sharedAssets.find((asset) => asset.id === assetId) ?? null;
        if (!selected) {
          return state;
        }
        const copy = getStoreCopy(state.locale);
        return {
          preview: selected,
          ...addLogLine(state, 'system', `${copy.previewFocus} ${selected.title}`),
        };
      });
    },
    bridgeAssetToService: (assetId, targetServiceId) => {
      set((state) => {
        const sourceAsset = state.sharedAssets.find((asset) => asset.id === assetId);
        if (!sourceAsset) {
          return state;
        }

        const copy = getStoreCopy(state.locale);
        const targetState = state.services[targetServiceId];
        return {
          services: {
            ...state.services,
            [targetServiceId]: {
              ...targetState,
              referenceIds: [sourceAsset.id, ...targetState.referenceIds].slice(0, MAX_OUTPUTS_PER_SERVICE),
            },
          },
          ...addLogLine(
            state,
            'system',
            `${copy.manualBridge} ${sourceAsset.title} ${copy.pushedTo} ${getLocalizedService(targetServiceId, state.locale).title}`,
          ),
        };
      });
    },
    clearActivity: () => {
      set((state) => ({
        activityLog: [
          {
            id: createId(),
            level: 'system',
            message: getStoreCopy(state.locale).activityCleared,
            ts: Date.now(),
          },
        ],
      }));
    },
  };
});

export const useOmniStore = useOmniDashboardStore;
