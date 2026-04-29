'use client';

import { create } from 'zustand';
import { OMNI_SERVICE_MAP, OMNI_SERVICES } from './services';
import type {
  ActivityLevel,
  ActivityItem,
  AuthSnapshot,
  ChatMessage,
  PreviewArtifact,
  PreviewKind,
  ServiceId,
  ServiceRuntimeState,
} from './types';

const MAX_LOG_ITEMS = 180;
const MAX_CHAT_ITEMS = 90;
const MAX_OUTPUTS_PER_SERVICE = 10;
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

function initializeServiceState(): Record<ServiceId, ServiceRuntimeState> {
  return OMNI_SERVICES.reduce(
    (acc, service) => {
      acc[service.id] = {
        enabled: true,
        autopilot: service.id === 'agent-g',
        syncPreview: true,
        fidelity: 74,
        intensity: 58,
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
    { serviceId: 'image-gen', keys: ['image', 'poster', 'visual', 'photo'] },
    { serviceId: 'voice-synth', keys: ['voice', 'narration', 'speech', 'tts'] },
    { serviceId: 'music-lab', keys: ['music', 'soundtrack', 'beat', 'audio bed'] },
    { serviceId: 'copy-engine', keys: ['copy', 'headline', 'script', 'text'] },
    { serviceId: 'analytics-hub', keys: ['analyze', 'analytics', 'metric', 'kpi'] },
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

export interface OmniDashboardState {
  locale: string;
  baselineGel: number;
  credits: number;
  auth: AuthSnapshot;
  activeServiceId: ServiceId;
  services: Record<ServiceId, ServiceRuntimeState>;
  sharedAssets: PreviewArtifact[];
  preview: PreviewArtifact | null;
  activityLog: ActivityItem[];
  chatMessages: ChatMessage[];
  setLocale: (locale: string) => void;
  setAuthSnapshot: (auth: AuthSnapshot) => void;
  setActiveService: (serviceId: ServiceId) => void;
  setServiceDial: (serviceId: ServiceId, key: 'fidelity' | 'intensity', value: number) => void;
  toggleServiceFlag: (serviceId: ServiceId, key: 'enabled' | 'autopilot' | 'syncPreview') => void;
  runServiceNow: (serviceId: ServiceId, prompt?: string) => Promise<void>;
  sendPrimaryCommand: (prompt: string) => Promise<void>;
  focusPreview: (assetId: string) => void;
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

      if (serviceId === 'image-gen') {
        const videoState = nextServices['video-gen'];
        nextServices['video-gen'] = {
          ...videoState,
          referenceIds: [output.id, ...videoState.referenceIds].slice(0, MAX_OUTPUTS_PER_SERVICE),
        };
      }

      if (serviceId === 'voice-synth') {
        const videoState = nextServices['video-gen'];
        nextServices['video-gen'] = {
          ...videoState,
          referenceIds: [output.id, ...videoState.referenceIds].slice(0, MAX_OUTPUTS_PER_SERVICE),
        };
      }

      const shouldSyncPreview = nextServices[serviceId].syncPreview;
      const preview = shouldSyncPreview ? output : state.preview;

      const logBase = addLogLine(state, 'worker', `${descriptor.worker} completed render package in live mode`);

      const logWithBridge =
        serviceId === 'image-gen' || serviceId === 'voice-synth'
          ? {
              activityLog: [...logBase.activityLog, {
                id: createId(),
                level: 'system' as const,
                message: `Inter-service bridge: ${descriptor.title} output is now referenced by Video Generator`,
                ts: Date.now(),
              }].slice(-MAX_LOG_ITEMS),
            }
          : logBase;

      return {
        services: nextServices,
        sharedAssets: [output, ...state.sharedAssets].slice(0, 120),
        preview,
        ...logWithBridge,
      };
    });

    await delay(120);

    if (source === 'chat') {
      set((state) => {
        const activeCount = OMNI_SERVICES.filter((service) => state.services[service.id].enabled).length;
        const runningCount = OMNI_SERVICES.filter((service) => state.services[service.id].status === 'running').length;
        const response = `Worker ${descriptor.worker} finished. ${descriptor.title} output is now live in the preview pane. ` +
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
    runServiceNow: async (serviceId, prompt) => {
      const fallback = OMNI_SERVICE_MAP[serviceId].defaultPrompt;
      await runWorker(serviceId, (prompt ?? fallback).trim(), 'panel');
    },
    sendPrimaryCommand: async (prompt) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;

      set((state) => ({
        ...addChatLine(state, 'user', trimmed),
        ...addLogLine(state, 'agent', `PrimaryAgent received command: "${trimmed.slice(0, 80)}"`),
      }));

      const state = get();
      const routed = routeWorkerService(trimmed, state.activeServiceId);
      await runWorker(routed, trimmed, 'chat');
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
