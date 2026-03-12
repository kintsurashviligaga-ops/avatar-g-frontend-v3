'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Download,
  Gauge,
  Loader2,
  MessageSquare,
  Phone,
  Plug2,
  Send,
  Settings2,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

/* ── Type contracts ── */
type AgentTaskResponse = {
  task_id: string;
  status: string;
  demo_mode: boolean;
  plan: { task_type: string; sub_tasks: Array<{ agent: string; action: string }> };
  results: {
    summary: string;
    subtasks: Array<{ id: string; agent: string; action: string; status: string; error?: string }>;
  };
};

type AgentGChatResponse = {
  reply: string;
  tone: { mood: 'calm' | 'friendly' | 'excited' | 'serious' | 'humorous'; confidence: number };
  meta: { detectedEmotion: string; styleHints: string[]; voiceHint: string };
};

type ChannelStatusResponse = {
  runtime_status: Array<{ type: string; connected: boolean; ready: boolean; note?: string }>;
};

type CallsStateResponse = {
  voice_connected: boolean;
  prefs: { call_me_when_finished?: boolean } | null;
};

/* ── Copy ── */
const COPY = {
  en: {
    kicker: 'AI Coordinator',
    title: 'Agent G',
    subtitle: 'Your central AI coordinator. Describe what you need — Agent G plans, routes, and executes tasks across all your AI services from one place.',
    inputLabel: 'What should Agent G do?',
    inputPlaceholder: 'e.g. "Create a marketing campaign with voiceover and list it on the marketplace"',
    inputHint: 'Agent G will break this into sub-tasks and coordinate the right AI services automatically.',
    runBtn: 'Run Agent G',
    runningBtn: 'Processing…',
    advancedLabel: 'Advanced mode',
    advancedHint: 'Enable granular sub-task control',
    callMeLabel: 'Notify me by call',
    callMeHint: 'Get a voice call when the task finishes',
    demoBadge: 'Demo mode — sign in for full access',
    voiceBadge: 'Voice connected',
    dashboardLink: 'Task History',
    dashboardHint: 'View past tasks, statuses, and results',
    callsLink: 'Voice Calls',
    callsHint: 'Manage voice connection and call history',
    settingsLink: 'Channels & Settings',
    settingsHint: 'Configure integrations and preferences',
    channelsTitle: 'Connected Channels',
    channelsEmpty: 'No channels configured yet.',
    channelReady: 'Ready',
    channelPartial: 'Needs attention',
    channelOff: 'Disconnected',
    timelineTitle: 'Activity',
    timelineEmpty: 'No actions yet. Ask Agent G to coordinate a task to see execution steps here.',
    resultTitle: 'Agent G Response',
    summaryTitle: 'Task Summary',
    demoNotice: 'Sign in to unlock downloadable outputs and full task history.',
    quickActions: 'Quick Actions',
    helpTitle: 'How it works',
    helpSteps: [
      { title: 'Describe', text: 'Tell Agent G what you need in plain language.' },
      { title: 'Plan', text: 'Agent G breaks it into sub-tasks and picks the right AI services.' },
      { title: 'Execute', text: 'Each service runs its part automatically.' },
      { title: 'Deliver', text: 'You get a unified result — text, audio, PDF, or more.' },
    ],
  },
  ka: {
    kicker: 'AI კოორდინატორი',
    title: 'აგენტი G',
    subtitle: 'შენი ცენტრალური AI კოორდინატორი. აღწერე რა გჭირდება — აგენტი G დაგეგმავს, გაანაწილებს და შეასრულებს დავალებებს ყველა AI სერვისზე ერთი ადგილიდან.',
    inputLabel: 'რა უნდა გააკეთოს აგენტმა G?',
    inputPlaceholder: 'მაგ. "შექმენი მარკეტინგული კამპანია გახმოვანებით და განათავსე marketplace-ზე"',
    inputHint: 'აგენტი G დავალებას ქვე-ამოცანებად დაშლის და ავტომატურად სწორ AI სერვისებს კოორდინაციას გაუწევს.',
    runBtn: 'აგენტი G-ს გაშვება',
    runningBtn: 'მიმდინარეობს…',
    advancedLabel: 'Advanced რეჟიმი',
    advancedHint: 'ქვე-ამოცანების დეტალური კონტროლი',
    callMeLabel: 'შეტყობინება ზარით',
    callMeHint: 'მიიღე ხმოვანი ზარი დავალების დასრულებისას',
    demoBadge: 'Demo რეჟიმი — შედი სრული წვდომისთვის',
    voiceBadge: 'ხმა დაკავშირებულია',
    dashboardLink: 'ამოცანების ისტორია',
    dashboardHint: 'ნახე წარსული ამოცანები და შედეგები',
    callsLink: 'ხმოვანი ზარები',
    callsHint: 'მართე ხმოვანი კავშირი და ზარების ისტორია',
    settingsLink: 'არხები და პარამეტრები',
    settingsHint: 'კონფიგურაცია ინტეგრაციების და პარამეტრების',
    channelsTitle: 'დაკავშირებული არხები',
    channelsEmpty: 'არხები ჯერ არ არის კონფიგურირებული.',
    channelReady: 'მზადაა',
    channelPartial: 'ყურადღება სჭირდება',
    channelOff: 'გათიშულია',
    timelineTitle: 'აქტივობა',
    timelineEmpty: 'ჯერ არ არის ქმედებები. სთხოვე აგენტ G-ს დავალების კოორდინაცია.',
    resultTitle: 'აგენტი G-ს პასუხი',
    summaryTitle: 'ამოცანის შეჯამება',
    demoNotice: 'შედი სისტემაში ჩამოტვირთვებისა და სრული ისტორიისთვის.',
    quickActions: 'სწრაფი ქმედებები',
    helpTitle: 'როგორ მუშაობს',
    helpSteps: [
      { title: 'აღწერე', text: 'უთხარი აგენტ G-ს რა გჭირდება მარტივი ენით.' },
      { title: 'დაგეგმე', text: 'აგენტი G ქვე-ამოცანებად დაშლის და სწორ სერვისებს შეარჩევს.' },
      { title: 'შეასრულე', text: 'თითოეული სერვისი ავტომატურად ასრულებს თავის ნაწილს.' },
      { title: 'მიიღე', text: 'მიიღებ ერთიან შედეგს — ტექსტი, აუდიო, PDF ან მეტი.' },
    ],
  },
  ru: {
    kicker: 'AI-координатор',
    title: 'Агент G',
    subtitle: 'Ваш центральный AI-координатор. Опишите задачу — Агент G спланирует, распределит и выполнит её через все AI-сервисы из одного места.',
    inputLabel: 'Что должен сделать Агент G?',
    inputPlaceholder: 'напр. "Создай маркетинговую кампанию с озвучкой и размести на маркетплейсе"',
    inputHint: 'Агент G разобьёт задачу на подзадачи и автоматически скоординирует нужные AI-сервисы.',
    runBtn: 'Запустить Агент G',
    runningBtn: 'Обработка…',
    advancedLabel: 'Расширенный режим',
    advancedHint: 'Детальный контроль подзадач',
    callMeLabel: 'Уведомить звонком',
    callMeHint: 'Получите звонок по завершении задачи',
    demoBadge: 'Демо-режим — войдите для полного доступа',
    voiceBadge: 'Голос подключён',
    dashboardLink: 'История задач',
    dashboardHint: 'Просмотр задач, статусов и результатов',
    callsLink: 'Голосовые звонки',
    callsHint: 'Управление голосовым подключением и историей',
    settingsLink: 'Каналы и настройки',
    settingsHint: 'Конфигурация интеграций и предпочтений',
    channelsTitle: 'Подключённые каналы',
    channelsEmpty: 'Каналы ещё не настроены.',
    channelReady: 'Готов',
    channelPartial: 'Требуется внимание',
    channelOff: 'Отключён',
    timelineTitle: 'Активность',
    timelineEmpty: 'Пока нет действий. Попросите Агент G координировать задачу.',
    resultTitle: 'Ответ Агента G',
    summaryTitle: 'Итог задачи',
    demoNotice: 'Войдите для загрузки результатов и полной истории задач.',
    quickActions: 'Быстрые действия',
    helpTitle: 'Как это работает',
    helpSteps: [
      { title: 'Опишите', text: 'Расскажите Агенту G, что вам нужно, простым языком.' },
      { title: 'Планирование', text: 'Агент G разбивает задачу и выбирает нужные сервисы.' },
      { title: 'Выполнение', text: 'Каждый сервис автоматически выполняет свою часть.' },
      { title: 'Результат', text: 'Вы получаете единый результат — текст, аудио, PDF и др.' },
    ],
  },
} as const;

/* ── Channel display helpers ── */
const CHANNEL_ICONS: Record<string, string> = {
  web: '🌐', telegram: '✈️', whatsapp: '💬', mobile: '📱', email: '📧', slack: '💼',
};
const channelLabel = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);

/* ───────────────────────── Component ───────────────────────── */
export default function AgentGPage() {
  const pathname = usePathname();
  const params = useSearchParams();
  const locale = getLocaleFromPathname(pathname);
  const c = COPY[locale as keyof typeof COPY] || COPY.en;
  const lp = (p: string) => withLocalePath(p, locale);

  const prefillGoal = params.get('prefill_goal') || '';

  const [authenticated, setAuthenticated] = useState(false);
  const [goal, setGoal] = useState(prefillGoal);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<AgentTaskResponse | null>(null);
  const [chatReply, setChatReply] = useState<AgentGChatResponse | null>(null);
  const [channels, setChannels] = useState<Array<{ type: string; connected: boolean; ready: boolean; note?: string }>>([]);
  const [callMeWhenFinished, setCallMeWhenFinished] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);

  useEffect(() => {
    const boot = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));
      try {
        const status = await fetchJson<ChannelStatusResponse>('/api/agent-g/channels');
        setChannels(status.runtime_status || []);
      } catch { setChannels([]); }
      try {
        const callsState = await fetchJson<CallsStateResponse>('/api/agent-g/calls');
        setCallMeWhenFinished(Boolean(callsState.prefs?.call_me_when_finished));
        setVoiceConnected(Boolean(callsState.voice_connected));
      } catch { setCallMeWhenFinished(false); setVoiceConnected(false); }
    };
    void boot();
  }, []);

  useEffect(() => { if (prefillGoal) setGoal(prefillGoal); }, [prefillGoal]);

  const execute = async () => {
    if (!goal.trim()) return;
    setRunning(true);
    setError(null);
    setChatReply(null);
    try {
      const loc = pathname.startsWith('/en') ? 'en' : pathname.startsWith('/ru') ? 'ru' : 'ka';
      const response = await fetchJson<AgentGChatResponse>('/api/agent-g/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: goal, locale: loc }),
      });
      setTask(null);
      setChatReply(response);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const saveCallMePreference = async (value: boolean) => {
    setCallMeWhenFinished(value);
    try {
      await fetchJson('/api/agent-g/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_me_when_finished: value }),
      });
    } catch { setCallMeWhenFinished(!value); }
  };

  const timeline = useMemo(() => task?.results?.subtasks || [], [task]);
  const readyCount = channels.filter(ch => ch.ready).length;
  const totalChannels = channels.length;

  return (
    <main className="relative min-h-screen px-4 pb-16 pt-20 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2" style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 20%, rgba(99,102,241,0.10) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl">

        {/* ════════ 1. HERO HEADER ════════ */}
        <section className="mb-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              {/* Kicker */}
              <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-accent)', backgroundColor: 'var(--color-accent-soft)', border: '1px solid var(--color-border)' }}>
                <Bot className="h-3.5 w-3.5" />
                {c.kicker}
                {voiceConnected && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              </div>
              {/* Title */}
              <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: 'var(--color-text)' }}>
                {c.title}
              </h1>
              {/* Subtitle */}
              <p className="mt-3 text-[15px] leading-relaxed sm:text-base" style={{ color: 'var(--color-text-secondary)' }}>
                {c.subtitle}
              </p>
            </div>

            {/* Quick nav links */}
            <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
              <NavLink href={lp('/services/agent-g/dashboard')} icon={<Gauge className="h-4 w-4" />} label={c.dashboardLink} hint={c.dashboardHint} />
              <NavLink href={lp('/services/agent-g/calls')} icon={<Phone className="h-4 w-4" />} label={c.callsLink} hint={c.callsHint} />
              <NavLink href={lp('/services/agent-g/settings')} icon={<Settings2 className="h-4 w-4" />} label={c.settingsLink} hint={c.settingsHint} />
            </div>
          </div>
        </section>

        {/* ════════ 2. MAIN WORKSPACE ════════ */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">

          {/* ── Left column: Command center ── */}
          <div className="space-y-5">

            {/* Command input card */}
            <div className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
              {/* Status badges */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {!authenticated && <Badge variant="warning">{c.demoBadge}</Badge>}
                {voiceConnected && <Badge variant="success">{c.voiceBadge}</Badge>}
                {totalChannels > 0 && (
                  <Badge variant={readyCount === totalChannels ? 'success' : readyCount > 0 ? 'warning' : 'secondary'}>
                    <Plug2 className="mr-1 h-3 w-3" />{readyCount}/{totalChannels} channels
                  </Badge>
                )}
              </div>

              {/* Label */}
              <label className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                <MessageSquare className="mr-1.5 inline-block h-4 w-4 align-[-2px]" style={{ color: 'var(--color-accent)' }} />
                {c.inputLabel}
              </label>

              {/* Textarea */}
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={c.inputPlaceholder}
                rows={4}
                className="mt-3 w-full resize-none rounded-xl px-4 py-3 text-sm leading-relaxed outline-none transition-all duration-200 placeholder:opacity-50"
                style={{
                  color: 'var(--color-text)',
                  backgroundColor: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--input-focus)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-soft)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--input-border)'; e.currentTarget.style.boxShadow = 'none'; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void execute(); }}
              />
              <p className="mt-1.5 text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>{c.inputHint}</p>

              {/* Control bar */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {/* Options */}
                <div className="flex flex-wrap items-center gap-4">
                  <ToggleOption checked={advancedMode} onChange={setAdvancedMode} label={c.advancedLabel} hint={c.advancedHint} />
                  <ToggleOption checked={callMeWhenFinished} onChange={(v) => void saveCallMePreference(v)} label={c.callMeLabel} hint={c.callMeHint} />
                </div>

                {/* Primary CTA */}
                <button
                  onClick={() => void execute()}
                  disabled={running || !goal.trim()}
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-[14px] font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    boxShadow: '0 4px 16px rgba(99,102,241,0.25)',
                  }}
                >
                  {running ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />{c.runningBtn}</>
                  ) : (
                    <><Zap className="h-4 w-4" />{c.runBtn}</>
                  )}
                </button>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* ── Agent response ── */}
            {chatReply && (
              <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    <Bot className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                    {c.resultTitle}
                  </h3>
                  <Badge variant="accent">{chatReply.tone.mood}</Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {chatReply.reply}
                </p>
              </div>
            )}

            {/* ── Task result ── */}
            {task && (
              <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
                <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  <Sparkles className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                  {c.summaryTitle}
                </h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {task.results.summary}
                </p>
                {task.demo_mode ? (
                  <p className="mt-3 text-[13px]" style={{ color: '#fbbf24' }}>{c.demoNotice}</p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <OutputBtn href={`/api/agent-g/output?task_id=${encodeURIComponent(task.task_id)}&format=pdf`} label="PDF" />
                    <OutputBtn href={`/api/agent-g/output?task_id=${encodeURIComponent(task.task_id)}&format=zip`} label="ZIP" />
                    <OutputBtn href={`/api/agent-g/output?task_id=${encodeURIComponent(task.task_id)}&format=audio`} label="Audio" />
                  </div>
                )}
              </div>
            )}

            {/* ── Activity timeline ── */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
              <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                <Activity className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                {c.timelineTitle}
              </h3>
              <div className="mt-4">
                {timeline.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <div className="rounded-full p-3" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
                      <Activity className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
                    </div>
                    <p className="max-w-xs text-[13px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                      {c.timelineEmpty}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {timeline.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px]" style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--color-border)' }}>
                        {item.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        ) : item.status === 'failed' ? (
                          <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                        ) : (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: 'var(--color-accent)' }} />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{item.agent}</p>
                          <p className="truncate text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>{item.action}</p>
                        </div>
                        <Badge variant={item.status === 'completed' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}>{item.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right column: Sidebar panels ── */}
          <div className="space-y-5">

            {/* Channel status */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  <Plug2 className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                  {c.channelsTitle}
                </h3>
                <Link href={lp('/services/agent-g/settings')} className="text-[12px] font-medium transition-colors" style={{ color: 'var(--color-accent)' }}>
                  {c.settingsLink.split(' ')[0]} <ChevronRight className="inline h-3 w-3" />
                </Link>
              </div>
              <div className="mt-4 space-y-2">
                {channels.length === 0 ? (
                  <p className="py-4 text-center text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>{c.channelsEmpty}</p>
                ) : channels.map((ch) => (
                  <div key={ch.type} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--color-border)' }}>
                    <span className="text-lg leading-none">{CHANNEL_ICONS[ch.type] || '📡'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium" style={{ color: 'var(--color-text)' }}>{channelLabel(ch.type)}</p>
                      {ch.note && <p className="truncate text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{ch.note}</p>}
                    </div>
                    <StatusDot ready={ch.ready} connected={ch.connected} label={ch.ready ? c.channelReady : ch.connected ? c.channelPartial : c.channelOff} />
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{c.quickActions}</h3>
              <div className="mt-3 space-y-1.5">
                <QuickAction href={lp('/services/agent-g/dashboard')} icon={<Gauge className="h-4 w-4" />} label={c.dashboardLink} hint={c.dashboardHint} />
                <QuickAction href={lp('/services/agent-g/calls')} icon={<Phone className="h-4 w-4" />} label={c.callsLink} hint={c.callsHint} />
                <QuickAction href={lp('/services/agent-g/settings')} icon={<Settings2 className="h-4 w-4" />} label={c.settingsLink} hint={c.settingsHint} />
              </div>
            </div>

            {/* How it works */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{c.helpTitle}</h3>
              <div className="mt-4 space-y-3">
                {c.helpSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: 'var(--color-accent)' }}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>{step.title}</p>
                      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ═══ Sub-components ═══ */

function NavLink({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-200"
      style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)' }}
      title={hint}
    >
      <span style={{ color: 'var(--color-accent)' }}>{icon}</span>
      {label}
      <ArrowRight className="h-3 w-3 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
    </Link>
  );
}

function ToggleOption({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="group inline-flex cursor-pointer items-center gap-2.5 text-[13px]" title={hint}>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!checked); } }}
        tabIndex={0}
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200"
        style={{ backgroundColor: checked ? 'var(--color-accent)' : 'var(--input-border)' }}
      >
        <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200" style={{ transform: checked ? 'translateX(18px)' : 'translateX(3px)' }} />
      </span>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
    </label>
  );
}

function OutputBtn({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all"
      style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--card-bg)' }}
    >
      <Download className="h-3.5 w-3.5" />{label}
    </a>
  );
}

function StatusDot({ ready, connected, label }: { ready: boolean; connected: boolean; label: string }) {
  const color = ready ? '#4ade80' : connected ? '#fbbf24' : 'var(--color-text-tertiary)';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color }}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: ready ? '0 0 6px rgba(74,222,128,0.5)' : undefined }} />
      {label}
    </span>
  );
}

function QuickAction({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150"
      style={{ border: '1px solid transparent' }}
      title={hint}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--input-bg)'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium" style={{ color: 'var(--color-text)' }}>{label}</p>
        <p className="truncate text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-60" style={{ color: 'var(--color-text-tertiary)' }} />
    </Link>
  );
}

