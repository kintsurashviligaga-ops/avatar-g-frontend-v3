'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Check, ExternalLink, Loader2, Plug, RefreshCw, X } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type ChannelInfo = {
  type: string;
  connected: boolean;
  ready: boolean;
  note?: string;
  config?: Record<string, string>;
};

type ChannelSettingsResponse = {
  channels: ChannelInfo[];
};

export default function AgentGSettingsPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      try {
        const data = await fetchJson<ChannelSettingsResponse>('/api/agent-g/channels');
        setChannels(data.channels || (data as unknown as { runtime_status: ChannelInfo[] }).runtime_status || []);
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, []);

  const toggleChannel = async (type: string) => {
    const ch = channels.find((c) => c.type === type);
    if (!ch) return;
    setSaving(type);
    try {
      await fetchJson('/api/agent-g/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, connected: !ch.connected }),
      });
      setChannels((prev) => prev.map((c) => (c.type === type ? { ...c, connected: !c.connected } : c)));
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const connectTelegram = async () => {
    setSaving('telegram');
    try {
      const result = await fetchJson<{ connect_url: string }>('/api/agent-g/channels/telegram/connect', { method: 'POST' });
      window.open(result.connect_url, '_blank');
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const testWhatsApp = async () => {
    setSaving('whatsapp');
    try {
      await fetchJson('/api/agent-g/channels/whatsapp/test', { method: 'POST' });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <main className="relative min-h-screen bg-transparent px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={withLocalePath('/services/agent-g', locale)}>
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />{isEn ? 'Back' : 'უკან'}</Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">{isEn ? 'Channel Integrations' : 'არხების ინტეგრაცია'}</h1>
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-400" /></div>}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {!loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {channels.map((ch) => (
              <Card key={ch.type} className="border-white/10 bg-white/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-cyan-400" />
                    <span className="text-sm font-semibold text-white capitalize">{ch.type}</span>
                  </div>
                  <Badge variant={ch.ready ? 'success' : ch.connected ? 'warning' : 'secondary'}>{ch.ready ? 'ready' : ch.connected ? 'partial' : 'off'}</Badge>
                </div>
                {ch.note && <p className="text-xs text-gray-400">{ch.note}</p>}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={ch.connected ? 'danger' : 'primary'} onClick={() => void toggleChannel(ch.type)} disabled={saving === ch.type}>
                    {saving === ch.type ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : ch.connected ? <X className="mr-1 h-3.5 w-3.5" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                    {ch.connected ? (isEn ? 'Disconnect' : 'გათიშვა') : (isEn ? 'Connect' : 'დაკავშირება')}
                  </Button>

                  {ch.type === 'telegram' && !ch.connected && (
                    <Button size="sm" variant="secondary" onClick={() => void connectTelegram()} disabled={saving === 'telegram'}>
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />{isEn ? 'Connect via Telegram' : 'Telegram-ით დაკავშირება'}
                    </Button>
                  )}

                  {ch.type === 'whatsapp' && ch.connected && (
                    <Button size="sm" variant="secondary" onClick={() => void testWhatsApp()} disabled={saving === 'whatsapp'}>
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />{isEn ? 'Send test' : 'ტესტ შეტყობინება'}
                    </Button>
                  )}
                </div>

                {ch.config && Object.keys(ch.config).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(ch.config).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs text-gray-400">
                        <span>{k}</span>
                        <span className="text-white">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
