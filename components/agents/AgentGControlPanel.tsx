/**
 * components/agents/AgentGControlPanel.tsx
 * =========================================
 * The Agent G Command Center — shows:
 * - All active agents and their status
 * - Pipeline progress (step-by-step DAG)
 * - Recent outputs / assets
 * - Quick-launch pipeline buttons
 */

'use client';

import { useState, useMemo } from 'react';
import { ALL_AGENTS, getAgentStats, type AgentContract } from '@/lib/agents/contracts';
import { PIPELINE_DEFINITIONS, type PipelineDefinition } from '@/lib/agents/pipelines';
import type { PipelineStatus, PipelineStepStatus } from '@/lib/agents/context';

interface AgentGControlPanelProps {
  locale: string;
  activePipeline?: PipelineStatus | null;
  onLaunchPipeline?: (pipelineType: string) => void;
}

const PANEL_LABELS = {
  en: {
    title: 'Agent G Control Panel',
    agents: 'Agents',
    pipelines: 'Pipelines',
    status: 'Status',
    total: 'Total Agents',
    specialists: 'Specialists',
    ready: 'Ready',
    launch: 'Launch',
    active: 'Active',
    idle: 'Idle',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    pending: 'Pending',
    steps: 'steps',
    min: 'min',
    noActivePipeline: 'No active pipeline',
    selectPipeline: 'Select a pipeline to get started',
    pipelineProgress: 'Pipeline Progress',
    agentTeam: 'Agent Team',
    quickLaunch: 'Quick Launch',
    creator: 'Creator',
    commerce: 'Commerce',
    business: 'Business',
    enterprise: 'Enterprise',
  },
  ka: {
    title: 'Agent G კონტროლის პანელი',
    agents: 'აგენტები',
    pipelines: 'პაიპლაინები',
    status: 'სტატუსი',
    total: 'სულ აგენტები',
    specialists: 'სპეციალისტები',
    ready: 'მზადაა',
    launch: 'გაშვება',
    active: 'აქტიური',
    idle: 'უმოქმედო',
    running: 'მიმდინარე',
    completed: 'დასრულებული',
    failed: 'წარუმატებელი',
    pending: 'მოლოდინში',
    steps: 'ნაბიჯი',
    min: 'წთ',
    noActivePipeline: 'აქტიური პაიპლაინი არ არის',
    selectPipeline: 'აირჩიე პაიპლაინი დასაწყებად',
    pipelineProgress: 'პაიპლაინის პროგრესი',
    agentTeam: 'აგენტების გუნდი',
    quickLaunch: 'სწრაფი გაშვება',
    creator: 'კრეატორი',
    commerce: 'კომერცია',
    business: 'ბიზნესი',
    enterprise: 'ენტერპრაიზი',
  },
  ru: {
    title: 'Панель управления Agent G',
    agents: 'Агенты',
    pipelines: 'Пайплайны',
    status: 'Статус',
    total: 'Всего агентов',
    specialists: 'Специалисты',
    ready: 'Готов',
    launch: 'Запуск',
    active: 'Активен',
    idle: 'Ожидание',
    running: 'Выполняется',
    completed: 'Завершено',
    failed: 'Ошибка',
    pending: 'Ожидание',
    steps: 'шагов',
    min: 'мин',
    noActivePipeline: 'Нет активного пайплайна',
    selectPipeline: 'Выберите пайплайн для начала',
    pipelineProgress: 'Прогресс пайплайна',
    agentTeam: 'Команда агентов',
    quickLaunch: 'Быстрый запуск',
    creator: 'Креатор',
    commerce: 'Коммерция',
    business: 'Бизнес',
    enterprise: 'Корпоративный',
  },
} as const;

type TabId = 'team' | 'pipelines' | 'status';

export default function AgentGControlPanel({ locale, activePipeline, onLaunchPipeline }: AgentGControlPanelProps) {
  const t = PANEL_LABELS[locale as keyof typeof PANEL_LABELS] ?? PANEL_LABELS.en;
  const [activeTab, setActiveTab] = useState<TabId>('team');
  const stats = useMemo(() => getAgentStats(), []);

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'team', label: t.agentTeam, icon: '👥' },
    { id: 'pipelines', label: t.quickLaunch, icon: '🚀' },
    { id: 'status', label: t.pipelineProgress, icon: '📊' },
  ];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg, var(--color-accent), rgba(139,92,246,0.8))', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}>
            ⬢
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{t.title}</h2>
            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {stats.total} {t.agents} · {stats.specialist} {t.specialists}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.active}</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex px-4 pt-3 gap-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors"
            style={{
              backgroundColor: activeTab === tab.id ? 'var(--card-bg)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'team' && <AgentTeamGrid locale={locale} />}
        {activeTab === 'pipelines' && <PipelineLauncher locale={locale} onLaunch={onLaunchPipeline} />}
        {activeTab === 'status' && <PipelineStatusView locale={locale} pipeline={activePipeline} />}
      </div>
    </div>
  );
}

// ─── Agent Team Grid ─────────────────────────────────────────────────────────

function AgentTeamGrid({ locale }: { locale: string }) {
  const agents = useMemo(() => ALL_AGENTS.filter(a => a.active), []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {agents.map((agent) => (
        <div
          key={agent.agentId}
          className="flex items-center gap-2 px-2.5 py-2 rounded-xl transition-colors hover:scale-[1.01]"
          style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}
        >
          <span className="text-lg">{agent.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>
              {getLocalizedName(agent, locale)}
            </p>
            <p className="text-[9px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
              {agent.capabilities.slice(0, 2).join(', ')}
            </p>
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ─── Pipeline Launcher ───────────────────────────────────────────────────────

function PipelineLauncher({ locale, onLaunch }: { locale: string; onLaunch?: (type: string) => void }) {
  const t = PANEL_LABELS[locale as keyof typeof PANEL_LABELS] ?? PANEL_LABELS.en;

  const categories: { key: PipelineDefinition['category']; label: string }[] = [
    { key: 'creator', label: t.creator },
    { key: 'commerce', label: t.commerce },
    { key: 'business', label: t.business },
    { key: 'enterprise', label: t.enterprise },
  ];

  return (
    <div className="space-y-4">
      {categories.map(cat => {
        const pipelines = PIPELINE_DEFINITIONS.filter(p => p.category === cat.key);
        if (pipelines.length === 0) return null;
        return (
          <div key={cat.key}>
            <p className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
              {cat.label}
            </p>
            <div className="grid gap-2">
              {pipelines.map(pipeline => (
                <div
                  key={pipeline.type}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-colors"
                  style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                      {getLocalizedLabel(pipeline.label, locale)}
                    </p>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                      {getLocalizedLabel(pipeline.description, locale)} · {pipeline.steps.length} {t.steps} · ~{pipeline.estimatedMinutes}{t.min}
                    </p>
                  </div>
                  <button
                    onClick={() => onLaunch?.(pipeline.type)}
                    className="px-3 py-1.5 text-[10px] font-semibold rounded-lg transition-all hover:scale-105"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-accent), rgba(139,92,246,0.8))',
                      color: 'white',
                      boxShadow: '0 2px 8px rgba(99,102,241,0.2)',
                    }}
                  >
                    {t.launch}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Pipeline Status View ────────────────────────────────────────────────────

function PipelineStatusView({ locale, pipeline }: { locale: string; pipeline?: PipelineStatus | null }) {
  const t = PANEL_LABELS[locale as keyof typeof PANEL_LABELS] ?? PANEL_LABELS.en;

  if (!pipeline) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <span className="text-3xl mb-3 opacity-40">📊</span>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.noActivePipeline}</p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{t.selectPipeline}</p>
      </div>
    );
  }

  const completedCount = pipeline.steps.filter(s => s.status === 'completed').length;
  const totalCount = pipeline.steps.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
            {completedCount}/{totalCount} {t.steps}
          </span>
          <StatusBadge status={pipeline.overallStatus} locale={locale} />
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPercent}%`,
              background: pipeline.overallStatus === 'failed'
                ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                : 'linear-gradient(90deg, var(--color-accent), rgba(139,92,246,0.8))',
            }}
          />
        </div>
      </div>

      {/* Step list */}
      <div className="space-y-1.5">
        {pipeline.steps.map((step, i) => (
          <StepRow key={i} step={step} index={i} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function StepRow({ step, index, locale }: { step: PipelineStepStatus; index: number; locale: string }) {
  const statusIcon = {
    pending: '○',
    running: '◉',
    completed: '✓',
    failed: '✕',
    skipped: '◌',
  }[step.status];

  const statusColor = {
    pending: 'var(--color-text-tertiary)',
    running: 'var(--color-accent)',
    completed: '#10b981',
    failed: '#ef4444',
    skipped: 'var(--color-text-tertiary)',
  }[step.status];

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors"
      style={{
        backgroundColor: step.status === 'running' ? 'var(--color-accent-soft)' : 'var(--card-bg)',
        border: `1px solid ${step.status === 'running' ? 'var(--color-accent)' : 'var(--color-border)'}`,
      }}
    >
      <span className="text-sm font-bold w-5 text-center" style={{ color: statusColor }}>
        {statusIcon}
      </span>
      <span className="text-[10px] font-mono w-5 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
        {index + 1}
      </span>
      <span className="text-xs flex-1 truncate" style={{ color: step.status === 'running' ? 'var(--color-accent)' : 'var(--color-text)' }}>
        {step.label}
      </span>
      {step.qaScore != null && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ backgroundColor: step.qaScore >= 85 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: step.qaScore >= 85 ? '#10b981' : '#ef4444' }}>
          {step.qaScore}
        </span>
      )}
      {step.durationMs != null && (
        <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {(step.durationMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status, locale }: { status: string; locale: string }) {
  const t = PANEL_LABELS[locale as keyof typeof PANEL_LABELS] ?? PANEL_LABELS.en;
  const label = (t as Record<string, string>)[status] ?? status;
  const color = {
    idle: 'var(--color-text-tertiary)',
    running: 'var(--color-accent)',
    paused: '#f59e0b',
    completed: '#10b981',
    failed: '#ef4444',
    partial: '#f59e0b',
  }[status] ?? 'var(--color-text-tertiary)';

  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLocalizedName(agent: AgentContract, locale: string): string {
  if (locale === 'ka') return agent.nameKa;
  if (locale === 'ru') return agent.nameRu;
  return agent.name;
}

function getLocalizedLabel(label: { en: string; ka: string; ru: string }, locale: string): string {
  return label[locale as keyof typeof label] ?? label.en;
}
