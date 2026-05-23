'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Plus, Copy, Check, Bot, Sparkles, Zap, StopCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import VoicePanel from '@/components/voice/VoicePanel';

interface Msg { id: string; role: 'user' | 'assistant'; text: string; ts: number; }

const SUGGESTIONS = [
  'შექმენი სრული მარკეტინგ კამპანია',
  'გააანალიზე ჩემი ბიზნეს პოტენციალი',
  'შექმენი კონტენტ სტრატეგია სოც.მედიისთვის',
  'დამეხმარე ბრენდის პოზიციონირებაში',
];

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 6px;border-radius:4px;font-size:0.85em">$1</code>')
    .replace(/\n/g, '<br />');
}

function MsgBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(msg.text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex gap-3 px-4 sm:px-6 group', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-1" style={{ background: '#6366f118', border: '1px solid #6366f140' }}>
          <Bot className="w-4 h-4" style={{ color: '#6366f1' }} />
        </div>
      )}
      <div className={cn('max-w-[75%]', isUser ? 'items-end' : 'items-start', 'flex flex-col gap-1')}>
        <div
          className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
          style={isUser
            ? { background: 'linear-gradient(135deg,#6366f1,#38bdf8)', color: '#fff' }
            : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.88)' }
          }
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
        />
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-white/30">{formatTime(msg.ts)}</span>
          {!isUser && (
            <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-white/60">
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-3 px-4 sm:px-6">
      <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: '#6366f118', border: '1px solid #6366f140' }}>
        <Bot className="w-4 h-4" style={{ color: '#6366f1' }} />
      </div>
      <div className="px-4 py-3 rounded-2xl flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
        {[0, 1, 2].map(i => (
          <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-white/40"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
        ))}
      </div>
    </motion.div>
  );
}

export default function AgentGPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'ka';

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionId = useRef(crypto.randomUUID());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg].slice(-120));
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/agent-g/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, locale, sessionId: sessionId.current,
          context: { currentPage: 'agent-g', activeService: 'Agent G', selectedMode: 'agent-g' },
          history: messages.slice(-16).map(m => ({ role: m.role, content: m.text })),
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      const reply = data?.reply ?? data?.response ?? data?.message ?? 'შეცდომა მოხდა.';
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant' as const, text: reply, ts: Date.now() }].slice(-120));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: 'კავშირის შეცდომა. სცადეთ კვლავ.', ts: Date.now() }]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, locale, messages]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg,#0d0d1a 0%,#08080e 100%)' }}>

      <div className="px-4 pt-4 sm:px-6">
        <VoicePanel compact />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#6366f118', border: '1px solid #6366f140' }}>
          <Bot className="w-5 h-5" style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Agent G</h1>
          <p className="text-[11px] text-white/40">AI ორკესტრატორი — ყველა სერვისის კოორდინატორი</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc' }}>
            <Zap className="w-3 h-3" /> 5 credits/msg
          </div>
          {hasMessages && (
            <button onClick={() => setMessages([])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-white/40 hover:text-white hover:bg-white/[0.06] transition-all">
              <Plus className="w-3.5 h-3.5" /> New chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="h-full flex flex-col items-center justify-center px-6 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#6366f118', border: '1px solid #6366f140' }}>
                <Sparkles className="w-8 h-8" style={{ color: '#6366f1' }} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Agent G — AI ორკესტრატორი</h2>
              <p className="text-sm text-white/45 max-w-sm">მე შემიძლია დაგეხმარო ნებისმიერ AI ამოცანაში — მარკეტინგი, სტრატეგია, კონტენტი, ბიზნეს ანალიზი</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left px-4 py-3 rounded-xl text-sm text-white/65 hover:text-white transition-all hover:bg-white/[0.06]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-6 space-y-4">
            {messages.map(msg => <MsgBubble key={msg.id} msg={msg} />)}
            <AnimatePresence>{loading && <TypingIndicator />}</AnimatePresence>
            <div ref={bottomRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 sm:px-6 pb-6 pt-3">
        <div
          className="flex items-end gap-3 p-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="დაწერე შეტყობინება Agent G-ს..."
            rows={1}
            className="flex-1 bg-transparent outline-none resize-none text-sm text-white placeholder-white/30 max-h-40"
            style={{ lineHeight: '1.5' }}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            {loading ? (
              <button onClick={() => abortRef.current?.abort()} className="w-9 h-9 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-400/10 transition-all">
                <StopCircle className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: input.trim() ? 'linear-gradient(135deg,#6366f1,#00d4ff)' : 'rgba(255,255,255,0.06)' }}
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[10px] text-white/20 mt-2">Enter — გაგზავნა · Shift+Enter — ახალი ხაზი</p>
      </div>
    </div>
  );
}
