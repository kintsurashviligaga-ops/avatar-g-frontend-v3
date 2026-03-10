"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, X, Send, Mic, MicOff, Bot,
  Paperclip, Trash2, Copy, Check, StopCircle, ChevronDown,
  Camera, Sparkles 
} from "lucide-react";
// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  service: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  agentId?: string;
  isStreaming?: boolean;
}

interface SessionStore {
  [agentId: string]: ChatMessage[];
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

function extractRetryAfterSeconds(input: string): number | null {
  const match = input.match(/retry(?:_after)?[^\d]*(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

// ─── Agent List (matches agentRegistry) ─────────────────────────────────────

const AGENTS: AgentInfo[] = [
  { id: "main-assistant", name: "Main Assistant", icon: "◈", service: "general" },
  { id: "executive-agent-g", name: "Executive Agent G", icon: "⬢", service: "agent-g" },
  { id: "business-agent", name: "Business Agent", icon: "📊", service: "business" },
  { id: "video-agent", name: "Video Agent", icon: "▷", service: "video" },
  { id: "image-agent", name: "Image Agent", icon: "◎", service: "image" },
  { id: "audio-agent", name: "Audio Agent", icon: "♪", service: "music" },
  { id: "automation-agent", name: "Automation Agent", icon: "⚡", service: "workflow" },
  { id: "marketplace-agent", name: "Marketplace Agent", icon: "🏪", service: "shop" },
  { id: "research-agent", name: "Research Agent", icon: "🔍", service: "visual-intel" },
  { id: "content-agent", name: "Content Agent", icon: "✍️", service: "text" },
  { id: "social-agent", name: "Social Agent", icon: "📱", service: "media" },
];

const DEFAULT_AGENT: AgentInfo = AGENTS[0] as AgentInfo;

// ─── Component ───────────────────────────────────────────────────────────────

export default function GlobalChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentInfo>(DEFAULT_AGENT);
  const [sessions, setSessions] = useState<SessionStore>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [streamAbort, setStreamAbort] = useState<AbortController | null>(null);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraCaptureBusy, setCameraCaptureBusy] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const messages = sessions[activeAgent.id] || [];
  const messageCount = messages.length;

  useEffect(() => { setIsClient(true); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messageCount]);

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
      if (!SR) return;
      recognitionRef.current = new SR();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) setInput(t); };
      recognitionRef.current.onend = () => setIsRecording(false);
    }
  }, [cameraOn]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [cameraOn]);

  const switchAgent = useCallback((agent: AgentInfo) => {
    setActiveAgent(agent);
    setShowAgentPicker(false);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const agentId = activeAgent.id;
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: "user", content: input.trim(), agentId };
    const history = (sessions[agentId] || []).slice(-20).map(m => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    setStreamAbort(controller);
    const assistantId = `a_${Date.now()}`;
    const streamMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", agentId, isStreaming: true };

    setSessions(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), userMsg, streamMsg] }));
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, messages: [...history, { role: "user", content: input.trim() }], channel: "web" }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let model = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) { fullText += data.token; setSessions(prev => ({ ...prev, [agentId]: (prev[agentId] || []).map(m => m.id === assistantId ? { ...m, content: fullText } : m) })); }
            if (data.done) model = data.model || "";
            if (data.error) {
              const errorText = String(data.error);
              const loweredError = errorText.toLowerCase();
              if (loweredError.includes('throttled') || loweredError.includes('rate limit') || loweredError.includes('quota')) {
                const retryAfterSeconds = extractRetryAfterSeconds(errorText);
                const suffix = retryAfterSeconds ? ` ${retryAfterSeconds}s.` : '.';
                setRateLimitNotice(`Provider is rate-limited. Please retry in${suffix}`);
              }
              throw new Error(errorText);
            }
          } catch { /* skip */ }
        }
      }
      setSessions(prev => ({ ...prev, [agentId]: (prev[agentId] || []).map(m => m.id === assistantId ? { ...m, content: fullText, model, isStreaming: false } : m) }));

      const loweredText = fullText.toLowerCase();
      if (loweredText.includes('throttled') || loweredText.includes('rate limit') || loweredText.includes('quota')) {
        const retryAfterSeconds = extractRetryAfterSeconds(fullText);
        const suffix = retryAfterSeconds ? ` ${retryAfterSeconds}s.` : '.';
        setRateLimitNotice(`Provider is rate-limited. Please retry in${suffix}`);
      } else {
        setRateLimitNotice(null);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setSessions(prev => ({ ...prev, [agentId]: (prev[agentId] || []).map(m => m.id === assistantId ? { ...m, content: m.content || "[Stopped]", isStreaming: false } : m) }));
      } else {
        const baseError = err instanceof Error ? err.message : 'Connection error.';
        const loweredBaseError = baseError.toLowerCase();
        if (loweredBaseError.includes('throttled') || loweredBaseError.includes('rate limit') || loweredBaseError.includes('quota')) {
          const retryAfterSeconds = extractRetryAfterSeconds(baseError);
          const suffix = retryAfterSeconds ? ` ${retryAfterSeconds}s.` : '.';
          setRateLimitNotice(`Provider is rate-limited. Please retry in${suffix}`);
        }

        try {
          const fb = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: input.trim(), agentId, history, channel: "web" }) });
          const d = await fb.json();
          const text = d?.data?.response || d?.response || "Error occurred.";
          const loweredText = String(text).toLowerCase();
          if (loweredText.includes('throttled') || loweredText.includes('rate limit') || loweredText.includes('quota')) {
            const retryAfterSeconds = extractRetryAfterSeconds(String(text));
            const suffix = retryAfterSeconds ? ` ${retryAfterSeconds}s.` : '.';
            setRateLimitNotice(`Provider is rate-limited. Please retry in${suffix}`);
          }
          setSessions(prev => ({ ...prev, [agentId]: (prev[agentId] || []).map(m => m.id === assistantId ? { ...m, content: text, model: d?.data?.model || "", isStreaming: false } : m) }));
        } catch {
          setSessions(prev => ({ ...prev, [agentId]: (prev[agentId] || []).map(m => m.id === assistantId ? { ...m, content: "Connection error.", isStreaming: false } : m) }));
        }
      }
    }
    setIsLoading(false);
    setStreamAbort(null);
  }, [input, isLoading, activeAgent.id, sessions]);

  const stopGeneration = useCallback(() => { streamAbort?.abort(); setStreamAbort(null); setIsLoading(false); }, [streamAbort]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("Max 10MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { const c = typeof reader.result === "string" ? reader.result.slice(0, 8000) : ""; setInput(prev => prev + "\n[Attached: " + file.name + "]\n" + c); };
    if (file.type.startsWith("text/") || file.type === "application/json") { reader.readAsText(file); }
    else { setInput(prev => prev + "\n[Attached: " + file.name + " (" + file.type + ", " + file.size + " bytes)]"); }
    e.target.value = "";
  }, []);

  const toggleRecording = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isRecording) { recognitionRef.current.stop(); }
    else { recognitionRef.current.lang = "ka-GE"; recognitionRef.current.start(); setIsRecording(true); }
  }, [isRecording]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
      setCameraOn(false);
      return;
    }

    try {
      if (!window.isSecureContext) {
        setCameraError('Camera requires a secure HTTPS context.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not supported in this browser.');
        return;
      }
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.onloadedmetadata = () => {
          cameraVideoRef.current?.play().catch(() => undefined);
        };
      }
      setCameraOn(true);
    } catch {
      setCameraError('Unable to access camera. Please check browser permission.');
    }
  }, [cameraOn]);

  const captureCameraFrame = useCallback(() => {
    if (!cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    if (!cameraOn) {
      setCameraError('Camera is off. Turn it on before capture.');
      return;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setCameraError('Camera is still loading. Please wait a moment and retry.');
      return;
    }
    const width = video.videoWidth || Math.max(960, video.clientWidth * 2);
    const height = video.videoHeight || Math.max(540, video.clientHeight * 2);
    if (width <= 0 || height <= 0) {
      setCameraError('Camera frame is not ready yet. Please retry.');
      return;
    }

    setCameraCaptureBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, width, height);
      canvas.toDataURL('image/jpeg', 0.92);
      setCameraError(null);
      setInput((prev) => `${prev}${prev ? '\n' : ''}[Camera frame captured. Analyze composition, lighting and key objects.]`);
    } finally {
      setCameraCaptureBusy(false);
    }
  }, [cameraOn]);

  const clearHistory = useCallback(() => { setSessions(prev => ({ ...prev, [activeAgent.id]: [] })); }, [activeAgent.id]);
  const copyMsg = useCallback((content: string, id: string) => { navigator.clipboard?.writeText(content).catch(() => undefined); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }, []);
  const applyQuickAction = useCallback((prompt: string) => {
    setInput(prompt);
    setShowAgentPicker(false);
  }, []);

  if (!isClient) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200'
        style={{
          backgroundColor: isOpen ? 'rgba(239,68,68,0.8)' : 'var(--color-accent)',
          color: '#fff',
          border: isOpen ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--color-accent)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}
      >
        {isOpen ? <X className="w-5 h-5 text-white" /> : <MessageCircle className="w-5 h-5 text-white" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[420px] h-[70vh] max-h-[640px] max-md:[@media(orientation:landscape)]:bottom-2 max-md:[@media(orientation:landscape)]:right-2 max-md:[@media(orientation:landscape)]:h-[88vh] max-md:[@media(orientation:landscape)]:w-[calc(100vw-16px)] rounded-2xl flex flex-col overflow-hidden backdrop-blur-2xl transition-all" style={{ backgroundColor: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
            <div className="p-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <button onClick={() => setShowAgentPicker(!showAgentPicker)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
                  <span className="text-lg">{activeAgent.icon}</span>
                  <span className="text-sm font-medium truncate max-w-[160px]">{activeAgent.name}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showAgentPicker ? "rotate-180" : ""}`} style={{ color: 'var(--color-text-tertiary)' }} />
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={() => void toggleCamera()} className={`p-2 rounded-lg transition-colors`} style={{ color: cameraOn ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }} title="Camera Access">
                    <Camera className="w-4 h-4" />
                  </button>
                  <button onClick={() => window.location.href = '/services/agent-g'} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--color-text-tertiary)' }} title="Agent Service">
                    <Sparkles className="w-4 h-4" />
                  </button>
                  <button onClick={clearHistory} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--color-text-tertiary)' }} title="Clear history"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
            {/* Agent Picker */}
            <AnimatePresence>
              {showAgentPicker && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="p-2 max-h-[240px] overflow-y-auto">
                    {AGENTS.map(agent => (
                      <button key={agent.id} onClick={() => switchAgent(agent)} className='w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors' style={{ color: activeAgent.id === agent.id ? 'var(--color-accent)' : 'var(--color-text-secondary)', backgroundColor: activeAgent.id === agent.id ? 'var(--color-accent-soft)' : 'transparent' }}>
                        <span className="text-lg w-6 text-center">{agent.icon}</span>
                        <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{agent.name}</div><div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{agent.service}</div></div>
                        {(sessions[agent.id]?.length || 0) > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>{sessions[agent.id]!.length}</span>}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 max-md:[@media(orientation:landscape)]:p-2.5 space-y-3">
              {messages.length === 0 && (
                <div className="mt-6 rounded-2xl p-4" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <div className="text-center">
                    <Bot className="mx-auto mb-2 h-10 w-10" style={{ color: 'var(--color-text-tertiary)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text)' }}>Hi 👋 I'm Agent G.</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Want me to show how the platform works?</p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      'Show AI Tools',
                      'Build Workflow',
                      'Create Avatar',
                      'See Pricing',
                    ].map((item) => (
                      <button
                        key={item}
                        onClick={() => applyQuickAction(item)}
                        className="rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors"
                        style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-border)' }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} className={`group flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
                  <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed`} style={m.role === "user" ? { backgroundColor: 'var(--color-accent)', color: '#fff' } : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                    <div className="whitespace-pre-wrap">{m.content || (m.isStreaming ? "..." : "")}</div>
                    {m.isStreaming && <span className="inline-block w-2 h-4 animate-pulse ml-1" style={{ backgroundColor: 'var(--color-accent)' }} />}
                    {m.model && !m.isStreaming && <div className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-tertiary)' }}>{m.model}</div>}
                  </div>
                  {m.role === "assistant" && !m.isStreaming && (
                    <button onClick={() => copyMsg(m.content, m.id)} className="opacity-0 group-hover:opacity-100 self-start p-1 transition-opacity">
                      {copiedId === m.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />}
                    </button>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              {rateLimitNotice && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2">
                  <p className="text-xs text-amber-100">{rateLimitNotice}</p>
                  <button onClick={() => setRateLimitNotice(null)} className="text-[11px] text-amber-100/80 hover:text-amber-50">Dismiss</button>
                </div>
              )}
              {(cameraOn || cameraError) && (
                <div className="mb-2 rounded-xl p-2 space-y-2" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  {cameraOn ? (
                    <>
                      <div className="relative rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                        <video
                          ref={cameraVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-full max-h-44 rounded-lg object-cover"
                        />
                      </div>
                      <button
                        onClick={captureCameraFrame}
                        disabled={cameraCaptureBusy}
                        className="w-full px-3 py-2 text-xs rounded-lg disabled:opacity-40 transition-colors"
                        style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-border)' }}
                      >
                        Capture
                      </button>
                    </>
                  ) : null}
                  {cameraError ? <p className="text-xs text-red-300">{cameraError}</p> : null}
                </div>
              )}

              <div className="flex gap-2 items-end rounded-xl p-2 transition-all" style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>
                <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.pdf,.doc,.docx,.json,.csv,image/*" onChange={handleFile} />
                <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg transition-colors flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }} title="Attach file"><Paperclip className="w-4 h-4" /></button>
                <button onClick={toggleRecording} className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isRecording ? "bg-red-500 animate-pulse" : ""}`} style={!isRecording ? { color: 'var(--color-text-tertiary)' } : {}} title="Voice">
                  {isRecording ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4" />}
                </button>
                <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} rows={1} className="flex-1 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none" style={{ backgroundColor: 'var(--input-bg)', color: 'var(--color-text)', border: '1px solid var(--input-border)' }} placeholder="Message..." />
                {isLoading ? (
                  <button onClick={stopGeneration} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex-shrink-0 transition-colors" title="Stop"><StopCircle className="w-5 h-5" /></button>
                ) : (
                  <button onClick={sendMessage} disabled={!input.trim()} className="p-2 rounded-lg disabled:opacity-30 flex-shrink-0 transition-colors" style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}><Send className="w-5 h-5" /></button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
