"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, X, Send, Mic, MicOff, Bot,
  Paperclip, Trash2, Copy, Check, StopCircle, ChevronDown,
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

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
  }, []);

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
            if (data.error) throw new Error(data.error);
          } catch { /* skip */ }
        }
      }
      setSessions(prev => ({ ...prev, [agentId]: (prev[agentId] || []).map(m => m.id === assistantId ? { ...m, content: fullText, model, isStreaming: false } : m) }));
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setSessions(prev => ({ ...prev, [agentId]: (prev[agentId] || []).map(m => m.id === assistantId ? { ...m, content: m.content || "[Stopped]", isStreaming: false } : m) }));
      } else {
        try {
          const fb = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: input.trim(), agentId, history, channel: "web" }) });
          const d = await fb.json();
          const text = d?.data?.response || d?.response || "Error occurred.";
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

  const clearHistory = useCallback(() => { setSessions(prev => ({ ...prev, [activeAgent.id]: [] })); }, [activeAgent.id]);
  const copyMsg = useCallback((content: string, id: string) => { navigator.clipboard?.writeText(content).catch(() => undefined); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }, []);

  if (!isClient) return null;

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all ${isOpen ? "bg-red-500 hover:bg-red-600" : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:scale-110"}`}>
        {isOpen ? <X className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[420px] h-[70vh] max-h-[640px] bg-[#0A0A0A] border border-white/10 rounded-2xl flex flex-col overflow-hidden">
            {/* Header with Agent Selector */}
            <div className="p-3 border-b border-white/10 bg-gradient-to-r from-cyan-600/10 to-blue-600/10">
              <div className="flex items-center justify-between">
                <button onClick={() => setShowAgentPicker(!showAgentPicker)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                  <span className="text-lg">{activeAgent.icon}</span>
                  <span className="text-sm font-medium text-white truncate max-w-[160px]">{activeAgent.name}</span>
                  <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${showAgentPicker ? "rotate-180" : ""}`} />
                </button>
                <button onClick={clearHistory} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-red-400 transition-colors" title="Clear history"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            {/* Agent Picker */}
            <AnimatePresence>
              {showAgentPicker && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b border-white/10 overflow-hidden">
                  <div className="p-2 max-h-[240px] overflow-y-auto">
                    {AGENTS.map(agent => (
                      <button key={agent.id} onClick={() => switchAgent(agent)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${activeAgent.id === agent.id ? "bg-cyan-500/20 text-cyan-400" : "hover:bg-white/5 text-white/70"}`}>
                        <span className="text-lg w-6 text-center">{agent.icon}</span>
                        <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{agent.name}</div><div className="text-xs text-white/30">{agent.service}</div></div>
                        {(sessions[agent.id]?.length || 0) > 0 && <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded-full text-white/50">{sessions[agent.id]!.length}</span>}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && <div className="text-center text-gray-500 mt-8"><Bot className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">{activeAgent.icon} {activeAgent.name}</p><p className="text-xs text-white/20 mt-1">How can I help?</p></div>}
              {messages.map(m => (
                <div key={m.id} className={`group flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
                  <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed ${m.role === "user" ? "bg-cyan-600 text-white" : "bg-white/[0.06] text-gray-200 border border-white/[0.06]"}`}>
                    <div className="whitespace-pre-wrap">{m.content || (m.isStreaming ? "..." : "")}</div>
                    {m.isStreaming && <span className="inline-block w-2 h-4 bg-cyan-400 animate-pulse ml-1" />}
                    {m.model && !m.isStreaming && <div className="text-[10px] text-white/20 mt-1.5">{m.model}</div>}
                  </div>
                  {m.role === "assistant" && !m.isStreaming && (
                    <button onClick={() => copyMsg(m.content, m.id)} className="opacity-0 group-hover:opacity-100 self-start p-1 transition-opacity">
                      {copiedId === m.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-white/30" />}
                    </button>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {/* Input */}
            <div className="p-3 border-t border-white/[0.08]">
              <div className="flex gap-2 items-end">
                <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.pdf,.doc,.docx,.json,.csv,image/*" onChange={handleFile} />
                <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 transition-colors flex-shrink-0" title="Attach file"><Paperclip className="w-4 h-4" /></button>
                <button onClick={toggleRecording} className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isRecording ? "bg-red-500 animate-pulse" : "bg-white/5 hover:bg-white/10 text-white/40"}`} title="Voice">
                  {isRecording ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4" />}
                </button>
                <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} rows={1} className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-cyan-500/50 placeholder:text-white/20" placeholder="Message..." style={{ maxHeight: "120px" }} />
                {isLoading ? (
                  <button onClick={stopGeneration} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex-shrink-0 transition-colors" title="Stop"><StopCircle className="w-5 h-5" /></button>
                ) : (
                  <button onClick={sendMessage} disabled={!input.trim()} className="p-2 rounded-lg bg-cyan-600 text-white disabled:opacity-30 hover:bg-cyan-500 flex-shrink-0 transition-colors"><Send className="w-5 h-5" /></button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
