"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Mic, MicOff, Trash2, Volume2, VolumeX } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { usePathname } from "next/navigation";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const STORE_KEY = "ag.chatbot.history";

export default function GlobalChatbot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const { language } = useLanguage();
  const pathname = usePathname();
  const endRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const parts = pathname?.split("/").filter(Boolean) || [];
  const serviceCtx = parts[0] === "workspace" ? null : parts[0] || null;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setMsgs(JSON.parse(raw).slice(-40));
    } catch {}
  }, []);

  useEffect(() => {
    if (msgs.length > 0) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-40))); } catch {}
    }
  }, [msgs]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const send = async (text?: string) => {
    const txt = text || input.trim();
    if (!txt || loading) return;
    setInput("");
    const userMsg: ChatMsg = { id: "u_" + Date.now(), role: "user", content: txt };
    setMsgs(p => [...p, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: txt,
          serviceContext: serviceCtx,
          language,
          history: [...msgs.slice(-6), userMsg].map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const botText = data.text || (language === "ka" ? "შეცდომა" : "No response");
      
      setMsgs(p => [...p, {
        id: "a_" + Date.now(),
        role: "assistant",
        content: botText,
      }]);

      if (voiceEnabled) {
        speakText(botText);
      }
    } catch {
      setMsgs(p => [...p, {
        id: "a_" + Date.now(),
        role: "assistant",
        content: language === "ka"
          ? "AI სერვისი დროებით მიუწვდომელია."
          : "AI service temporarily unavailable.",
      }]);
    }
    setLoading(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic error:", err);
      alert(language === "ka" ? "მიკროფონი არ არის" : "Microphone denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");

      const res = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("STT failed");
      const data = await res.json();
      const transcript = data.text || "";

      if (transcript) {
        setInput(transcript);
        send(transcript);
      }
    } catch (err) {
      console.error("Transcription error:", err);
      alert(language === "ka" ? "ვერ გაიგო" : "Could not transcribe");
    }
    setLoading(false);
  };

  const speakText = async (text: string) => {
    if (!text || isSpeaking) return;
    setIsSpeaking(true);

    try {
      const res = await fetch("/api/voice-lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          language,
          params: {
            voiceId: "EXAVITUz85b5ad8b6187",
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      const data = await res.json();
      const audioUrl = data.output?.files?.[0]?.url;

      if (audioUrl && audioUrl.startsWith("data:")) {
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.play();
        }
      } else if (data.fallback) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language === "ka" ? "ka-GE" : "en-US";
        utterance.onend = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
        return;
      }
    } catch (err) {
      console.error("TTS error:", err);
    }
    setIsSpeaking(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearHistory = () => {
    setMsgs([]);
    try { localStorage.removeItem(STORE_KEY); } catch {}
  };

  const toggleVoice = () => setVoiceEnabled(p => !p);

  return (
    <div className="fixed bottom-4 right-4 z-[1000] flex flex-col items-end">
      <audio ref={audioRef} onEnded={() => setIsSpeaking(false)} className="hidden" />
      
      {open ? (
        <div className="w-[370px] max-w-[calc(100vw-2rem)] h-[500px] flex flex-col rounded-2xl border border-cyan-500/30 bg-[#05070A]/95 backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-white/5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm font-semibold text-cyan-300">Agent G</span>
              {serviceCtx && serviceCtx !== "workspace" && (
                <span className="text-xs text-slate-500 ml-1">• {serviceCtx.replace(/-/g, " ")}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggleVoice} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              <button onClick={clearHistory} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-slate-500 hover:text-red-400" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {msgs.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <p className="text-slate-500 text-xs text-center px-4 leading-relaxed">
                  {language === "ka"
                    ? "გამარჯობა! მე ვარ Agent G."
                    : "Hello! I'm Agent G, your AI assistant."}
                </p>
              </div>
            )}
            {msgs.map(m => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-cyan-500/20 border border-cyan-500/30 text-white"
                    : "bg-white/5 border border-slate-700/40 text-slate-300"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2.5 rounded-xl bg-white/5 border border-slate-700/40">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="p-3 border-t border-cyan-500/20 bg-white/5 flex-shrink-0">
            <div className="flex gap-2">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={loading}
                className={`px-3 py-2 rounded-lg transition-colors flex-shrink-0 ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-400"
                    : "bg-white/10 hover:bg-white/15 border border-cyan-500/20"
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-cyan-400" />}
              </button>

              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={language === "ka" ? "შეტყობინება..." : "Message..."}
                className="flex-1 bg-white/5 border border-cyan-500/20 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 min-w-0"
              />

              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="px-3 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full bg-cyan-500 hover:bg-cyan-400 shadow-lg shadow-cyan-500/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </button>
      )}
    </div>
  );
}
