'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Send, Paperclip, X, Square } from 'lucide-react';
import ChatSidebar from './ChatSidebar';
import { ClarificationMessage } from './ClarificationMessage';
import { ConfirmationCard } from './ConfirmationCard';
import { GenerationProgress, type GenerationStage } from './GenerationProgress';
import { OutputCard } from './OutputCard';
import {
  getConversations,
  getMessages,
  createSession,
  saveMessage,
  deleteSession,
  updateSessionTitle,
  type Conversation,
} from '@/lib/chat-history';
import type { ServiceId } from '@/lib/registry';
import type { ClarificationQuestion } from '@/lib/agent-g-clarifier';

// ─── Types ────────────────────────────────────────────────────────────────────

type PipelineStage =
  | 'idle'
  | 'detecting'
  | 'clarifying'
  | 'confirming'
  | 'generating'
  | 'done';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface PipelineState {
  stage: PipelineStage;
  serviceId?: ServiceId;
  serviceName?: string;
  userInput?: string;
  questions: ClarificationQuestion[];
  currentQuestionIndex: number;
  answers: Record<string, string | string[]>;
  finalPrompt?: string;
  creditCost?: number;
  estimatedSeconds?: number;
  generationStage?: GenerationStage;
  outputUrl?: string;
  outputText?: string;
  outputKind?: 'image' | 'video' | 'audio' | 'text' | 'code';
  tokensUsed?: number;
  cancelled?: boolean;
  userBalance: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUGGESTION_CHIPS = [
  '◉ ავატარი შექმენი',
  '✦ სურათი გამიკეთე',
  '▶ ვიდეოს კონცეფცია',
  '♪ მუსიკა შექმენი',
  '>_ კოდი დამიწერე',
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const GENERATION_STAGE_ORDER: GenerationStage[] = [
  'received', 'processing', 'generating', 'optimizing', 'delivering',
];

// ─── Component ────────────────────────────────────────────────────────────────

interface LocalFile {
  name: string;
  mediaType: string;
  dataUrl: string;
}

interface ChatInterfaceProps {
  locale?: string;
}

export default function ChatInterface({ locale = 'ka' }: ChatInterfaceProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineState>({
    stage: 'idle',
    questions: [],
    currentQuestionIndex: 0,
    answers: {},
    userBalance: 100,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  activeSessionRef.current = activeSessionId;

  // ── Scroll ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pipeline.stage, pipeline.currentQuestionIndex]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    void getConversations('anonymous').then(setConversations);
  }, []);

  // ── Session helpers ──────────────────────────────────────────────────────────
  const addMsg = useCallback((role: 'user' | 'assistant' | 'system', content: string) => {
    const msg: ChatMsg = { id: uid(), role, content };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  const ensureSession = useCallback(async (text: string) => {
    let sessionId = activeSessionRef.current;
    if (!sessionId) {
      sessionId = await createSession('anonymous', 'agent-g', text.slice(0, 60) || 'ახალი ჩატი');
      if (sessionId) {
        setActiveSessionId(sessionId);
        setConversations(prev => [{
          session_id: sessionId!,
          title: text.slice(0, 60) || 'ახალი ჩატი',
          updated_at: new Date().toISOString(),
          agent_id: 'agent-g',
        }, ...prev]);
      }
    }
    return sessionId;
  }, []);

  // ── Pipeline API ─────────────────────────────────────────────────────────────
  const callPipeline = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, locale }),
    });
    return res.json();
  }, [locale]);

  // ── Fallback to Gemini (free-form chat) ──────────────────────────────────────
  const sendToGemini = useCallback(async (userText: string) => {
    setIsLoading(true);
    try {
      abortRef.current = new AbortController();
      const res = await fetch('/api/chat/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: userText }] }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error('Chat error');

      const replyMsg: ChatMsg = { id: uid(), role: 'assistant', content: '' };
      setMessages(prev => [...prev, replyMsg]);

      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          // Handle SSE data: lines
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content ?? parsed.delta ?? parsed.text ?? '';
                if (delta) {
                  full += delta;
                  setMessages(prev => prev.map(m =>
                    m.id === replyMsg.id ? { ...m, content: full } : m
                  ));
                }
              } catch { /* non-JSON line */ }
            }
          }
          // Also handle plain JSON response
          if (!res.headers.get('content-type')?.includes('text/event-stream')) {
            full += chunk;
            setMessages(prev => prev.map(m =>
              m.id === replyMsg.id ? { ...m, content: full } : m
            ));
          }
        }
        // nothing extra needed after stream loop
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        addMsg('assistant', locale === 'ka'
          ? 'სამწუხაროდ, პასუხი ვერ მოვიღე. სცადეთ ახლიდან.'
          : 'Sorry, could not get a response. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [addMsg, locale]);

  // ── Stage: detect intent ──────────────────────────────────────────────────────
  const detectIntent = useCallback(async (userText: string) => {
    setPipeline(p => ({ ...p, stage: 'detecting' }));
    setIsLoading(true);

    try {
      const data = await callPipeline({ action: 'detect_intent', userInput: userText });

      if (!data.detected) {
        // No service intent — forward to Gemini
        addMsg('assistant', data.message ?? '');
        setPipeline(p => ({ ...p, stage: 'idle' }));
        setIsLoading(false);
        return;
      }

      addMsg('assistant', locale === 'ka'
        ? `კარგია! ${data.serviceName} სერვისი ავარჩიე. გვიპასუხე რამდენიმე კითხვაზე:`
        : `Great! I detected the **${data.serviceName}** service. Let me ask a few questions:`);

      setPipeline(p => ({
        ...p,
        stage: 'clarifying',
        serviceId: data.serviceId,
        serviceName: data.serviceName,
        userInput: userText,
        questions: [],
        currentQuestionIndex: 0,
        answers: {},
      }));

      // Fetch all questions
      const qData = await callPipeline({ action: 'get_questions', serviceId: data.serviceId });
      setPipeline(p => ({
        ...p,
        questions: qData.questions ?? [data.firstQuestion],
      }));
    } catch {
      addMsg('assistant', locale === 'ka' ? 'შეცდომა მოხდა.' : 'An error occurred.');
      setPipeline(p => ({ ...p, stage: 'idle' }));
    } finally {
      setIsLoading(false);
    }
  }, [addMsg, callPipeline, locale]);

  // ── Stage: answer clarification question ──────────────────────────────────────
  const handleAnswer = useCallback(async (questionId: string, value: string | string[]) => {
    const newAnswers = { ...pipeline.answers, [questionId]: value };
    const nextIndex = pipeline.currentQuestionIndex + 1;
    const done = nextIndex >= pipeline.questions.length;

    setPipeline(p => ({
      ...p,
      answers: newAnswers,
      currentQuestionIndex: done ? p.currentQuestionIndex : nextIndex,
    }));

    if (!done) return;

    // All answered → confirm
    setPipeline(p => ({ ...p, stage: 'confirming' }));
    setIsLoading(true);

    try {
      const data = await callPipeline({
        action: 'confirm',
        serviceId: pipeline.serviceId,
        userInput: pipeline.userInput,
        answers: newAnswers,
      });

      setPipeline(p => ({
        ...p,
        stage: 'confirming',
        finalPrompt: data.finalPrompt,
        creditCost: data.creditCost,
        estimatedSeconds: data.estimatedSeconds,
      }));
    } catch {
      addMsg('assistant', locale === 'ka' ? 'შეცდომა დადასტურებისას.' : 'Confirmation error.');
      setPipeline(p => ({ ...p, stage: 'idle' }));
    } finally {
      setIsLoading(false);
    }
  }, [pipeline, callPipeline, addMsg, locale]);

  // ── Stage: generate ───────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setPipeline(p => ({
      ...p,
      stage: 'generating',
      generationStage: 'received',
      cancelled: false,
    }));

    // Animate through stages
    const stageInterval = setInterval(() => {
      setPipeline(p => {
        if (p.stage !== 'generating' || p.cancelled) {
          clearInterval(stageInterval);
          return p;
        }
        const idx = GENERATION_STAGE_ORDER.indexOf(p.generationStage ?? 'received');
        if (idx < GENERATION_STAGE_ORDER.length - 2) {
          return { ...p, generationStage: GENERATION_STAGE_ORDER[idx + 1] };
        }
        return p;
      });
    }, Math.max(1500, ((pipeline.estimatedSeconds ?? 10) * 1000) / 4));

    try {
      const data = await callPipeline({
        action: 'generate',
        serviceId: pipeline.serviceId,
        userInput: pipeline.finalPrompt ?? pipeline.userInput,
        answers: pipeline.answers,
      });

      clearInterval(stageInterval);

      // Deduct credits optimistically
      setPipeline(p => ({
        ...p,
        stage: 'done',
        generationStage: 'delivering',
        userBalance: Math.max(0, p.userBalance - (p.creditCost ?? 0)),
        outputUrl: data.result_url ?? data.url ?? (data.outputKind !== 'text' ? data.result : undefined),
        outputText: data.outputKind === 'text' || data.outputKind === 'code' ? data.result : undefined,
        outputKind: data.outputKind,
        tokensUsed: data.tokensUsed,
      }));

      const sessionId = activeSessionRef.current;
      if (sessionId) {
        void saveMessage(sessionId, 'assistant', `[Generated: ${pipeline.serviceId}]`);
        void updateSessionTitle(sessionId, `${pipeline.serviceName} — ${new Date().toLocaleTimeString()}`);
      }
    } catch {
      clearInterval(stageInterval);
      addMsg('assistant', locale === 'ka' ? 'გენერაცია ვერ მოხდა.' : 'Generation failed.');
      setPipeline(p => ({ ...p, stage: 'idle', generationStage: undefined }));
    }
  }, [pipeline, callPipeline, addMsg, locale]);

  const handleCancel = useCallback(() => {
    setPipeline(p => ({ ...p, cancelled: true }));
    abortRef.current?.abort();
    setTimeout(() => {
      setPipeline(p => ({ ...p, stage: 'idle', generationStage: undefined, cancelled: false }));
    }, 1500);
  }, []);

  const handleNewRequest = useCallback(() => {
    setPipeline({
      stage: 'idle',
      questions: [],
      currentQuestionIndex: 0,
      answers: {},
      userBalance: pipeline.userBalance,
    });
  }, [pipeline.userBalance]);

  // ── Main send ─────────────────────────────────────────────────────────────────
  const doSend = useCallback(async () => {
    const text = input.trim();
    if (!text && localFiles.length === 0) return;
    if (isLoading || pipeline.stage !== 'idle') return;

    const sessionId = await ensureSession(text);
    if (sessionId && text) void saveMessage(sessionId, 'user', text);

    addMsg('user', text);
    setInput('');
    setLocalFiles([]);

    await detectIntent(text);
  }, [input, localFiles, isLoading, pipeline.stage, ensureSession, addMsg, detectIntent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  }, [doSend]);

  // ── Sidebar handlers ─────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveSessionId(null);
    setLocalFiles([]);
    setInput('');
    setSidebarOpen(false);
    setPipeline({ stage: 'idle', questions: [], currentQuestionIndex: 0, answers: {}, userBalance: pipeline.userBalance });
  }, [pipeline.userBalance]);

  const handleSelectConversation = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setSidebarOpen(false);
    const msgs = await getMessages(sessionId);
    setMessages(msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content }))
    );
    setPipeline({ stage: 'idle', questions: [], currentQuestionIndex: 0, answers: {}, userBalance: pipeline.userBalance });
  }, [pipeline.userBalance]);

  const handleDeleteConversation = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId);
    setConversations(prev => prev.filter(c => c.session_id !== sessionId));
    if (activeSessionId === sessionId) {
      setMessages([]);
      setActiveSessionId(null);
    }
  }, [activeSessionId]);

  const handleAddFiles = useCallback(async (rawFiles: File[]) => {
    const results: LocalFile[] = await Promise.all(
      rawFiles.map(file => new Promise<LocalFile>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name,
          mediaType: file.type || 'application/octet-stream',
          dataUrl: reader.result as string,
        });
        reader.readAsDataURL(file);
      }))
    );
    setLocalFiles(prev => [...prev, ...results]);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────
  const isEmpty = messages.length === 0 && pipeline.stage === 'idle';
  const currentQuestion = pipeline.questions[pipeline.currentQuestionIndex];

  const inputBlocked = isLoading || pipeline.stage !== 'idle';

  return (
    <div className="flex h-screen bg-[#050b18] overflow-hidden">
      <ChatSidebar
        conversations={conversations}
        activeId={activeSessionId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#070d1e]/80 backdrop-blur-sm shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0">
              <span className="text-cyan-400 text-xs font-bold">G</span>
            </div>
            <div>
              <p className="text-white/90 text-sm font-semibold leading-none">Agent G</p>
              <p className="text-white/40 text-[10px] mt-0.5">MyAvatar.ge · AI Pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Credit badge */}
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              <span className="text-xs font-bold text-cyan-300">{pipeline.userBalance}</span>
              <span className="text-[10px] text-white/40">{locale === 'ka' ? 'კრ.' : 'cr.'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-cyan-400'}`} />
              <span className="text-white/40 text-xs hidden sm:block">
                {isLoading ? (locale === 'ka' ? 'ფიქრობს...' : 'Thinking...') : 'Online'}
              </span>
            </div>
          </div>
        </header>

        {/* Messages + Pipeline cards */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full px-4 py-8">
              <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center mb-4">
                <span className="text-cyan-400 text-2xl font-bold">G</span>
              </div>
              <h2 className="text-white/90 text-xl font-semibold mb-2">
                {locale === 'ka' ? 'გამარჯობა! მე ვარ Agent G' : locale === 'ru' ? 'Привет! Я Agent G' : "Hello! I'm Agent G"}
              </h2>
              <p className="text-white/50 text-sm text-center max-w-sm mb-8">
                {locale === 'ka'
                  ? 'MyAvatar.ge-ის AI ორკესტრატორი — ავატარი, ვიდეო, სურათი, მუსიკა, თამაში, ინტერიერი, prompt, კოდი'
                  : 'AI orchestrator for Avatar, Video, Image, Music, Game, Interior, Prompt & Code'}
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTION_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => setInput(chip + ' ')}
                    className="px-4 py-2 rounded-full bg-white/[0.05] border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/[0.09] hover:border-cyan-400/20 text-sm transition-all"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-2 px-4">
              {/* Conversation history */}
              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role !== 'user' && (
                    <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-cyan-400 text-xs font-bold">G</span>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/15 border border-cyan-400/20 text-white/90'
                        : 'bg-white/[0.05] border border-white/10 text-white/80'
                    }`}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {/* Detecting spinner */}
              {pipeline.stage === 'detecting' && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-cyan-400 text-xs font-bold">G</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-2.5">
                    <span className="text-white/40 text-sm">
                      {locale === 'ka' ? 'ვანალიზებ...' : 'Analyzing...'}
                    </span>
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1 h-1 rounded-full bg-cyan-400/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Clarification questions */}
              <AnimatePresence>
                {pipeline.stage === 'clarifying' && currentQuestion && (
                  <motion.div
                    key={`q-${pipeline.currentQuestionIndex}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-lg"
                  >
                    <ClarificationMessage
                      question={currentQuestion}
                      stepNumber={pipeline.currentQuestionIndex + 1}
                      totalSteps={pipeline.questions.length || 4}
                      locale={locale}
                      onAnswer={handleAnswer}
                      selectedValue={pipeline.answers[currentQuestion.id]}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Confirmation card */}
              <AnimatePresence>
                {pipeline.stage === 'confirming' && pipeline.finalPrompt && pipeline.creditCost !== undefined && (
                  <motion.div
                    key="confirmation"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-lg"
                  >
                    <ConfirmationCard
                      service={pipeline.serviceId!}
                      answers={pipeline.answers}
                      finalPrompt={pipeline.finalPrompt}
                      creditCost={pipeline.creditCost}
                      userBalance={pipeline.userBalance}
                      estimatedSeconds={pipeline.estimatedSeconds ?? 20}
                      locale={locale}
                      onEdit={(field) => {
                        if (field === 'answers') {
                          setPipeline(p => ({
                            ...p,
                            stage: 'clarifying',
                            currentQuestionIndex: 0,
                            answers: {},
                          }));
                        }
                      }}
                      onGenerate={handleGenerate}
                      onCancel={() => setPipeline(p => ({ ...p, stage: 'idle' }))}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Loading confirmation */}
              {pipeline.stage === 'confirming' && !pipeline.finalPrompt && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-cyan-400 text-xs font-bold">G</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-2.5">
                    <span className="text-white/40 text-sm">
                      {locale === 'ka' ? 'prompt-ს ვამზადებ...' : 'Building prompt...'}
                    </span>
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1 h-1 rounded-full bg-cyan-400/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Generation progress */}
              <AnimatePresence>
                {pipeline.stage === 'generating' && (
                  <motion.div
                    key="progress"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-lg"
                  >
                    <GenerationProgress
                      service={pipeline.serviceId!}
                      stage={pipeline.generationStage ?? 'received'}
                      estimatedSeconds={pipeline.estimatedSeconds ?? 20}
                      creditCost={pipeline.creditCost ?? 0}
                      locale={locale}
                      onCancel={handleCancel}
                      cancelled={pipeline.cancelled}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Output card */}
              <AnimatePresence>
                {pipeline.stage === 'done' && (
                  <motion.div
                    key="output"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-lg"
                  >
                    <OutputCard
                      service={pipeline.serviceId!}
                      outputKind={pipeline.outputKind}
                      resultUrl={pipeline.outputUrl}
                      resultText={pipeline.outputText}
                      creditCost={pipeline.creditCost ?? 0}
                      tokensUsed={pipeline.tokensUsed}
                      locale={locale}
                      onNewRequest={handleNewRequest}
                      onDownload={pipeline.outputUrl ? () => {
                        const a = document.createElement('a');
                        a.href = pipeline.outputUrl!;
                        a.download = `myavatar-${pipeline.serviceId}-${Date.now()}`;
                        a.click();
                      } : undefined}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] shrink-0">
          {localFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {localFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-xs text-white/60">
                  <span className="truncate max-w-[120px]">{f.name}</span>
                  <button onClick={() => setLocalFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-white/30 hover:text-white/70 transition-colors ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={`flex items-end gap-2 bg-white/[0.04] border rounded-2xl px-3 py-2 transition-colors ${
            inputBlocked
              ? 'border-white/5 opacity-50'
              : 'border-white/10 focus-within:border-cyan-400/20 focus-within:bg-white/[0.06]'
          }`}>
            <button
              type="button"
              disabled={inputBlocked}
              onClick={() => {
                const picker = document.createElement('input');
                picker.type = 'file'; picker.multiple = true;
                picker.accept = 'image/*,application/pdf,.doc,.docx,.txt';
                picker.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (files) void handleAddFiles(Array.from(files));
                };
                picker.click();
              }}
              className="shrink-0 p-1.5 mb-0.5 rounded-lg text-white/40 hover:text-cyan-400 hover:bg-white/[0.05] transition-colors disabled:pointer-events-none"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={inputBlocked}
              placeholder={
                pipeline.stage !== 'idle'
                  ? (locale === 'ka' ? 'pipeline-ი მიმდინარეობს...' : 'Pipeline in progress...')
                  : (locale === 'ka' ? 'შეიყვანეთ შეტყობინება...' : 'Type a message...')
              }
              rows={1}
              className="flex-1 bg-transparent text-white/90 placeholder-white/30 text-sm resize-none outline-none leading-relaxed py-1 min-h-[28px] max-h-[180px] overflow-y-auto disabled:cursor-not-allowed"
              style={{ scrollbarWidth: 'none' }}
            />

            {isLoading ? (
              <button
                type="button"
                onClick={() => { abortRef.current?.abort(); setIsLoading(false); }}
                className="shrink-0 p-2 mb-0.5 rounded-xl bg-red-500/20 border border-red-400/30 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void doSend()}
                disabled={(!input.trim() && localFiles.length === 0) || inputBlocked}
                className="shrink-0 p-2 mb-0.5 rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="text-white/20 text-[10px] text-center mt-2">
            {locale === 'ka'
              ? 'Agent G ავტომატურად ამოიცნობს სერვისს · Shift+Enter ახალი სტრიქონი'
              : 'Agent G auto-detects the service · Shift+Enter for new line'}
          </p>
        </div>
      </div>
    </div>
  );
}
