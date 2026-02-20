'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname } from '@/lib/i18n/localePath';
import type { MarketplaceInquiry, MarketplaceMessage } from '@/lib/marketplace/types';

export default function MarketplaceInboxPage() {
  const pathname = usePathname();
  const params = useSearchParams();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';
  const selectedFromQuery = params.get('inquiry') || '';

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<MarketplaceInquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<string>('');
  const [messages, setMessages] = useState<MarketplaceMessage[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const run = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const data = await fetchJson<{ inquiries: MarketplaceInquiry[] }>('/api/marketplace/inquiries?mine=1');
        const rows = data.inquiries || [];
        setInquiries(rows);
        setSelectedInquiry(selectedFromQuery || rows[0]?.id || '');
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [selectedFromQuery]);

  useEffect(() => {
    const load = async () => {
      if (!selectedInquiry) {
        setMessages([]);
        return;
      }
      try {
        const data = await fetchJson<{ messages: MarketplaceMessage[] }>(`/api/marketplace/inquiries/${selectedInquiry}/messages`);
        setMessages(data.messages || []);
      } catch {
        setMessages([]);
      }
    };
    void load();
  }, [selectedInquiry]);

  const current = useMemo(() => inquiries.find((item) => item.id === selectedInquiry) || null, [inquiries, selectedInquiry]);

  const sendMessage = async () => {
    if (!selectedInquiry || !text.trim()) return;
    try {
      await fetchJson(`/api/marketplace/inquiries/${selectedInquiry}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      setText('');
      const refreshed = await fetchJson<{ messages: MarketplaceMessage[] }>(`/api/marketplace/inquiries/${selectedInquiry}/messages`);
      setMessages(refreshed.messages || []);
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-6xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-4">
          <h1 className="text-2xl font-semibold text-white">{isEn ? 'Marketplace Inbox' : 'Marketplace Inbox'}</h1>
          <p className="text-sm text-gray-300">{isEn ? 'Chat with buyers and sellers from inquiries.' : 'მყიდველებთან და გამყიდველებთან ჩატი inquiries-დან.'}</p>
        </Card>

        {!authenticated ? (
          <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">{isEn ? 'Login required for inbox.' : 'Inbox-ისთვის საჭიროა ავტორიზაცია.'}</Card>
        ) : loading ? (
          <Card className="h-56 animate-pulse border-white/10 bg-white/5" />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="border-white/10 bg-white/5 p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-300">{isEn ? 'Threads' : 'Threads'}</h2>
              <div className="mt-2 space-y-2">
                {inquiries.length === 0 ? (
                  <p className="text-xs text-gray-400">{isEn ? 'No threads yet.' : 'thread-ები ჯერ არ არის.'}</p>
                ) : inquiries.map((inquiry) => (
                  <button key={inquiry.id} onClick={() => setSelectedInquiry(inquiry.id)} className={`w-full rounded-lg border p-2 text-left text-xs ${selectedInquiry === inquiry.id ? 'border-cyan-400/60 bg-cyan-500/10 text-white' : 'border-white/10 bg-black/20 text-gray-200'}`}>
                    <p className="font-semibold">{inquiry.subject || (isEn ? 'Inquiry' : 'Inquiry')}</p>
                    <p className="text-[11px] text-gray-400">{inquiry.status}</p>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="lg:col-span-2 border-white/10 bg-white/5 p-3">
              {error && <p className="mb-2 text-xs text-red-300">{error}</p>}
              <p className="text-xs text-gray-400">{current?.subject || (isEn ? 'Select a thread' : 'აირჩიე thread')}</p>
              <div className="mt-2 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <p className="text-xs text-gray-400">{isEn ? 'No messages yet.' : 'შეტყობინებები ჯერ არ არის.'}</p>
                ) : messages.map((msg) => (
                  <div key={msg.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-gray-200">
                    <p>{msg.body}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{new Date(msg.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder={isEn ? 'Write a message...' : 'დაწერე შეტყობინება...'} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                <Button onClick={() => void sendMessage()} disabled={!selectedInquiry || !text.trim()}>{isEn ? 'Send' : 'გაგზავნა'}</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
