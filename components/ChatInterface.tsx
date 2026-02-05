"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Image as ImageIcon, Paperclip, Bot, User, Loader2 } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: "გამარჯობა! მე ვარ Avatar G AI ასისტენტი. რით შემიძლია დაგეხმაროთ?", timestamp: new Date() },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage: Message = { id: Date.now().toString(), role: "user", content: input, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setTimeout(() => {
      const aiMessage: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: "ეს არის სიმულაციური პასუხი. რეალურ API ინტეგრაციაში აქ უნდა ჩაერთოს თქვენი AI სერვისი.", timestamp: new Date() };
      setMessages((prev) => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full bg-black/30 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div key={message.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.role === "user" ? "bg-gradient-to-br from-cyan-500 to-blue-600" : "bg-gradient-to-br from-purple-500 to-pink-500"}`}>
                {message.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
              </div>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${message.role === "user" ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30" : "bg-white/5 border border-white/10"}`}>
                <p className="text-gray-200 text-sm leading-relaxed">{message.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
            <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              <span className="text-gray-400 text-sm">ფიქრობ...</span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-white/10 bg-black/20">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="დაწერე შენი შეკითხვა..." rows={1} className="w-full px-4 py-3 pr-24 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 resize-none focus:outline-none focus:border-cyan-500/50" style={{ minHeight: "48px", maxHeight: "120px" }} />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <button className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"><Paperclip className="w-4 h-4" /></button>
              <button className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"><ImageIcon className="w-4 h-4" /></button>
              <button className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"><Mic className="w-4 h-4" /></button>
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSend} disabled={!input.trim() || isLoading} className="p-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl disabled:opacity-50">
            <Send className="w-5 h-5" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
