'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loader2, Phone, PhoneCall } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/Input';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type CallPrefs = {
  phone_number?: string | null;
  display_name?: string | null;
  call_me_when_finished?: boolean;
  voice_connected?: boolean;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone_offset_minutes?: number;
};

type CallHistoryItem = {
  id: string;
  direction: 'inbound' | 'outbound';
  channel: 'phone' | 'telegram' | 'web_voice';
  status: 'queued' | 'ringing' | 'active' | 'ended' | 'failed';
  started_at: string;
  summary?: string | null;
};

type CallsResponse = {
  guest: boolean;
  provider: string;
  voice_connected: boolean;
  prefs: CallPrefs | null;
  calls: CallHistoryItem[];
};

export default function AgentGCallsPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState('mock');
  const [history, setHistory] = useState<CallHistoryItem[]>([]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [callMeWhenFinished, setCallMeWhenFinished] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);

  const load = async () => {
    try {
      const response = await fetchJson<CallsResponse>('/api/agent-g/calls');
      setProvider(response.provider);
      setHistory(response.calls || []);
      setPhone(response.prefs?.phone_number || '');
      setName(response.prefs?.display_name || '');
      setCallMeWhenFinished(Boolean(response.prefs?.call_me_when_finished));
      setVoiceConnected(Boolean(response.voice_connected || response.prefs?.voice_connected));
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));
      await load();
    };

    void boot();
  }, []);

  const savePrefs = async () => {
    if (!authenticated) return;
    setSaving(true);
    setError(null);

    try {
      await fetchJson('/api/agent-g/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phone || null,
          display_name: name || null,
          call_me_when_finished: callMeWhenFinished,
          voice_connected: voiceConnected,
          timezone_offset_minutes: new Date().getTimezoneOffset() * -1,
        }),
      });
      await load();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startCall = async () => {
    if (!authenticated) return;
    setStarting(true);
    setError(null);

    try {
      await fetchJson('/api/agent-g/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'phone',
          mode: 'task_intake',
          initial_text: 'Start voice intake with Agent G.',
        }),
      });
      await load();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setStarting(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-5xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold text-white">{isEn ? 'Agent G Calls' : 'Agent G ზარები'}</h1>
            <div className="flex items-center gap-2">
              <Badge variant={voiceConnected ? 'success' : 'secondary'}>{voiceConnected ? 'Voice Connected' : 'Voice Offline'}</Badge>
              <Link href={withLocalePath('/services/agent-g', locale)}><Button variant="secondary">{isEn ? 'Back' : 'უკან'}</Button></Link>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-300">{isEn ? `Provider: ${provider}. Configure callback preferences and review call history.` : `პროვაიდერი: ${provider}. დააკონფიგურირე callback პარამეტრები და ნახე ზარების ისტორია.`}</p>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </Card>

        {!authenticated ? (
          <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">{isEn ? 'Login required to configure calls and history.' : 'ზარების კონფიგურაციისა და ისტორიისთვის საჭიროა ავტორიზაცია.'}</Card>
        ) : (
          <>
            <Card className="border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold text-white">{isEn ? 'Voice preferences' : 'ხმის პარამეტრები'}</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-gray-300">{isEn ? 'Phone number' : 'ტელეფონის ნომერი'}</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+995..." className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-300">{isEn ? 'Display name' : 'სახელი'}</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isEn ? 'Your name' : 'თქვენი სახელი'} className="mt-1" />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-white">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={callMeWhenFinished} onChange={(e) => setCallMeWhenFinished(e.target.checked)} />
                  {isEn ? 'Call me when finished' : 'დასრულებისას დამირეკე'}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={voiceConnected} onChange={(e) => setVoiceConnected(e.target.checked)} />
                  {isEn ? 'Voice connected' : 'ხმა დაკავშირებულია'}
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void savePrefs()} disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  {isEn ? 'Save preferences' : 'პარამეტრების შენახვა'}
                </Button>
                <Button variant="secondary" onClick={() => void startCall()} disabled={starting}>
                  {starting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-1 h-4 w-4" />}
                  {isEn ? 'Call Agent G' : 'Agent G-ზე დარეკვა'}
                </Button>
              </div>
            </Card>

            <Card className="border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold text-white">{isEn ? 'Recent calls' : 'ბოლო ზარები'}</h2>
              <div className="mt-3 space-y-2">
                {loading ? (
                  <div className="h-24 animate-pulse rounded-lg border border-white/10 bg-black/20" />
                ) : history.length === 0 ? (
                  <p className="text-xs text-gray-400">{isEn ? 'No calls yet.' : 'ზარები ჯერ არ არის.'}</p>
                ) : history.map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white"><Phone className="mr-1 inline h-3.5 w-3.5" />{item.direction} / {item.channel}</p>
                      <Badge variant={item.status === 'ended' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}>{item.status}</Badge>
                    </div>
                    <p className="mt-1 text-gray-400">{new Date(item.started_at).toLocaleString()}</p>
                    {item.summary && <p className="mt-1 text-gray-200">{item.summary}</p>}
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
