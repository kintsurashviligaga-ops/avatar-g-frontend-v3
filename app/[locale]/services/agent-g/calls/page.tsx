'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Loader2, Phone, PhoneOff } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type VoicePref = {
  voice_name: string;
  speed: number;
  language: string;
};

type CallRecord = {
  id: string;
  started_at: string;
  duration_sec: number;
  direction: 'inbound' | 'outbound';
  status: string;
  summary?: string;
};

type CallsStateResponse = {
  voice_connected: boolean;
  prefs: VoicePref | null;
  recent_calls: CallRecord[];
};

export default function AgentGCallsPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [prefs, setPrefs] = useState<VoicePref | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);

  const boot = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<CallsStateResponse>('/api/agent-g/calls');
      setVoiceConnected(data.voice_connected);
      setPrefs(data.prefs);
      setCalls(data.recent_calls || []);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  const updatePref = async (key: keyof VoicePref, value: string | number) => {
    const updated: VoicePref = { ...prefs!, [key]: value };
    setPrefs(updated);
    try {
      await fetchJson('/api/agent-g/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch {
      // ignore
    }
  };

  return (
    <main className="relative min-h-screen bg-[#050510] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={withLocalePath('/services/agent-g', locale)}>
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />{isEn ? 'Back' : 'უკან'}</Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">{isEn ? 'Voice & Calls' : 'ხმა & ზარები'}</h1>
          {voiceConnected && <Badge variant="success">connected</Badge>}
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-400" /></div>}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {!loading && prefs && (
          <Card className="border-white/10 bg-white/5 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">{isEn ? 'Voice Preferences' : 'ხმის პარამეტრები'}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-white">
                {isEn ? 'Voice name' : 'ხმის სახელი'}
                <select value={prefs.voice_name} onChange={(e) => void updatePref('voice_name', e.target.value)} className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white">
                  {['nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy'].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label className="text-xs text-white">
                {isEn ? 'Speed' : 'სიჩქარე'}
                <input type="range" min={0.5} max={2} step={0.1} value={prefs.speed} onChange={(e) => void updatePref('speed', Number(e.target.value))} className="mt-1 block w-full" />
                <span className="text-gray-400">{prefs.speed.toFixed(1)}x</span>
              </label>
              <label className="text-xs text-white">
                {isEn ? 'Language' : 'ენა'}
                <select value={prefs.language} onChange={(e) => void updatePref('language', e.target.value)} className="mt-1 block w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white">
                  {['ka', 'en', 'ru'].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            </div>
          </Card>
        )}

        {!loading && (
          <Card className="border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">{isEn ? 'Call history' : 'ზარების ისტორია'}</h2>
            {calls.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400">{isEn ? 'No calls yet.' : 'ზარები ჯერ არ არის.'}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {calls.map((c) => (
                  <div key={c.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white">{c.direction === 'inbound' ? <Phone className="inline h-3.5 w-3.5 mr-1" /> : <PhoneOff className="inline h-3.5 w-3.5 mr-1" />}{c.direction}</span>
                      <Badge variant={c.status === 'completed' ? 'success' : 'secondary'}>{c.status}</Badge>
                    </div>
                    <p className="mt-1 text-gray-400">{new Date(c.started_at).toLocaleString()} · {c.duration_sec}s</p>
                    {c.summary && <p className="mt-1 text-gray-300">{c.summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}
