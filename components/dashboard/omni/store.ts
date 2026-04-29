'use client';

import { create } from 'zustand';
import { OMNI_SERVICE_MAP, OMNI_SERVICES } from './services';
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

const SMALL_NUMBER_WORDS: Record<number, string> = {
  0: 'zero',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
};

const LANGUAGE_LABELS: Record<CommandLanguage, string> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
};

const AUTO_BRIDGE_TARGETS: Record<ServiceId, ServiceId[]> = {
  'agent-g': ['business-strategy', 'workflow-automation'],
  'business-strategy': ['executive-ops', 'commerce-pilot'],
  'executive-ops': ['business-strategy', 'analytics-hub'],
  'avatar-studio': ['video-gen', 'image-gen'],
  'image-gen': ['video-gen', 'avatar-studio'],
  'video-gen': ['copy-engine', 'analytics-hub'],
  'voice-synth': ['video-gen', 'avatar-studio'],
  'music-lab': ['video-gen', 'voice-synth'],
  'copy-engine': ['voice-synth', 'avatar-studio'],
  'workflow-automation': ['analytics-hub', 'fulfillment-hq'],
  'analytics-hub': ['executive-ops', 'commerce-pilot'],
  'commerce-pilot': ['business-strategy', 'fulfillment-hq'],
  'fulfillment-hq': ['analytics-hub', 'executive-ops'],
};

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const numberToLabel = (value: number) => (value < 10 ? (SMALL_NUMBER_WORDS[value] ?? `${value}`) : `${value}`);

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
  if (serviceId === 'copy-engine') {
    return { seed: 11, sampling: 54, weights: 67, temperature: 72 };
  }
  if (serviceId === 'voice-synth') {
    return { seed: 38, sampling: 62, weights: 74, temperature: 36 };
  }
  if (serviceId === 'image-gen' || serviceId === 'video-gen') {
    return { seed: 57, sampling: 70, weights: 64, temperature: 48 };
  }
  return { seed: 29, sampling: 60, weights: 58, temperature: 44 };
}

function defaultModuleSettings(serviceId: ServiceId): Record<string, string | number | boolean> {
  if (serviceId === 'voice-synth') {
    return { waveformFocus: 58, denoise: true, phonemeLock: 64 };
  }
  if (serviceId === 'image-gen') {
    return { brush: 34, texture: 72, canvasGrid: true };
  }
  if (serviceId === 'business-strategy') {
    return { horizon: 3, confidence: 74, anomalyScan: true };
  }
  if (serviceId === 'copy-engine') {
    return { cadence: 64, persuasion: 71, markdownMode: true };
  }
  if (serviceId === 'workflow-automation') {
    return { lanes: 4, retries: 2, failover: true };
  }
  return { precision: 61, throughput: 55, safetyLock: true };
}

function initializeServiceState(): Record<ServiceId, ServiceRuntimeState> {
  return OMNI_SERVICES.reduce(
    (acc, service) => {
      acc[service.id] = {
        enabled: true,
        autopilot: service.id === 'agent-g',
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
    { serviceId: 'video-gen', keys: ['video', 'scene', 'teaser', 'cinematic'] },
    { serviceId: 'image-gen', keys: ['image', 'poster', 'visual', 'photo', 'canvas'] },
    { serviceId: 'voice-synth', keys: ['voice', 'narration', 'speech', 'tts'] },
    { serviceId: 'music-lab', keys: ['music', 'soundtrack', 'beat', 'audio bed'] },
    { serviceId: 'copy-engine', keys: ['copy', 'headline', 'script', 'text', 'markdown'] },
    { serviceId: 'analytics-hub', keys: ['analyze', 'analytics', 'metric', 'kpi', 'dashboard'] },
    { serviceId: 'workflow-automation', keys: ['workflow', 'pipeline', 'automation'] },
    { serviceId: 'commerce-pilot', keys: ['commerce', 'offer', 'pricing', 'store'] },
    { serviceId: 'fulfillment-hq', keys: ['ship', 'delivery', 'fulfillment'] },
    { serviceId: 'business-strategy', keys: ['business', 'strategy', 'growth'] },
    { serviceId: 'executive-ops', keys: ['executive', 'board', 'risk'] },
    { serviceId: 'avatar-studio', keys: ['avatar', 'persona', 'portrait'] },
  ];

  const match = rules.find((rule) => rule.keys.some((key) => query.includes(key)));
  return match?.serviceId ?? fallback;
}

function buildArtifact(serviceId: ServiceId, prompt: string): PreviewArtifact {
  const service = OMNI_SERVICE_MAP[serviceId];
  const shortPrompt = prompt.length > 110 ? `${prompt.slice(0, 107)}...` : prompt;
  const common = {
    id: createId(),
    serviceId,
    title: `${service.title} Output`,
    summary: shortPrompt,
    createdAt: Date.now(),
  };

  const kind: PreviewKind = service.previewKind;
  if (kind === 'image') {
    return {
      ...common,
      kind,
      sourceUrl: createTextImage(service.title, service.accent, shortPrompt),
    };
  }

  if (kind === 'text') {
    return {
      ...common,
      kind,
      textBody: `SUMMARY\n${shortPrompt}\n\nNEXT ACTION\n- Validate dependencies\n- Trigger quality gate\n- Export executive report`,
    };
  }

  if (kind === 'audio') {
    return {
      ...common,
      kind,
      textBody: `Audio blueprint generated for: ${shortPrompt}`,
    };
  }

  if (kind === 'workflow') {
    return {
      ...common,
      kind,
      textBody: `Workflow chain staged for ${service.title}.`,
    };
  }

  return {
    ...common,
    kind: 'video',
    textBody: 'Storyboard staged. Real-time render queue synchronized.',
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
): PreviewArtifact | null {
  const kind = previewKindFromInput(input);
  const summary = input.textContent ?? input.fileName ?? input.title;

  if (!summary && !input.sourceUrl) {
    return null;
  }

  return {
    id: createId(),
    serviceId,
    kind,
    title: `Input · ${input.title}`,
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
    const descriptor = OMNI_SERVICE_MAP[serviceId];
    const traceId = createId();

    set((state) => {
      const current = state.services[serviceId];
      const updatedService: ServiceRuntimeState = {
        ...current,
        status: 'running',
        queueDepth: current.queueDepth + 1,
        lastPrompt: prompt,
      };
      return {
        services: {
          ...state.services,
          [serviceId]: updatedService,
        },
        ...addLogLine(state, 'api', `POST /api/agents/orchestrate worker=${descriptor.worker} trace=${traceId}`),
      };
    });

    await delay(220);

    set((state) => ({
      ...addLogLine(
        state,
        'agent',
        `PrimaryAgent routing complete: ${descriptor.title} selected from ${state.activeServiceId} context`,
      ),
    }));

    await delay(260);

    const output = buildArtifact(serviceId, prompt);

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

      let logChain = addLogLine(state, 'worker', `${descriptor.worker} completed render package in live mode`);

      if (bridgedTargets.length > 0) {
        const bridgeLog: ActivityItem = {
          id: createId(),
          level: 'system',
          message: `Universal bridge: ${descriptor.title} output shared with ${bridgedTargets.map((target) => OMNI_SERVICE_MAP[target].short).join(', ')}`,
          ts: Date.now(),
        };

        logChain = {
          activityLog: [...logChain.activityLog, bridgeLog].slice(-MAX_LOG_ITEMS),
        };
      }

      return {
        services: nextServices,
        sharedAssets: [output, ...state.sharedAssets].slice(0, 140),
        preview,
        ...logChain,
      };
    });

    await delay(120);

    if (source === 'chat') {
      set((state) => {
        const activeCount = OMNI_SERVICES.filter((service) => state.services[service.id].enabled).length;
        const runningCount = OMNI_SERVICES.filter((service) => state.services[service.id].status === 'running').length;
        const response =
          `Worker ${descriptor.worker} finished. ${descriptor.title} output is now live in the preview pane. ` +
          `${numberToLabel(activeCount)} modules are active and ${numberToLabel(runningCount)} jobs are running.`;

        return {
          ...addChatLine(state, 'assistant', response),
          ...addLogLine(state, 'agent', `Assistant response dispatched for trace=${traceId}`),
        };
      });
    }
  };

  return {
    locale: 'ka',
    baselineGel: BASELINE_GEL,
    credits: DEFAULT_CREDITS,
    auth: {
      status: 'guest',
      displayName: 'Guest Operator',
      tierLabel: 'Guest',
    },
    activeServiceId: 'agent-g',
    commandLanguage: 'ka',
    services: initializeServiceState(),
    sharedAssets: [],
    preview: null,
    activityLog: [
      {
        id: createId(),
        level: 'system',
        message: 'Omni-Dashboard initialized. One-window command center online.',
        ts: Date.now(),
      },
    ],
    chatMessages: [
      {
        id: createId(),
        role: 'assistant',
        content:
          'Primary Agent online. Describe a goal and I will route worker agents while keeping every module synchronized.',
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
      set((state) => ({
        activeServiceId: serviceId,
        ...addLogLine(state, 'system', `Focus switched to ${OMNI_SERVICE_MAP[serviceId].title}`),
      }));
    },
    setCommandLanguage: (language) => {
      set((state) => ({
        commandLanguage: language,
        ...addLogLine(state, 'system', `Command language set to ${LANGUAGE_LABELS[language]}`),
      }));
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
            `${OMNI_SERVICE_MAP[serviceId].title} ${key} set to ${nextState[key] ? 'enabled' : 'disabled'}`,
          ),
        };
      });
    },
    ingestCommandInput: (input) => {
      set((state) => {
        const normalizedInput: ExternalCommandInput = {
          ...input,
          id: createId(),
          createdAt: Date.now(),
        };

        const artifact = buildInputArtifact(state.activeServiceId, normalizedInput);
        const pendingInputs = [...state.pendingInputs, normalizedInput].slice(-MAX_PENDING_INPUTS);

        const result: Partial<OmniDashboardState> = {
          pendingInputs,
          ...addLogLine(state, 'system', `Multimodal input attached: ${normalizedInput.title}`),
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
        ...addLogLine(state, 'system', 'Pending multimodal inputs cleared.'),
      }));
    },
    runServiceNow: async (serviceId, prompt) => {
      const fallback = OMNI_SERVICE_MAP[serviceId].defaultPrompt;
      await runWorker(serviceId, (prompt ?? fallback).trim(), 'panel');
    },
    sendPrimaryCommand: async (prompt) => {
      const trimmed = prompt.trim();
      const snapshot = get();
      const pendingInputs = snapshot.pendingInputs;

      if (!trimmed && pendingInputs.length === 0) return;

      const userLine = trimmed || 'Process attached multimodal inputs.';
      const language = snapshot.commandLanguage;
      const attachmentDigest = pendingInputs
        .map((input) => {
          const detail = input.textContent
            ? input.textContent.slice(0, 90)
            : input.fileName
              ? `${input.fileName} (${input.size ?? 0} bytes)`
              : input.title;
          return `- ${input.kind.toUpperCase()}: ${detail}`;
        })
        .join('\n');

      const commandPayload =
        `[language=${LANGUAGE_LABELS[language]}]\n` +
        `${userLine}\n` +
        (attachmentDigest ? `\nAttached Inputs:\n${attachmentDigest}` : '');

      const routed = routeWorkerService(commandPayload, snapshot.activeServiceId);

      set((state) => ({
        pendingInputs: [],
        activeServiceId: routed,
        ...addChatLine(state, 'user', userLine),
        ...addLogLine(state, 'agent', `PrimaryAgent received command in ${LANGUAGE_LABELS[language]}`),
      }));

      await runWorker(routed, commandPayload, 'chat');
    },
    focusPreview: (assetId) => {
      set((state) => {
        const selected = state.sharedAssets.find((asset) => asset.id === assetId) ?? null;
        if (!selected) {
          return state;
        }
        return {
          preview: selected,
          ...addLogLine(state, 'system', `Preview focus switched to ${selected.title}`),
        };
      });
    },
    bridgeAssetToService: (assetId, targetServiceId) => {
      set((state) => {
        const sourceAsset = state.sharedAssets.find((asset) => asset.id === assetId);
        if (!sourceAsset) {
          return state;
        }

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
            `Manual bridge: ${sourceAsset.title} pushed to ${OMNI_SERVICE_MAP[targetServiceId].title}`,
          ),
        };
      });
    },
    clearActivity: () => {
      set(() => ({
        activityLog: [
          {
            id: createId(),
            level: 'system',
            message: 'Activity log cleared by operator.',
            ts: Date.now(),
          },
        ],
      }));
    },
  };
});

export const useOmniStore = useOmniDashboardStore;
