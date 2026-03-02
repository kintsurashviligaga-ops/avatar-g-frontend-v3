'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type Thread = {
  id: string;
  other_user_name: string;
  listing_title: string;
  last_message: string;
  updated_at: string;
  unread: boolean;
};

type InboxResponse = { threads: Thread[] };

export default function MarketplaceInboxPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJson<InboxResponse>('/api/marketplace/inbox');
        setThreads(data.threads || []);
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <main className="relative min-h-screen bg-[#050510] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={withLocalePath('/services/marketplace', locale)}>
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />{isEn ? 'Back' : 'უკან'}</Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">{isEn ? 'Messages' : 'შეტყობინებები'}</h1>
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-400" /></div>}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {!loading && threads.length === 0 && (
          <p className="text-sm text-gray-400">{isEn ? 'No messages yet.' : 'შეტყობინებები ჯერ არ არის.'}</p>
        )}

        <div className="space-y-3">
          {threads.map((t) => (
            <Card key={t.id} className="border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-cyan-400" />
                    <span className="text-sm font-semibold text-white">{t.other_user_name}</span>
                    {t.unread && <Badge variant="primary">new</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{t.listing_title}</p>
                  <p className="mt-1 text-sm text-gray-300 line-clamp-2">{t.last_message}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-gray-500">{new Date(t.updated_at).toLocaleDateString()}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
