'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Send, Plus, Mic, Paperclip, Copy, StopCircle, Zap, Check, ChevronRight, Sparkles, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import IntroOverlay from '@/components/intro/IntroOverlay';
import { CommandBar } from '@/components/dashboard/CommandBar';
import CursorGlow from '@/components/ui/CursorGlow';
import { UI_SERVICES, UI_SERVICE_GROUPS, getUiService, type UiService } from '@/lib/services/uiCatalog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  serviceId: string;
}

type Service = UiService;

interface Props {
  locale?: string;
}

const MAX_MESSAGES = 120;

// ─── Service catalogue ────────────────────────────────────────────────────────

const SERVICES: Service[] = UI_SERVICES;
const GROUPS = UI_SERVICE_GROUPS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:4px;font-size:0.875em">$1</code>')
    .replace(/\n/g, '<br />');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ServiceDrawer({
  open,
  activeId,
  onSelect,
  onClose,
}: {
  open: boolean;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.aside
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #0f0f1a 0%, #0a0a14 100%)',
              borderRight: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#0ea5e9,#06b6d4)' }}>
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-white text-sm tracking-wide">MyAvatar</span>
              </div>
              <button onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-white transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Services list */}
            <div className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
              {GROUPS.map(group => {
                const groupServices = SERVICES.filter(s => s.group === group);
                if (!groupServices.length) return null;
                return (
                  <div key={group}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-2 mb-1.5">
                      {group}
                    </p>
                    <div className="space-y-0.5">
                      {groupServices.map(svc => {
                        const Icon = svc.icon;
                        const isActive = svc.id === activeId;
                        return (
                          <button
                            key={svc.id}
                            onClick={() => { onSelect(svc.id); onClose(); }}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150',
                              isActive
                                ? 'text-white'
                                : 'text-white/60 hover:text-white/90 hover:bg-white/5',
                            )}
                            style={isActive ? {
                              background: `linear-gradient(135deg, ${svc.color}22, ${svc.color}11)`,
                              border: `1px solid ${svc.color}40`,
                            } : {}}
                          >
                            <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${svc.color}22` }}>
                              <Icon className="w-3.5 h-3.5" style={{ color: svc.color }} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-tight truncate">{svc.label}</p>
                              {isActive && (
                                <p className="text-[10px] text-white/40 leading-tight mt-0.5 truncate">
                                  {svc.description}
                                </p>
                              )}
                            </div>
                            {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-60" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Drawer footer */}
            <div className="px-4 py-3 border-t border-white/8">
              <div className="flex items-center gap-2 text-white/30 text-xs">
                <Zap className="w-3.5 h-3.5" />
                <span>Powered by Claude AI</span>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function WelcomeScreen({
  service,
  onSuggestion,
}: {
  service: Service;
  onSuggestion: (text: string) => void;
}) {
  const Icon = service.icon;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
        style={{
          background: `linear-gradient(135deg, ${service.color}40, ${service.color}20)`,
          border: `1px solid ${service.color}50`,
          boxShadow: `0 0 40px ${service.color}20`,
        }}
      >
        <Icon className="w-9 h-9" style={{ color: service.color }} />
      </motion.div>

      <motion.h2
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08 }}
        className="text-2xl font-bold text-white mb-2"
      >
        {service.label}
      </motion.h2>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.13 }}
        className="text-white/50 text-sm mb-8 max-w-sm"
      >
        {service.description}
      </motion.p>

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.18 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl"
      >
        {service.suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestion(s)}
            className="px-4 py-3 rounded-2xl text-sm text-left text-white/70 hover:text-white transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = `${service.color}18`;
              (e.currentTarget as HTMLButtonElement).style.borderColor = `${service.color}40`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
            }}
          >
            {s}
          </button>
        ))}
      </motion.div>
    </div>
  );
}

function MessageBubble({
  msg,
  service,
}: {
  msg: Msg;
  service: Service;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = service.icon;
  const isUser = msg.role === 'user';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [msg.text]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={cn('flex gap-3 px-4 sm:px-6 group', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-1"
          style={{ background: `${service.color}22`, border: `1px solid ${service.color}40` }}>
          <Icon className="w-4 h-4" style={{ color: service.color }} />
        </div>
      )}

      {/* Bubble */}
      <div className={cn('max-w-[75%] sm:max-w-[65%] space-y-1', isUser ? 'items-end' : 'items-start', 'flex flex-col')}>
        <div
          className={cn(
            'px-4 py-3 rounded-2xl text-sm leading-relaxed',
            isUser ? 'rounded-tr-sm' : 'rounded-tl-sm',
          )}
          style={isUser ? {
            background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
            color: '#fff',
          } : {
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.9)',
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
        />

        {/* Actions */}
        <div className={cn(
          'flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity',
          isUser ? 'flex-row-reverse' : 'flex-row',
        )}>
          <span className="text-[10px] text-white/25">{formatTime(msg.ts)}</span>
          {!isUser && (
            <button onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors px-2 py-0.5 rounded-md hover:bg-white/5">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function TypingIndicator({ service }: { service: Service }) {
  const Icon = service.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="flex gap-3 px-4 sm:px-6"
    >
      <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-1"
        style={{ background: `${service.color}22`, border: `1px solid ${service.color}40` }}>
        <Icon className="w-4 h-4" style={{ color: service.color }} />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-white/40"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function FullChatWorkspace({ locale = 'ka' }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeServiceId, setActiveServiceId] = useState('agent-g');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [isRecording, setIsRecording] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<{
    start: () => void; stop: () => void;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onend: (() => void) | null;
    lang: string;
    continuous: boolean;
    interimResults: boolean;
  } | null>(null);

  const activeService: Service = useMemo(
    () => getUiService(activeServiceId),
    [activeServiceId],
  );

  const sessionMessages = useMemo(
    () => messages.filter(m => m.serviceId === activeServiceId),
    [messages, activeServiceId],
  );

  useEffect(() => { setIsClient(true); }, []);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  // Speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => typeof recognitionRef.current }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR() as NonNullable<typeof recognitionRef.current>;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) setInput(t);
    };
    rec.onend = () => setIsRecording(false);
    recognitionRef.current = rec;
    return () => {
      rec.onresult = null;
      rec.onend = null;
      try { rec.stop(); } catch { /* already stopped */ }
    };
  }, []);

  const toggleRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (isRecording) {
      rec.stop();
    } else {
      rec.lang = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
      rec.start();
      setIsRecording(true);
    }
  }, [isRecording, locale]);

  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleServiceChange = useCallback((id: string) => {
    setActiveServiceId(id);
    setInput('');
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages(prev => prev.filter(m => m.serviceId !== activeServiceId));
    setInput('');
    abortRef.current?.abort();
  }, [activeServiceId]);

  const sendMessage = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;

    const userMsg: Msg = {
      id: crypto.randomUUID(), role: 'user', text, ts: Date.now(), serviceId: activeServiceId,
    };
    setMessages(prev => { const next = [...prev, userMsg]; return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next; });
    setInput('');
    setLoading(true);

    const history = sessionMessages.slice(-16).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/agent-g/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          locale,
          sessionId,
          context: {
            currentPage: 'dashboard',
            activeService: activeService.label,
            selectedMode: activeServiceId,
          },
          history,
        }),
        signal: controller.signal,
      });

      const data = await res.json();
      const reply: string = data?.reply ?? data?.response ?? data?.message ?? 'An error occurred.';

      const assistantMsg: Msg = {
        id: crypto.randomUUID(), role: 'assistant', text: reply, ts: Date.now(), serviceId: activeServiceId,
      };
      setMessages(prev => { const next = [...prev, assistantMsg]; return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next; });

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errMsg: Msg = {
          id: crypto.randomUUID(), role: 'assistant',
          text: 'კავშირის შეცდომა. გთხოვთ კვლავ სცადოთ.',
          ts: Date.now(), serviceId: activeServiceId,
        };
        setMessages(prev => { const next = [...prev, errMsg]; return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next; });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, activeServiceId, sessionMessages, locale, sessionId, activeService.label]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  if (!isClient) return null;

  const ServiceIcon = activeService.icon;
  const hasMessages = sessionMessages.length > 0;

  return (
    <>
      <IntroOverlay />
      <CursorGlow />
    <div
      className="flex flex-col h-screen w-full overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0d0d1a 0%, #080810 100%)' }}
    >
      {/* ── Service Drawer ─────────────────────────────────────────────── */}
      <ServiceDrawer
        open={drawerOpen}
        activeId={activeServiceId}
        onSelect={handleServiceChange}
        onClose={() => setDrawerOpen(false)}
      />

      {/* ── Top Bar ────────────────────────────────────────────────────── */}
      <header
        className="flex items-center gap-3 px-4 h-14 flex-shrink-0 z-30"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(13,13,26,0.8)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Hamburger */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-white/10 text-white/70 hover:text-white flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Service badge */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${activeService.color}22`, border: `1px solid ${activeService.color}40` }}>
            <ServiceIcon className="w-3.5 h-3.5" style={{ color: activeService.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{activeService.label}</p>
            <p className="text-[10px] text-white/35 hidden sm:block truncate">{activeService.description}</p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <CommandBar onServiceSelect={handleServiceChange} />
          {hasMessages && (
            <button
              onClick={handleNewChat}
              title="New chat"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-white/50 hover:text-white hover:bg-white/8 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Message Area ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {!hasMessages ? (
            <motion.div
              key={`welcome-${activeServiceId}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="h-full flex flex-col"
            >
              <WelcomeScreen service={activeService} onSuggestion={text => sendMessage(text)} />
            </motion.div>
          ) : (
            <motion.div
              key={`msgs-${activeServiceId}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="py-6 space-y-4"
            >
              {sessionMessages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} service={activeService} />
              ))}
              <AnimatePresence>
                {loading && <TypingIndicator service={activeService} />}
              </AnimatePresence>
              <div ref={bottomRef} className="h-4" />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Input Composer ─────────────────────────────────────────────── */}
      <footer
        className="flex-shrink-0 px-4 pb-4 pt-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Service pill */}
        <div className="flex items-center gap-2 mb-2.5 px-1">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full"
            style={{
              background: `${activeService.color}15`,
              border: `1px solid ${activeService.color}35`,
              color: activeService.color,
            }}
          >
            <ServiceIcon className="w-2.5 h-2.5" />
            {activeService.label}
          </span>
          <span className="text-[10px] text-white/20">· Shift+Enter for new line</span>
        </div>

        <div
          className="flex items-end gap-2 rounded-2xl px-3 py-2"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          {/* Attach */}
          <button
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/35 hover:text-white/70 hover:bg-white/8 transition-all flex-shrink-0 mb-0.5"
            title="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeService.label}…`}
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder-white/25 py-1.5 min-h-[36px] max-h-[180px] leading-relaxed"
          />

          {/* Voice */}
          <button
            onClick={toggleRecording}
            title={isRecording ? 'Stop recording' : 'Voice input'}
            className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0 mb-0.5',
              isRecording
                ? 'text-red-400 bg-red-500/15'
                : 'text-white/35 hover:text-white/70 hover:bg-white/8',
            )}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Send / Stop */}
          {loading ? (
            <button
              onClick={() => { abortRef.current?.abort(); setLoading(false); }}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mb-0.5 text-white/50 hover:text-white transition-all hover:bg-white/10"
              title="Stop generation"
            >
              <StopCircle className="w-4.5 h-4.5" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mb-0.5 transition-all duration-200 disabled:opacity-30"
              style={input.trim() ? {
                background: `linear-gradient(135deg, ${activeService.color}, ${activeService.color}cc)`,
                boxShadow: `0 4px 14px ${activeService.color}40`,
                color: '#fff',
              } : {
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.3)',
              }}
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-white/15 mt-2">
          MyAvatar · AI პასუხები შეიძლება შეცდომები შეიცავდეს
        </p>
      </footer>
    </div>
    </>
  );
}
