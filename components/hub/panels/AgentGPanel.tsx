'use client';

/**
 * AgentGPanel — AI Director chat interface
 * Quick actions, conversation, service routing suggestions
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Bot, User, Loader2, ChevronRight, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAiPipeline } from '@/hooks/useAiPipeline';

// ─── Quick Actions ────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: '👤 Create Avatar',    prompt: 'Create an AI avatar for me — professional, business style' },
  { label: '🎬 Generate Video',   prompt: 'Generate a cinematic video for my brand' },
  { label: '🖼️ Design Image',     prompt: 'Create a high-quality marketing image' },
  { label: '🎵 Compose Music',    prompt: 'Compose background music for a commercial' },
  { label: '✍️ Write Copy',       prompt: 'Write persuasive ad copy for my product' },
  { label: '⚡ Build Pipeline',   prompt: 'Help me build an automated AI production pipeline' },
];

const SERVICE_MAP: Record<string, { emoji: string; label: string; href: string }> = {
  avatar:  { emoji: '👤', label: 'Avatar Studio',  href: '/services/avatar' },
  video:   { emoji: '🎬', label: 'Video Studio',   href: '/services/video'  },
  image:   { emoji: '🖼️', label: 'Image Creator',  href: '/services/image'  },
  music:   { emoji: '🎵', label: 'Music Studio',   href: '/services/music'  },
  text:    { emoji: '✍️', label: 'Copy & Text',    href: '/services/text'   },
  workflow:{ emoji: '⚡', label: 'Workflows',      href: '/services/workflow'},
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  services?: string[];
};

// ─── Component ───────────────────────────────────────────────

export function AgentGPanel({ locale }: { locale: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { run, loading } = useAiPipeline('copy'); // uses copy agent for text routing

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: q };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    const result = await run({ prompt: q, context: 'You are Agent G, an AI director. Suggest which services to use and provide a brief response. Mention service IDs: avatar, video, image, music, text, workflow when relevant.' });

    const raw = typeof result?.result === 'string' ? result.result : 'I can help you with that. Let me suggest the right services for your needs.';

    // Detect mentioned services
    const services = Object.keys(SERVICE_MAP).filter(k => raw.toLowerCase().includes(k));

    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: raw,
      services: services.length > 0 ? services : undefined,
    };
    setMessages(prev => [...prev, assistantMsg]);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
          <Bot size={16} className="text-white" />
        </div>
        <div>
          <h1 className="text-[14px] font-bold text-white">Agent G</h1>
          <p className="text-[11px] text-white/40">AI Director · Central Orchestrator</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-300" />
          </span>
          <span className="text-[11px] text-cyan-300 font-medium">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="h-full flex flex-col items-center justify-center gap-6 py-8">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_40px_rgba(34,211,238,0.25)]">
              <Sparkles size={28} className="text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Agent G</h2>
              <p className="text-sm text-white/40 mt-1 max-w-xs">
                Your AI director. I coordinate all 17 services and build production pipelines for you.
              </p>
            </div>

            {/* Quick actions */}
            <div className="w-full max-w-lg grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map(a => (
                <button key={a.label} onClick={() => send(a.prompt)}
                  className="text-left px-3.5 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white/90 hover:bg-white/[0.07] hover:border-white/[0.14] transition-all text-[12px] font-medium">
                  {a.label}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : '')}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={13} className="text-white" />
                  </div>
                )}
                <div className={cn('max-w-[75%] space-y-2', msg.role === 'user' ? 'items-end flex flex-col' : '')}>
                  <div className={cn(
                    'px-4 py-3 rounded-2xl text-[13px] leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-cyan-500/20 border border-cyan-400/20 text-white/90 rounded-br-sm'
                      : 'bg-white/[0.04] border border-white/[0.08] text-white/80 rounded-bl-sm',
                  )}>
                    {msg.content}
                  </div>

                  {/* Service suggestions */}
                  {msg.services && msg.services.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {msg.services.map(svcId => {
                        const svc = SERVICE_MAP[svcId];
                        if (!svc) return null;
                        return (
                          <Link key={svcId} href={`/${locale}${svc.href}`}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300 text-[10px] font-semibold hover:bg-cyan-400/[0.14] transition-colors">
                            {svc.emoji} {svc.label} <ChevronRight size={9} />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-xl bg-white/[0.07] border border-white/[0.10] flex items-center justify-center shrink-0 mt-0.5">
                    <User size={13} className="text-white/60" />
                  </div>
                )}
              </motion.div>
            ))}
            {loading && (
              <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                  <Bot size={13} className="text-white" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white/[0.04] border border-white/[0.08] flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-cyan-400" />
                  <span className="text-[12px] text-white/40">Agent G is thinking…</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 py-3">
        {/* Quick action chips (when there are messages) */}
        {messages.length > 0 && (
          <div className="flex gap-2 mb-2.5 overflow-x-auto pb-1 scrollbar-none">
            {QUICK_ACTIONS.slice(0, 4).map(a => (
              <button key={a.label} onClick={() => send(a.prompt)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-white/45 hover:text-white/70 hover:bg-white/[0.07] text-[10px] font-medium transition-all">
                {a.label.split(' ').slice(0, 2).join(' ')}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask Agent G anything… press Enter to send"
              rows={1}
              className="w-full px-4 py-3 pr-10 rounded-2xl border border-white/[0.10] bg-white/[0.04] text-white/80 placeholder:text-white/25 text-[13px] resize-none outline-none focus:border-cyan-400/40 focus:bg-cyan-400/[0.04] transition-all leading-snug"
              style={{ maxHeight: 120 }}
            />
            <button className="absolute right-3 bottom-3 text-white/25 hover:text-white/60 transition-colors">
              <Paperclip size={14} />
            </button>
          </div>
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className={cn(
              'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-all',
              loading || !input.trim()
                ? 'bg-white/[0.04] border border-white/[0.08] text-white/20 cursor-not-allowed'
                : 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-[0_0_16px_rgba(34,211,238,0.4)] hover:shadow-[0_0_24px_rgba(34,211,238,0.55)]',
            )}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
