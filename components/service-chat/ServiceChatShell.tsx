'use client';

/**
 * components/service-chat/ServiceChatShell.tsx
 * ===============================================
 * THE UNIVERSAL SERVICE CHATBOT SHELL
 * 
 * This is the main wrapper that turns any service into a
 * full functional service chatbot. It composes:
 * 
 * - ServiceChatHeader (identity + controls)
 * - ServiceHamburgerMenu (service-specific menu)
 * - ServiceToolPanel (service-specific settings)
 * - ServiceWelcome (clean welcome screen)
 * - ServiceMessageList (premium message thread)
 * - ServicePreviewPanel (output previews)
 * - ServiceTransferBar (cross-service continuation)
 * - ServiceComposer (premium input)
 * 
 * Every service uses this shell with its own config.
 * Same premium design language, different functionality.
 */

import { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ServiceChatConfig, ServiceChatMessage, AgentMode, PreviewItem, PreviewType, PreviewLegs, PreviewLegStatus } from './types';
import { serviceChatReducer, createInitialState } from '@/lib/service-chat/reducer';
import { extractMediaArtifact, mediaKindForService, type MediaKind } from '@/lib/media/extractArtifact';

import { ServiceChatHeader } from './ServiceChatHeader';
import { ServiceHamburgerMenu } from './ServiceHamburgerMenu';
import { ServiceToolPanel } from './ServiceToolPanel';
import { ServiceWelcome } from './ServiceWelcome';
import { ServiceMessageList } from './ServiceMessageList';
import { ServicePreviewPanel } from './ServicePreviewPanel';
import { ServiceTransferBar } from './ServiceTransferBar';
import { ServiceComposer } from './ServiceComposer';
import { ServiceStatusBar } from './ServiceStatusBar';
import { ServiceRuntimeStatusPanel, type RuntimeStatusData, type RuntimeServiceStatus } from './ServiceRuntimeStatusPanel';
import WorkflowBuilder from '@/components/workflow/WorkflowBuilder';

interface Props {
  config: ServiceChatConfig;
  language?: string;
  className?: string;
}

const SHELL_COPY = {
  ka: {
    genericError: 'რაღაც ხარვეზი მოხდა. სცადე ხელახლა.',
    chatMode: 'ჩატის რეჟიმი',
    activated: 'აქტიურდა',
    checkingStatus: 'ვამოწმებ API key-ებს და ბალანსს...',
    statusLabel: 'სისტემის სტატუსი',
    keysLabel: 'API key-ები',
    balanceLabel: 'ბალანსი',
    unavailableLabel: 'მიუწვდომელია',
    statusError: 'სტატუსის მიღება ვერ მოხერხდა.',
  },
  en: {
    genericError: 'Something went wrong. Please try again.',
    chatMode: 'Chat Mode',
    activated: 'activated',
    checkingStatus: 'Checking API key status and balance...',
    statusLabel: 'System status',
    keysLabel: 'API keys',
    balanceLabel: 'Balance',
    unavailableLabel: 'unavailable',
    statusError: 'Unable to load status right now.',
  },
  ru: {
    genericError: 'Что-то пошло не так. Попробуйте снова.',
    chatMode: 'Режим чата',
    activated: 'активирован',
    checkingStatus: 'Проверяю API-ключи и баланс...',
    statusLabel: 'Статус системы',
    keysLabel: 'API-ключи',
    balanceLabel: 'Баланс',
    unavailableLabel: 'недоступно',
    statusError: 'Не удалось получить статус.',
  },
} as const;

type AppStatusPayload = {
  keys?: {
    status?: 'ready' | 'partial' | 'missing';
    configured?: number;
    total?: number;
    providers?: Array<{ id?: string; configured?: boolean }>;
  };
  billing?: {
    balance?: number | null;
    authenticated?: boolean;
    plan?: string | null;
    resetAt?: string | null;
  };
  currentService?: AppServiceStatusPayload | null;
  services?: AppServiceStatusPayload[];
};

type AppServiceStatusPayload = {
  slug?: string;
  name?: string;
  status?: 'ready' | 'partial' | 'missing';
  configured?: number;
  total?: number;
  providers?: Array<{ id?: string; configured?: boolean }>;
};

type OrchestrateResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  responseType?: 'text' | 'image' | 'video' | 'audio' | 'analysis' | 'action_suggestions';
  assetUrl?: string | null;
  predictionId?: string;
  predictionStatus?: string;
  metadata?: {
    model?: string;
    agentId?: string;
    [key: string]: unknown;
  };
};

function normalizeSelectedOptions(selectedOptions: Record<string, unknown>): Record<string, string> | undefined {
  const normalized = Object.fromEntries(
    Object.entries(selectedOptions).flatMap(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return [[key, String(value)]];
      }

      return [];
    })
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function responseTypeToPreviewType(responseType: OrchestrateResponse['responseType']): PreviewType {
  switch (responseType) {
    case 'video': return 'video';
    case 'audio': return 'audio';
    case 'image': return 'image';
    case 'analysis': return 'text';
    case 'action_suggestions':
    case 'text':
    default: return 'text';
  }
}

function isGenerativeService(slug: string): boolean {
  return ['avatar', 'image', 'photo', 'video', 'editing', 'music', 'visual-intel', 'visual-ai'].includes(slug);
}

/**
 * Map composite metadata (from the music-video pipeline orchestrator) into the
 * PreviewLegs shape the panel renders as a staggered telemetry feed.
 *
 * Handles both the initial response (metadata.compositePlan exists with
 * leg refs but no per-leg poll status) and subsequent poll updates
 * (metadata.music/.video carry per-leg status). Returns undefined when the
 * response isn't composite at all.
 */
function legsFromComposite(metadata: Record<string, unknown> | undefined): PreviewLegs | undefined {
  if (!metadata || !(metadata as Record<string, unknown>).composite) return undefined;

  const plan = (metadata as Record<string, unknown>).compositePlan as
    | { lyrics?: string | null; musicPredictionId?: string | null; videoTaskRef?: string | null }
    | undefined;
  const music = (metadata as Record<string, unknown>).music as
    | { status?: PreviewLegStatus; url?: string | null; error?: string }
    | undefined;
  const video = (metadata as Record<string, unknown>).video as
    | { status?: PreviewLegStatus; url?: string | null; error?: string }
    | undefined;

  const legs: PreviewLegs = {};

  if (plan?.lyrics) {
    legs.lyrics = {
      label: 'Script Agent',
      status: 'ready',
      detail: 'Lyrics composed',
    };
  } else if (plan && 'lyrics' in plan) {
    legs.lyrics = { label: 'Script Agent', status: 'skipped' };
  }

  // music leg status: prefer the per-leg poll info; fall back to initial plan.
  if (music) {
    legs.music = {
      label: 'Audio Agent',
      status: music.status ?? 'pending',
      detail: music.status === 'ready' ? 'Beat ready' : 'Dropping boom-bap drums...',
      error: music.error,
    };
  } else if (plan?.musicPredictionId) {
    legs.music = { label: 'Audio Agent', status: 'pending', detail: 'Dropping boom-bap drums...' };
  } else if (plan && 'musicPredictionId' in plan) {
    legs.music = { label: 'Audio Agent', status: 'skipped' };
  }

  if (video) {
    legs.video = {
      label: 'Cinematic Agent',
      status: video.status ?? 'pending',
      detail: video.status === 'ready' ? 'Clip rendered' : 'Compositing cinematic frames...',
      error: video.error,
    };
  } else if (plan?.videoTaskRef) {
    legs.video = { label: 'Cinematic Agent', status: 'pending', detail: 'Compositing cinematic frames...' };
  } else if (plan && 'videoTaskRef' in plan) {
    legs.video = { label: 'Cinematic Agent', status: 'skipped' };
  }

  return Object.keys(legs).length > 0 ? legs : undefined;
}

function buildPreviewItem(id: string, response: OrchestrateResponse, hint: MediaKind): PreviewItem | null {
  const artifact = extractMediaArtifact(
    response.assetUrl ?? response.metadata,
    response.responseType === 'analysis' ? 'analysis' : hint,
  );

  const previewType = responseTypeToPreviewType(response.responseType);
  const legs = legsFromComposite(response.metadata);
  const compositeVideoUrl = legs?.video?.status === 'ready'
    ? (response.metadata?.video as { url?: string } | undefined)?.url ?? undefined
    : undefined;
  const compositeMusicUrl = legs?.music?.status === 'ready'
    ? (response.metadata?.music as { url?: string } | undefined)?.url ?? undefined
    : undefined;

  // If the upstream provided a usable URL, render the corresponding media card.
  if (artifact.url || response.assetUrl || compositeMusicUrl || compositeVideoUrl) {
    const primaryUrl = compositeMusicUrl ?? artifact.url ?? response.assetUrl ?? compositeVideoUrl ?? undefined;
    const secondaryUrl = compositeMusicUrl && compositeVideoUrl ? compositeVideoUrl : undefined;
    return {
      id,
      type: previewType === 'text' ? 'image' : previewType,
      status: 'ready',
      url: primaryUrl,
      secondaryUrl,
      title: response.message,
      thumbnail: previewType === 'image' ? primaryUrl : undefined,
      predictionId: response.predictionId,
      ...(legs ? { legs } : {}),
    };
  }

  // Text-style responses (analysis output, free-form completions).
  if (response.responseType === 'analysis' && response.message) {
    return {
      id,
      type: 'text',
      status: 'ready',
      content: response.message,
      title: 'Analysis',
      predictionId: response.predictionId,
      ...(legs ? { legs } : {}),
    };
  }

  // Composite responses with no asset yet but with legs telemetry — render
  // a pending card carrying the per-leg feed so the user sees motion.
  if (legs) {
    return {
      id,
      type: previewType === 'text' ? 'audio' : previewType,
      status: 'running',
      title: response.message,
      predictionId: response.predictionId,
      legs,
    };
  }

  return null;
}

async function pollOrchestratedResult(
  predictionId: string,
  serviceContext: string,
  message: string,
  signal?: AbortSignal,
): Promise<OrchestrateResponse> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const pollRes = await fetch('/api/chat/orchestrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        serviceContext,
        predictionId,
      }),
      signal,
    });

    const pollData = await pollRes.json() as OrchestrateResponse;
    if (!pollRes.ok) {
      throw new Error(pollData.error || pollData.message || 'Polling failed');
    }

    if (pollData.predictionStatus === 'succeeded') {
      return pollData;
    }

    if (pollData.predictionStatus === 'failed' || pollData.predictionStatus === 'error') {
      throw new Error(pollData.message || 'Generation failed');
    }
  }

  throw new Error('Generation timed out');
}

export default function ServiceChatShell({ config, language = 'en', className = '' }: Props) {
  const router = useRouter();
  const activeLanguage = language === 'ka' || language === 'ru' ? language : 'en';
  const shellCopy = SHELL_COPY[activeLanguage];

  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [state, dispatch] = useReducer(
    serviceChatReducer,
    createInitialState(config.slug, config.agentId, language)
  );

  const {
    messages, inputText, isLoading, isStreaming: _isStreaming, agentMode,
    showHamburger, showToolPanel, activeToolPanel,
    selectedOptions, attachments, previews, isRecording,
  } = state;

  const [runtimeStatusOpen, setRuntimeStatusOpen] = useState(false);
  const [runtimeStatusLoading, setRuntimeStatusLoading] = useState(false);
  const [runtimeStatusError, setRuntimeStatusError] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusData | null>(null);

  const hasMessages = messages.length > 0;
  const hasResults = previews.length > 0 || messages.some((m) => m.type === 'result');

  // ─── Speech Recognition Init ────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) dispatch({ type: 'SET_INPUT', text: t });
    };
    rec.onend = () => dispatch({ type: 'SET_RECORDING', value: false });
    recognitionRef.current = rec;
  }, []);

  // ─── Send Message ───────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || inputText).trim();
    if (!text || isLoading) return;

    // User message
    const userMsg: ServiceChatMessage = {
      id: `u_${Date.now()}`,
      type: 'user',
      role: 'user',
      text,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    };
    dispatch({ type: 'ADD_MESSAGE', message: userMsg });
    dispatch({ type: 'SET_INPUT', text: '' });
    dispatch({ type: 'CLEAR_ATTACHMENTS' });
    dispatch({ type: 'SET_LOADING', value: true });

    const generative = isGenerativeService(config.slug);
    const previewId = `preview_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const hint: MediaKind = mediaKindForService(config.slug);

    if (generative) {
      const previewType: PreviewType =
        hint === 'image' ? 'image'
        : hint === 'video' ? 'video'
        : hint === 'audio' ? 'audio'
        : 'text';
      dispatch({
        type: 'UPSERT_PREVIEW',
        preview: { id: previewId, type: previewType, status: 'pending', title: text.slice(0, 80) },
      });
    }

    try {
      abortRef.current = new AbortController();

      const history = messages
        .filter((message): message is ServiceChatMessage & { role: 'user' | 'assistant' } =>
          message.role === 'user' || message.role === 'assistant'
        )
        .slice(-8)
        .map((message) => ({ role: message.role, content: message.text }));

      const body = {
        message: text,
        serviceContext: config.slug,
        agentId: config.agentId,
        locale: language,
        history,
        selectedOptions: normalizeSelectedOptions(selectedOptions),
        serviceId: config.slug,
        metadata: {
          agentMode,
        },
      };

      const res = await fetch('/api/chat/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      const response = await res.json() as OrchestrateResponse;

      if (!res.ok || response.success === false) {
        throw new Error(response.error || response.message || shellCopy.genericError);
      }

      const assistantMessage: ServiceChatMessage = {
        id: `a_${Date.now()}`,
        type: 'assistant',
        role: 'assistant',
        text: response.message || shellCopy.genericError,
        timestamp: Date.now(),
        agentId: typeof response.metadata?.agentId === 'string' ? response.metadata.agentId : config.agentId,
        model: typeof response.metadata?.model === 'string' ? response.metadata.model : undefined,
      };
      dispatch({ type: 'ADD_MESSAGE', message: assistantMessage });

      // Upgrade the pending preview card with whatever the first response carries
      // (sync URL or assetUrl). If we only get a predictionId, keep it in `running`
      // and let the poller upgrade it when the upstream finishes.
      const preview = buildPreviewItem(previewId, response, hint);
      if (preview) {
        dispatch({ type: 'UPSERT_PREVIEW', preview });
      } else if (generative) {
        dispatch({
          type: 'UPDATE_PREVIEW',
          id: previewId,
          updates: { status: 'running', predictionId: response.predictionId },
        });
      }

      if (response.predictionId && response.predictionStatus !== 'succeeded') {
        const completedResponse = await pollOrchestratedResult(
          response.predictionId,
          config.slug,
          text,
          abortRef.current.signal,
        );

        const completedMessage: ServiceChatMessage = {
          id: `a_${Date.now()}_complete`,
          type: 'assistant',
          role: 'assistant',
          text: completedResponse.message || response.message || shellCopy.genericError,
          timestamp: Date.now(),
          agentId: typeof completedResponse.metadata?.agentId === 'string'
            ? completedResponse.metadata.agentId
            : assistantMessage.agentId,
          model: typeof completedResponse.metadata?.model === 'string'
            ? completedResponse.metadata.model
            : assistantMessage.model,
        };
        dispatch({ type: 'ADD_MESSAGE', message: completedMessage });

        const completedPreview = buildPreviewItem(previewId, completedResponse, hint);
        if (completedPreview) {
          dispatch({ type: 'UPSERT_PREVIEW', preview: completedPreview });
        } else if (generative) {
          dispatch({
            type: 'UPDATE_PREVIEW',
            id: previewId,
            updates: { status: 'failed', errorMessage: completedResponse.message || shellCopy.genericError },
          });
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Keep prior messages intact when the user stops an in-flight request.
        if (generative) {
          dispatch({ type: 'UPDATE_PREVIEW', id: previewId, updates: { status: 'failed', errorMessage: 'Cancelled' } });
        }
      } else {
        if (generative) {
          dispatch({
            type: 'UPDATE_PREVIEW',
            id: previewId,
            updates: {
              status: 'failed',
              errorMessage: err instanceof Error ? err.message : shellCopy.genericError,
            },
          });
        }
        dispatch({
          type: 'ADD_MESSAGE',
          message: {
            id: `a_${Date.now()}_error`,
            text: shellCopy.genericError,
            type: 'error',
            role: 'assistant',
            timestamp: Date.now(),
          },
        });
      }
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
      abortRef.current = null;
    }
  }, [inputText, isLoading, messages, config, agentMode, selectedOptions, language, shellCopy.genericError]);

  const loadRuntimeStatus = useCallback(async () => {
    setRuntimeStatusLoading(true);
    setRuntimeStatusError(null);

    try {
      const res = await fetch(`/api/app/status?service=${encodeURIComponent(config.slug)}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const payload = await res.json() as AppStatusPayload;

      const parseServiceStatus = (value: AppServiceStatusPayload | null | undefined): RuntimeServiceStatus | null => {
        if (!value || typeof value.slug !== 'string' || typeof value.name !== 'string') {
          return null;
        }

        const configured = typeof value.configured === 'number' ? value.configured : 0;
        const total = typeof value.total === 'number' ? value.total : 0;
        const status = value.status === 'ready' || value.status === 'partial' || value.status === 'missing'
          ? value.status
          : configured <= 0
            ? 'missing'
            : configured >= total
              ? 'ready'
              : 'partial';

        const providers = Array.isArray(value.providers)
          ? value.providers
            .filter((provider): provider is { id: string; configured: boolean } => (
              Boolean(provider)
              && typeof provider?.id === 'string'
              && typeof provider?.configured === 'boolean'
            ))
          : [];

        return {
          slug: value.slug,
          name: value.name,
          status,
          configured,
          total,
          providers,
        };
      };

      const configured = typeof payload.keys?.configured === 'number' ? payload.keys.configured : 0;
      const total = typeof payload.keys?.total === 'number' ? payload.keys.total : 0;
      const status = payload.keys?.status === 'ready' || payload.keys?.status === 'partial' || payload.keys?.status === 'missing'
        ? payload.keys.status
        : configured <= 0
          ? 'missing'
          : configured >= total
            ? 'ready'
            : 'partial';

      const providers = Array.isArray(payload.keys?.providers)
        ? payload.keys.providers
          .filter((provider): provider is { id: string; configured: boolean } => (
            Boolean(provider)
            && typeof provider?.id === 'string'
            && typeof provider?.configured === 'boolean'
          ))
        : [];

      const balance = typeof payload.billing?.balance === 'number'
        ? Math.max(0, Math.round(payload.billing.balance))
        : null;

      const plan = typeof payload.billing?.plan === 'string' ? payload.billing.plan : null;
      const resetAt = typeof payload.billing?.resetAt === 'string' ? payload.billing.resetAt : null;
      const currentService = parseServiceStatus(payload.currentService);
      const services = Array.isArray(payload.services)
        ? payload.services
          .map((service) => parseServiceStatus(service))
          .filter((service): service is RuntimeServiceStatus => Boolean(service))
        : [];

      setRuntimeStatus({
        keys: {
          status,
          configured,
          total,
          providers,
        },
        currentService,
        services,
        billing: {
          authenticated: Boolean(payload.billing?.authenticated),
          balance,
          plan,
          resetAt,
        },
      });
    } catch {
      setRuntimeStatusError(shellCopy.statusError);
    } finally {
      setRuntimeStatusLoading(false);
    }
  }, [shellCopy.statusError, config.slug]);

  const showRuntimeStatus = useCallback(() => {
    setRuntimeStatusOpen(true);
    void loadRuntimeStatus();
  }, [loadRuntimeStatus]);

  // ─── Stop Streaming ─────────────────────────────────────────
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ─── Toggle Voice ───────────────────────────────────────────
  const toggleRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (isRecording) {
      rec.stop();
      dispatch({ type: 'SET_RECORDING', value: false });
    } else {
      rec.lang = language === 'ka' ? 'ka-GE' : language === 'ru' ? 'ru-RU' : 'en-US';
      rec.start();
      dispatch({ type: 'SET_RECORDING', value: true });
    }
  }, [isRecording, language]);

  // ─── New Session ────────────────────────────────────────────
  const newSession = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
    dispatch({ type: 'SET_INPUT', text: '' });
    dispatch({ type: 'CLEAR_ATTACHMENTS' });
    dispatch({ type: 'CLEAR_PREVIEWS' });
  }, []);

  // ─── Toggle Agent Mode ──────────────────────────────────────
  const toggleAgentMode = useCallback(() => {
    const newMode: AgentMode = agentMode === 'chat' ? 'agent' : 'chat';
    dispatch({ type: 'SET_AGENT_MODE', mode: newMode });

    // System message announcing mode change
    const label = newMode === 'agent'
      ? (config.agentModeLabel[(language || 'en') as 'en' | 'ka' | 'ru'] || config.agentModeLabel.en)
      : shellCopy.chatMode;

    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: `sys_${Date.now()}`,
        type: 'system',
        role: 'system',
        text: `${label} ${shellCopy.activated}`,
        timestamp: Date.now(),
      },
    });
  }, [agentMode, config, language, shellCopy.chatMode, shellCopy.activated]);

  // ─── Handle Transfer ────────────────────────────────────────
  const handleTransfer = useCallback((targetService: string) => {
    router.push(`/${activeLanguage}/services/${targetService}`);
  }, [router, activeLanguage]);

  // ─── Handle Quick Action ────────────────────────────────────
  const handleAction = useCallback((action: string) => {
    if (action === 'new-session') {
      newSession();
      return;
    }
    if (action === 'service-status') {
      void showRuntimeStatus();
      return;
    }
    if (action.startsWith('transfer-')) {
      const target = action.replace('transfer-', '');
      handleTransfer(target);
      return;
    }
    // Convert action to a chat message as user intent
    const actionLabel = config.quickActions.find((a) => a.action === action);
    if (actionLabel) {
      const lang = (language || 'en') as 'en' | 'ka' | 'ru';
      sendMessage(actionLabel.label[lang] || actionLabel.label.en);
    } else {
      sendMessage(action);
    }
  }, [newSession, config.quickActions, language, sendMessage, handleTransfer, showRuntimeStatus]);

  // ─── Handle Suggestion Click ────────────────────────────────
  const handleSuggestionClick = useCallback((text: string) => {
    dispatch({ type: 'SET_INPUT', text });
  }, []);

  return (
    <div
      className={`relative flex flex-col h-full overflow-hidden ${className}`}
      style={{
        background: 'var(--color-bg)',
      }}
    >
      {/* Subtle ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 30% at 50% 0%, ${config.accentColor}04 0%, transparent 60%)` }} />

      {/* Header */}
      <ServiceChatHeader
        config={config}
        agentMode={agentMode}
        language={language}
        showHamburger={showHamburger}
        onToggleHamburger={() => dispatch({ type: 'TOGGLE_HAMBURGER' })}
        onToggleAgentMode={toggleAgentMode}
        onNewSession={newSession}
        onToggleToolPanel={() => dispatch({ type: 'TOGGLE_TOOL_PANEL' })}
      />

      {/* Tool Panel */}
      <ServiceToolPanel
        config={config}
        isOpen={showToolPanel}
        activePanel={activeToolPanel}
        language={language}
        selectedOptions={selectedOptions}
        onSetOption={(key, val) => dispatch({ type: 'SET_OPTION', key, value: val })}
        onClose={() => dispatch({ type: 'TOGGLE_TOOL_PANEL' })}
      />

      {/* Status Bar — connection/capability indicator */}
      <ServiceStatusBar
        config={config}
        language={language}
        isLoading={isLoading}
        agentMode={agentMode}
        selectedOptions={selectedOptions}
        onOpenRuntimeStatus={showRuntimeStatus}
      />

      <ServiceRuntimeStatusPanel
        language={language}
        isOpen={runtimeStatusOpen}
        isLoading={runtimeStatusLoading}
        error={runtimeStatusError}
        status={runtimeStatus}
        onRefresh={() => {
          void loadRuntimeStatus();
        }}
        onClose={() => setRuntimeStatusOpen(false)}
      />

      {/* Main Content Area — clean, breathable */}
      {config.slug === 'workflow' ? (
        <div className="flex-1 overflow-hidden">
          <WorkflowBuilder />
        </div>
      ) : !hasMessages ? (
        <ServiceWelcome
          config={config}
          agentMode={agentMode}
          language={language}
          onAction={handleAction}
        />
      ) : (
        <ServiceMessageList
          config={config}
          messages={messages}
          isLoading={isLoading}
          language={language}
          onSuggestionClick={handleSuggestionClick}
        />
      )}

      {/* Preview Panel */}
      <ServicePreviewPanel
        config={config}
        previews={previews}
        language={language}
        onClearPreviews={() => dispatch({ type: 'CLEAR_PREVIEWS' })}
      />

      {/* Transfer Bar */}
      <ServiceTransferBar
        config={config}
        language={language}
        onTransfer={handleTransfer}
        show={hasResults}
      />

      {/* Composer */}
      <ServiceComposer
        config={config}
        value={inputText}
        agentMode={agentMode}
        language={language}
        isLoading={isLoading}
        isRecording={isRecording}
        attachments={attachments}
        onChange={(text) => dispatch({ type: 'SET_INPUT', text })}
        onSend={() => sendMessage()}
        onStop={stopStreaming}
        onToggleRecording={toggleRecording}
        onAddAttachment={(att) => dispatch({ type: 'ADD_ATTACHMENT', attachment: att })}
        onRemoveAttachment={(id) => dispatch({ type: 'REMOVE_ATTACHMENT', id })}
      />

      {/* Hamburger Menu (overlay) */}
      <ServiceHamburgerMenu
        config={config}
        isOpen={showHamburger}
        language={language}
        onClose={() => dispatch({ type: 'CLOSE_HAMBURGER' })}
        onAction={handleAction}
      />
    </div>
  );
}

/* ─── Speech Recognition type ─── */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};
