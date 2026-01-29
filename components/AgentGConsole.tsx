"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, X, Mic, Paperclip, Image as ImageIcon, Video, Camera, FileText } from "lucide-react";

interface Message {
  id: string;
  type: "user" | "agent";
  text: string;
  attachments?: Attachment[];
  timestamp: Date;
}

interface Attachment {
  id: string;
  name: string;
  type: "image" | "video" | "file";
  url: string;
  file?: File;
}

type AgentState = "idle" | "listening" | "thinking" | "speaking";

export default function AgentGConsole() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "agent",
      text: "გამარჯობა. მე ვარ Agent G, თქვენი პერსონალური AI ასისტენტი. როგორ შემიძლია დაგეხმაროთ დღეს?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [isClient, setIsClient] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setIsClient(true); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 112)}px`;
    }
  }, [input]);

  useEffect(() => {
    return () => {
      attachments.forEach((att) => { if (att.url.startsWith("blob:")) URL.revokeObjectURL(att.url); });
    };
  }, [attachments]);

  const handleSend = useCallback(() => {
    if (!input.trim() && attachments.length === 0) return;
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      type: "user",
      text: input,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    attachments.forEach((att) => { if (att.url.startsWith("blob:")) URL.revokeObjectURL(att.url); });
    setAttachments([]);
    setAgentState("thinking");
    setTimeout(() => {
      setAgentState("speaking");
      setMessages((prev) => [...prev, {
        id: `agent-${Date.now()}`,
        type: "agent",
        text: "მესმის. ვამუშავებ თქვენს მოთხოვნას. ეს არის დემონსტრაციული პასუხი Agent G-სგან.",
        timestamp: new Date(),
      }]);
      setTimeout(() => setAgentState("idle"), 2000);
    }, 1500);
  }, [input, attachments]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: Attachment["type"]) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      setAttachments((prev) => [...prev, { id: `att-${Math.random().toString(36).substr(2, 9)}`, name: file.name, type, url, file }]);
    });
    e.target.value = "";
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att && att.url.startsWith("blob:")) URL.revokeObjectURL(att.url);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const toggleRecording = useCallback(() => {
    setIsRecording((prev) => { const newState = !prev; setAgentState(newState ? "listening" : "idle"); return newState; });
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  if (!isClient) {
    return (
      <div className="grid lg:grid-cols-5 gap-4 sm:gap-6 h-[600px] lg:h-[600px]">
        <div className="hidden lg:block lg:col-span-2 rounded-3xl bg-[#0E1116] border border-white/10 animate-pulse" />
        <div className="lg:col-span-3 rounded-3xl bg-[#0E1116] border border-white/10 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-5 gap-4 sm:gap-6 h-[600px] lg:h-[600px]">
      <div className="hidden lg:block lg:col-span-2">
        <div className="relative h-full rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-b from-[#0E1116] to-[#121722] border border-white/10">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <motion.div
                className="w-40 h-40 sm:w-48 sm:h-48 mx-auto mb-4 sm:mb-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-white/10 flex items-center justify-center relative overflow-hidden"
                animate={{ scale: agentState === "speaking" ? [1, 1.02, 1] : 1 }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/20 to-transparent" />
                <span className="text-5xl sm:text-6xl" role="img" aria-label="Agent G">🤵</span>
                {agentState === "listening" && (
                  <motion.div className="absolute inset-0 border-4 border-blue-500 rounded-full" animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} />
                )}
                {agentState === "speaking" && (
                  <motion.div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div key={i} className="w-1 sm:w-1.5 h-3 sm:h-4 bg-green-400 rounded-full" animate={{ height: [12, 24, 12] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }} />
                    ))}
                  </motion.div>
                )}
              </motion.div>
              <h3 className="text-white font-semibold mb-1 text-lg">Agent G</h3>
              <p className="text-sm text-gray-500">
                {agentState === "idle" && "მზად ვარ დასახმარებლად"}
                {agentState === "listening" && "მიგიგნიათ..."}
                {agentState === "thinking" && "ვფიქრობ..."}
                {agentState === "speaking" && "მპასუხობ..."}
              </p>
            </div>
          </div>
          <div className="absolute top-3 sm:top-4 left-3 sm:left-4 flex gap-2">
            <div className={`w-2 h-2 rounded-full ${agentState === "listening" ? "bg-blue-500 animate-pulse" : agentState === "speaking" ? "bg-green-500" : "bg-gray-600"}`} />
            <span className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider">{agentState}</span>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 flex flex-col h-full rounded-2xl sm:rounded-3xl overflow-hidden bg-[#0E1116] border border-white/10">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 bg-[#121722]">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center lg:hidden">
              <span className="text-lg sm:text-xl" role="img" aria-label="Agent G">🤵</span>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm sm:text-base">Agent G Console</h3>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-500">
                <span className={`w-1.5 h-1.5 rounded-full ${agentState === "idle" ? "bg-green-500" : "bg-blue-500 animate-pulse"}`} />
                {agentState === "idle" ? "ონლაინ" : agentState === "listening" ? "მოსმენა..." : "მუშაობს..."}
              </div>
            </div>
          </div>
          <button className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50" aria-label="პარამეტრები">
            <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 sm:space-y-4 min-h-0">
          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] sm:max-w-[80%] ${msg.type === "user" ? "bg-cyan-600 text-white rounded-2xl rounded-br-sm" : "bg-[#1A2230] text-[#EAF0FF] rounded-2xl rounded-bl-sm border border-white/5"} p-3 sm:p-4`}>
                  {msg.text && <p className="text-xs sm:text-sm leading-relaxed">{msg.text}</p>}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 sm:mt-3 flex flex-wrap gap-2">
                      {msg.attachments.map((att) => (
                        <div key={att.id} className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-black/30 text-[10px] sm:text-xs">
                          {att.type === "image" && <ImageIcon className="w-3 h-3" />}
                          {att.type === "video" && <Video className="w-3 h-3" />}
                          {att.type === "file" && <FileText className="w-3 h-3" />}
                          <span className="truncate max-w-[80px] sm:max-w-[100px]">{att.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="px-3 sm:px-4 py-2 border-t border-white/5 flex flex-wrap gap-2 max-h-16 overflow-y-auto">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-[#1A2230] border border-white/10 text-[10px] sm:text-xs text-[#A7B3CC]">
                  {att.type === "image" && <ImageIcon className="w-3 h-3" />}
                  {att.type === "video" && <Video className="w-3 h-3" />}
                  {att.type === "file" && <FileText className="w-3 h-3" />}
                  <span className="truncate max-w-[100px] sm:max-w-[120px]">{att.name}</span>
                  <button onClick={() => removeAttachment(att.id)} className="ml-1 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50 rounded" aria-label="წაშლა"><X className="w-3 h-3" /></button>
                </div>
              ))}
              {attachments.length > 3 && <span className="text-[10px] sm:text-xs text-gray-500 self-center">+{attachments.length - 3} სხვა</span>}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-3 sm:p-4 border-t border-white/5 bg-[#121722]">
          <div className="flex items-center gap-1 sm:gap-2 mb-2 sm:mb-3 px-1 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
            <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelect(e, "file")} className="hidden" multiple aria-label="ფაილის არჩევა" />
            <input type="file" ref={imageInputRef} accept="image/*" onChange={(e) => handleFileSelect(e, "image")} className="hidden" aria-label="სურათის არჩევა" />
            <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" onChange={(e) => handleFileSelect(e, "image")} className="hidden" aria-label="კამერა" />
            <input type="file" ref={videoInputRef} accept="video/*" capture="environment" onChange={(e) => handleFileSelect(e, "video")} className="hidden" aria-label="ვიდეო" />
            <ActionButton icon={<Paperclip className="w-3.5 h-3.5 sm:w-4 sm:h-4" />} onClick={() => fileInputRef.current?.click()} label="ფაილი" />
            <ActionButton icon={<ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />} onClick={() => imageInputRef.current?.click()} label="სურათი" />
            <ActionButton icon={<Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />} onClick={() => cameraInputRef.current?.click()} label="კამერა" />
            <ActionButton icon={<Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />} onClick={() => videoInputRef.current?.click()} label="ვიდეო" />
            <div className="flex-1 min-w-[8px]" />
            <ActionButton icon={<Mic className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRecording ? "text-red-400 animate-pulse" : ""}`} />} onClick={toggleRecording} label={isRecording ? "მიგიგნიათ..." : "ხმა"} active={isRecording} />
          </div>

          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ჰკითხე Agent G-ს..."
              className="flex-1 bg-[#0E1116] border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-[#EAF0FF] placeholder-[#A7B3CC]/50 text-xs sm:text-sm resize-none focus:outline-none focus:border-cyan-500/30 transition-colors min-h-[44px] sm:min-h-[48px] max-h-28"
              rows={1}
              aria-label="შეტყობინება"
            />
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSend} disabled={!input.trim() && attachments.length === 0} className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50" aria-label="გაგზავნა">
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
          </div>
          <p className="mt-1.5 sm:mt-2 text-[9px] sm:text-[10px] text-[#A7B3CC]/50 text-center">Enter-ით გაგზავნა, Shift+Enter ახალი ხაზი</p>
        </div>
      </div>

      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <motion.div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg border-2 border-white/20" animate={{ scale: agentState !== "idle" ? [1, 1.1, 1] : 1 }} transition={{ duration: 1, repeat: Infinity }}>
          <span className="text-base sm:text-xl" role="img" aria-label="Agent G">🤵</span>
        </motion.div>
      </div>
    </div>
  );
}

function ActionButton({ icon, onClick, label, active = false }: { icon: React.ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onClick} className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500/50 ${active ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-white/5 text-[#A7B3CC] hover:bg-white/10 hover:text-white border border-transparent"}`} aria-label={label}>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </motion.button>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
