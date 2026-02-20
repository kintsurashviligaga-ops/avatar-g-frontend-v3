'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type RuntimeStatus = { type: string; connected: boolean; ready: boolean; note?: string };

type ChannelsResponse = {
  guest: boolean;
  channels: Array<{ id: string; type: string; config: Record<string, unknown>; created_at: string }>;
  runtime_status: RuntimeStatus[];
};

export default function AgentGSettingsPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<ChannelsResponse | null>(null);

  useEffect(() => {
    const run = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));

      try {
        const response = await fetchJson<ChannelsResponse>('/api/agent-g/channels');
        setData(response);
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const saveSample = async (type: 'telegram' | 'whatsapp' | 'mobile') => {
    if (!authenticated) return;
    try {
      await fetchJson('/api/agent-g/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          config: { enabled: true, updated_by: 'settings-ui' },
        }),
      });

      const refreshed = await fetchJson<ChannelsResponse>('/api/agent-g/channels');
      setData(refreshed);
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-5xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold text-white">{isEn ? 'Agent G Settings' : 'Agent G პარამეტრები'}</h1>
            <Link href={withLocalePath('/services/agent-g', locale)}><Button variant="secondary">{isEn ? 'Back' : 'უკან'}</Button></Link>
          </div>
          <p className="mt-1 text-sm text-gray-300">{isEn ? 'Channel integrations, webhook readiness, and orchestration preferences.' : 'არხების ინტეგრაციები, webhook მზადყოფნა და orchestration preferences.'}</p>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </Card>

        {loading ? (
          <Card className="h-40 animate-pulse border-white/10 bg-white/5" />
        ) : (
          <>
            <Card className="border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold text-white">{isEn ? 'Runtime Channel Status' : 'არხების runtime სტატუსი'}</h2>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(data?.runtime_status || []).map((item) => (
                  <div key={item.type} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white">{item.type}</p>
                      <Badge variant={item.ready ? 'success' : item.connected ? 'warning' : 'secondary'}>{item.ready ? 'ready' : item.connected ? 'partial' : 'off'}</Badge>
                    </div>
                    <p className="mt-1 text-gray-400">{item.note || '-'}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold text-white">{isEn ? 'Saved Channel Preferences' : 'შენახული არხების პარამეტრები'}</h2>
              {!authenticated && <p className="mt-2 text-xs text-amber-300">{isEn ? 'Login required to persist preferences.' : 'პარამეტრების შესანახად საჭიროა ავტორიზაცია.'}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void saveSample('telegram')} disabled={!authenticated}>Save Telegram</Button>
                <Button size="sm" variant="secondary" onClick={() => void saveSample('whatsapp')} disabled={!authenticated}>Save WhatsApp</Button>
                <Button size="sm" variant="secondary" onClick={() => void saveSample('mobile')} disabled={!authenticated}>Save Mobile</Button>
              </div>
              <div className="mt-3 space-y-2">
                {(data?.channels || []).length === 0 ? (
                  <p className="text-xs text-gray-400">{isEn ? 'No saved channel preferences yet.' : 'შენახული არხების პარამეტრები ჯერ არ არის.'}</p>
                ) : (data?.channels || []).map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-gray-200">
                    <p className="font-semibold text-white">{item.type}</p>
                    <p>{new Date(item.created_at).toLocaleString()}</p>
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
