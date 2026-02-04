"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Mic, MicOff, Volume2, VolumeX, Trash2, Bot, Loader2 } from "lucide-react";

interface Message { id: string; role: "user" | "assistant"; content: string; timestamp: Date; }

type AIProvider = "openrouter" | "gemini" | "groq" | "deepseek" | "xai";
const providers = [
  { id: "openrouter" as AIProvider, name: "Claude 3.5", icon: "🧠", color: "from-violet-500 to-purple-600" },
  { id: "gemini" as AIProvider, name: "Gemini Pro", icon: "💎", color: "from-blue-500 to-cyan-500" },
  { id: "groq" as AIProvider, name: "Mixtral", icon: "⚡", color: "from-amber-500 to-orange-500" },
  { id: "deepseek" as AIProvider, name: "DeepSeek", icon: "🔮", color: "from-emerald-500 to-teal-500" },
  { id: "xai" as AIProvider, name: "Grok", icon: "🚀", color: "from-red-500 to-pink-500" },
];

export default function GlobalChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>("openrouter");
  const [showProviders, setShowProviders] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ id: "welcome", role: "assistant", content: "გამარჯობა! 👋 მე ვარ Avatar G-ს AI ასისტენტი.\n\n• 💬 საუბარი 5 AI მოდელით\n• 🎙️ ხმოვანი შეყვანა\n• 🔊 ხმოვანი პასუხი\n• 🖼️ სურათების გენერაცია\n\nაირჩიეთ AI მოდელი ზედა მარჯვენა კუთხეში!", timestamp: new Date() }]);
    }
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage: Message = { id: Date.now().toString(), role: "user", content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(`/api/${selectedProvider}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: input }) });
      const data = await response.json();
      const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: data.response || "ბოდიში, რაღაც შეცდომა მოხდა.", timestamp: new Date() };
      setMessages(prev => [...prev, assistantMessage]);
      if (!isMuted) speak(data.response);
    } catch (error) {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "ბოდიში, კავშირის პრობლემაა.", timestamp: new Date() }]);
    } finally { setIsLoading(false); }
  };

  const speak = async (text: string) => {
    try {
      setIsSpeaking(true);
      const response = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!response.ok) throw new Error("TTS failed");
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(audioUrl); };
      await audio.play();
    } catch (error) { setIsSpeaking(false); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", audioBlob);
        try {
          const response = await fetch("/api/stt", { method: "POST", body: formData });
          const data = await response.json();
          if (data.text) { setInput(data.text); setTimeout(() => handleSend(), 100); }
        } catch (error) { console.error("STT error:", error); }
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) { alert("მიკროფონზე წვდომა არ არის."); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const clearChat = () => setMessages([{ id: "welcome", role: "assistant", content: "გამარჯობა! მე ვარ Avatar G-ს AI ასისტენტი.", timestamp: new Date() }]);
  const currentProvider = providers.find(p => p.id === selectedProvider);

  return (
    <>
      <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setIsOpen(!isOpen)} className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {isOpen ? <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><X className="w-6 h-6" /></motion.div> : <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><MessageCircle className="w-6 h-6" /></motion.div>}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} className="fixed bottom-24 right-6 z-50 w-[420px] max-w-[calc(100vw-48px)] h-[600px] max-h-[calc(100vh-120px)] rounded-2xl bg-[#0a0f1a]/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 to-blue-500/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"><Bot className="w-5 h-5 text-white" /></div>
                <div><h3 className="font-semibold text-white">Agent G</h3><p className="text-xs text-gray-400">AI ასისტენტი</p></div>
              </div>
              <div className="relative">
                <button onClick={() => setShowProviders(!showProviders)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r ${currentProvider?.color} text-white`}><span>{currentProvider?.icon}</span><span className="hidden sm:inline">{currentProvider?.name}</span></button>
                <AnimatePresence>
                  {showProviders && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute right-0 top-full mt-2 w-48 bg-[#1a1f2e] rounded-xl border border-white/10 shadow-xl overflow-hidden">
                      {providers.map((provider) => <button key={provider.id} onClick={() => { setSelectedProvider(provider.id); setShowProviders(false); }} className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${selectedProvider === provider.id ? "bg-white/10" : ""}`}><span className="text-lg">{provider.icon}</span><p className="text-sm text-white font-medium">{provider.name}</p></button>)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => <motion.div key={message.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === "user" ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white" : "bg-white/10 text-gray-200 border border-white/5"}`}><p className="text-sm whitespace-pre-wrap">{message.content}</p><span className="text-xs opacity-50 mt-1 block">{message.timestamp.toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" })}</span></div></motion.div>)}
              {isLoading && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start"><div className="bg-white/10 rounded-2xl px-4 py-3 flex items-center gap-2"><Loader2 className="w-4 h-4 text-cyan-400 animate-spin" /><span className="text-sm text-gray-400">AI ფიქრობს...</span></div></motion.div>}
              {isSpeaking && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center"><div className="bg-cyan-500/20 rounded-full px-3 py-1 flex items-center gap-2 text-xs text-cyan-400"><Volume2 className="w-3 h-3 animate-pulse" />საუბრობს...</div></motion.div>}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-white/10 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1"><input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="შეიყვანეთ ტექსტი..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50" /></div>
                <button onClick={isRecording ? stopRecording : startRecording} className={`p-2.5 rounded-lg transition-colors ${isRecording ? "bg-red-500/20 text-red-400 animate-pulse" : "hover:bg-white/10 text-gray-400 hover:text-white"}`}>{isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}</button>
                <button onClick={handleSend} disabled={!input.trim() || isLoading} className="p-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-400 hover:to-blue-500 transition-colors"><Send className="w-5 h-5" /></button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsMuted(!isMuted)} className={`p-1.5 rounded-lg transition-colors ${isMuted ? "bg-red-500/20 text-red-400" : "hover:bg-white/10 text-gray-400 hover:text-white"}`}>{isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
                  <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
                <span className="text-xs text-gray-500">Enter-ით გაგზავნა</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
