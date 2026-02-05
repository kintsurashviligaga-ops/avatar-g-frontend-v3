"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Mic, MicOff, Volume2, VolumeX, Loader2, Bot, Paperclip, Camera, Image as ImageIcon } from "lucide-react";

export default function GlobalChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [language, setLanguage] = useState("ka");
  const [showAttach, setShowAttach] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onresult = (event: any) => {
        setInput(event.results[0][0].transcript);
        setIsRecording(false);
      };
      recognitionRef.current.onerror = () => setIsRecording(false);
      recognitionRef.current.onend = () => setIsRecording(false);
    }
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    setMessages(prev => [...prev, { role: "user", content: input }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, language })
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { response: "Error: " + text.slice(0, 100), provider: "Error" };
      }
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response || "No response",
        provider: data.provider
      }]);
      
      if (voiceEnabled && data.response) {
        const u = new SpeechSynthesisUtterance(data.response);
        u.lang = language === "ka" ? "ka-GE" : "en-US";
        speechSynthesis.speak(u);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Error: " + (err as Error).message
      }]);
    }
    
    setIsLoading(false);
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("ხმოვანი შეყვანა არ არის მხარდაჭერილი");
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.lang = language === "ka" ? "ka-GE" : "en-US";
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMessages(prev => [...prev, { role: "user", content: `[File: ${file.name}]` }]);
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center ${isOpen ? "bg-red-500" : "bg-gradient-to-r from-cyan-500 to-blue-600"}`}>
        {isOpen ? <X className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-24 right-6 z-50 w-[380px] h-[500px] bg-[#1A1A1A] border border-white/10 rounded-2xl flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-gradient-to-r from-cyan-600/20 to-blue-600/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-6 h-6 text-cyan-400" />
                  <span className="font-semibold text-white">Avatar G</span>
                </div>
                <div className="flex gap-2">
                  {["ka","en"].map(l => (
                    <button key={l} onClick={() => setLanguage(l)} className={`px-2 py-1 rounded text-xs ${language===l?"bg-cyan-500":"bg-white/10"} text-white`}>{l.toUpperCase()}</button>
                  ))}
                  <button onClick={() => setVoiceEnabled(!voiceEnabled)} className="p-1 rounded bg-white/10 text-white">
                    {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                  <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">რით შემიძლია დაგეხმაროთ?</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[80%] p-3 rounded-xl text-sm ${m.role==="user"?"bg-cyan-600 text-white":"bg-white/10 text-gray-200"}`}>
                    {m.content}
                    {m.provider && <div className="text-xs opacity-50 mt-1">via {m.provider}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Attachments */}
            {showAttach && (
              <div className="flex gap-2 p-2 border-t border-white/10 bg-black/20 justify-center">
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center p-2 rounded bg-white/5 text-white">
                  <Camera className="w-5 h-5 mb-1" />
                  <span className="text-xs">კამერა</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center p-2 rounded bg-white/5 text-white">
                  <ImageIcon className="w-5 h-5 mb-1" />
                  <span className="text-xs">სურათი</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center p-2 rounded bg-white/5 text-white">
                  <Paperclip className="w-5 h-5 mb-1" />
                  <span className="text-xs">ფაილი</span>
                </button>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-2">
                <button onClick={() => setShowAttach(!showAttach)} className="p-2 rounded-lg bg-white/10 text-white">
                  <Paperclip className="w-5 h-5" />
                </button>
                <button onClick={toggleRecording} className={`p-2 rounded-lg ${isRecording?"bg-red-500 animate-pulse":"bg-white/10"} text-white`}>
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <input 
                  value={input} 
                  onChange={e => setInput(e.target.value)}
                  onKeyPress={e => e.key==="Enter" && sendMessage()}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="დაწერეთ..."
                />
                <button onClick={sendMessage} disabled={isLoading} className="p-2 bg-cyan-600 rounded-lg text-white disabled:opacity-50">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} accept="image/*" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
