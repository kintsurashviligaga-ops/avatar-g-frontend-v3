"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Mic, MicOff, Volume2, VolumeX, Loader2, Bot, User } from "lucide-react";

export default function GlobalChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [language, setLanguage] = useState("ka");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMsg = { id: Date.now(), role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, language })
      });
      
      const data = await res.json();
      
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "assistant",
        content: data.response || "Error",
        provider: data.provider
      }]);
      
      if (voiceEnabled && data.response) {
        const u = new SpeechSynthesisUtterance(data.response);
        u.lang = language === "ka" ? "ka-GE" : "en-US";
        speechSynthesis.speak(u);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "assistant",
        content: "Error: " + (err as Error).message
      }]);
    }
    
    setIsLoading(false);
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white shadow-lg">
        {isOpen ? <X /> : <MessageCircle />}
      </button>
      
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 h-[500px] bg-[#1A1A1A] border border-white/10 rounded-2xl flex flex-col">
          <div className="p-4 border-b border-white/10 flex justify-between items-center">
            <h3 className="text-white font-bold">Avatar G Assistant</h3>
            <div className="flex gap-2">
              {["ka","en","ru"].map(l => (
                <button key={l} onClick={() => setLanguage(l)} className={`px-2 py-1 rounded text-xs ${language===l?"bg-cyan-500":"bg-white/10"} text-white`}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                <div className={`max-w-[80%] p-3 rounded-xl ${m.role==="user"?"bg-cyan-600":"bg-white/10"} text-white text-sm`}>
                  {m.content}
                  {m.provider && <div className="text-xs opacity-50 mt-1">via {m.provider}</div>}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="p-4 border-t border-white/10 flex gap-2">
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key==="Enter" && sendMessage()}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="Type message..."
            />
            <button onClick={sendMessage} disabled={isLoading} className="p-2 bg-cyan-600 rounded-lg text-white">
              {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
