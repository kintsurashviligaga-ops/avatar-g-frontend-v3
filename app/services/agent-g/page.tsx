'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bot, Download, Loader2, PhoneCall, Send, Settings2, Sparkles } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type AgentTaskResponse = {
  task_id: string;
  status: string;
  demo_mode: boolean;
  plan: {
    task_type: string;
    sub_tasks: Array<{ agent: string; action: string }>;
  };
  results: {
    summary: string;
    subtasks: Array<{ id: string; agent: string; action: string; status: string; error?: string }>;
  };
};

type AgentGChatResponse = {
  reply: string;
  tone: {
    mood: 'calm' | 'friendly' | 'excited' | 'serious' | 'humorous';
    confidence: number;
  };
  meta: {
    detectedEmotion: string;
    styleHints: string[];
    voiceHint: string;
  };
};

type ChannelStatusResponse = {
  runtime_status: Array<{ type: string; connected: boolean; ready: boolean; note?: string }>;
};

type CallsStateResponse = {
  voice_connected: boolean;
  prefs: {
    call_me_when_finished?: boolean;
  } | null;
};

export default function AgentGPage() {
  const pathname = usePathname();
  const params = useSearchParams();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));

      try {
        const status = await fetchJson<ChannelStatusResponse>('/api/agent-g/channels');
        setChannels(status.runtime_status || []);
      } catch {
        setChannels([]);
      }

      try {
        const callsState = await fetchJson<CallsStateResponse>('/api/agent-g/calls');
        setCallMeWhenFinished(Boolean(callsState.prefs?.call_me_when_finished));
        setVoiceConnected(Boolean(callsState.voice_connected));
      } catch {
        setCallMeWhenFinished(false);
        setVoiceConnected(false);
      }
    };

    void boot();
  }, []);

  useEffect(() => {
    if (prefillGoal) setGoal(prefillGoal);
  }, [prefillGoal]);

  const execute = async () => {
    if (!goal.trim()) return;

    setRunning(true);
    setError(null);
    setChatReply(null);

    try {
      const locale = pathname.startsWith('/en') ? 'en' : pathname.startsWith('/ru') ? 'ru' : 'ka';
      const response = await fetchJson<AgentGChatResponse>('/api/agent-g/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: goal, locale }),
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
    } catch {
      setCallMeWhenFinished(!value);
    }
  };

  const timeline = useMemo(() => task?.results?.subtasks || [], [task]);

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-7xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                <Bot className="h-3.5 w-3.5" /> Agent G Orchestrator
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">{isEn ? 'Agent G Master Orchestration' : 'Agent G Master ორკესტრაცია'}</h1>
              <p className="mt-1 text-sm text-gray-300">{isEn ? 'From one goal to multi-agent execution, aggregation, and unified output delivery.' : 'ერთი მიზნიდან მრავალ-აგენტურ შესრულებამდე, აგრეგაციამდე და ერთიან შედეგამდე.'}</p>
            </div>
            <div className="flex gap-2">
              <Link href={withLocalePath('/services/agent-g/dashboard', locale)}><Button variant="secondary">Dashboard</Button></Link>
              <Link href={withLocalePath('/services/agent-g/calls', locale)}><Button variant="secondary"><PhoneCall className="mr-1 h-4 w-4" />Call Agent G</Button></Link>
              <Link href={withLocalePath('/services/agent-g/settings', locale)}><Button variant="secondary"><Settings2 className="mr-1 h-4 w-4" />Settings</Button></Link>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 border-white/10 bg-white/5 p-4">
            <label className="text-sm font-medium text-white">{isEn ? 'Goal prompt' : 'მიზნის პრომპტი'}</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={isEn ? 'Create a full marketing campaign with voiceover and marketplace listing...' : 'შექმენი სრული მარკეტინგული კამპანია გახმოვანებით და marketplace listing-ით...'}
              className="mt-2 h-28 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-white">
                  <input type="checkbox" checked={advancedMode} onChange={(e) => setAdvancedMode(e.target.checked)} />
                  {isEn ? 'Advanced Mode' : 'Advanced რეჟიმი'}
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-white">
                  <input type="checkbox" checked={callMeWhenFinished} onChange={(e) => void saveCallMePreference(e.target.checked)} />
                  {isEn ? 'Call me when finished' : 'დასრულებისას დამირეკე'}
                </label>
              </div>

              <div className="flex items-center gap-2">
                {!authenticated && <Badge variant="warning">{isEn ? 'Demo mode' : 'Demo რეჟიმი'}</Badge>}
                {voiceConnected && <Badge variant="success">Voice Connected</Badge>}
                <Button onClick={() => void execute()} disabled={running || !goal.trim()}>
                  {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} {isEn ? 'Execute' : 'გაშვება'}
                </Button>
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

            {task && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-sm text-white">{isEn ? 'Unified summary' : 'ერთიანი შეჯამება'}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-gray-300">{task.results.summary}</p>
                {task.demo_mode ? (
                  <p className="mt-2 text-xs text-amber-300">{isEn ? 'Demo mode: sign in to enable downloadable outputs and task history.' : 'Demo რეჟიმი: ჩამოტვირთვებისა და task history-ისთვის შედი სისტემაში.'}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`/api/agent-g/output?task_id=${encodeURIComponent(task.task_id)}&format=pdf`}><Button size="sm" variant="secondary"><Download className="mr-1 h-3.5 w-3.5" />PDF</Button></a>
                    <a href={`/api/agent-g/output?task_id=${encodeURIComponent(task.task_id)}&format=zip`}><Button size="sm" variant="secondary"><Download className="mr-1 h-3.5 w-3.5" />ZIP</Button></a>
                    <a href={`/api/agent-g/output?task_id=${encodeURIComponent(task.task_id)}&format=audio`}><Button size="sm" variant="secondary"><Sparkles className="mr-1 h-3.5 w-3.5" />Audio</Button></a>
                  </div>
                )}
              </div>
            )}

            {chatReply && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-white">{isEn ? 'Agent G reply' : 'Agent G პასუხი'}</p>
                  <Badge variant="secondary">{chatReply.tone.mood}</Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-200">{chatReply.reply}</p>
              </div>
            )}
          </Card>

          <Card className="border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">{isEn ? 'Channel status' : 'არხების სტატუსი'}</h2>
            <div className="mt-3 space-y-2 text-xs">
              {channels.map((channel) => (
                <div key={channel.type} className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{channel.type}</span>
                    <Badge variant={channel.ready ? 'success' : channel.connected ? 'warning' : 'secondary'}>{channel.ready ? 'ready' : channel.connected ? 'partial' : 'off'}</Badge>
                  </div>
                  <p className="mt-1 text-gray-400">{channel.note || '-'}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold text-white">{isEn ? 'Execution timeline' : 'შესრულების timeline'}</h2>
          <div className="mt-3 space-y-2">
            {timeline.length === 0 ? (
              <p className="text-xs text-gray-400">{isEn ? 'No executions yet.' : 'შესრულებები ჯერ არ არის.'}</p>
            ) : timeline.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white">{item.agent} / {item.action}</p>
                  <Badge variant={item.status === 'completed' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}>{item.status}</Badge>
                </div>
                {item.error && <p className="mt-1 text-red-300">{item.error}</p>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
