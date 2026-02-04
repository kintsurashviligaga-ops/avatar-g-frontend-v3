"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Camera, X, Image as ImageIcon, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{
    type: "image" | "file";
    name: string;
    url: string;
  }>;
  timestamp: Date;
  isLoading?: boolean;
}

interface ChatWindowProps {
  serviceName: string;
  serviceId: string;
  onSendMessage?: (message: string, files?: File[]) => void;
  placeholder?: string;
}

export default function ChatWindow({
  serviceName,
  serviceId,
  onSendMessage,
  placeholder,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();

  // Load history from localStorage for this service
  useEffect(() => {
    const saved = localStorage.getItem(`ag.chat.${serviceId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      setMessages(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
    }
  }, [serviceId]);

  // Save history
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`ag.chat.${serviceId}`, JSON.stringify(messages));
    }
  }, [messages, serviceId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;
    if (isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      attachments: attachments.map((file) => ({
        type: file.type.startsWith("image/") ? "image" : "file",
        name: file.name,
        url: URL.createObjectURL(file),
      })),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    // Call real API
    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          history: messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
          language,
          context: { serviceId, serviceName }
        })
      });

      const data = await res.json();
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || (language === "ka" ? "უპასუხოდ დარჩა" : "No response"),
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: language === "ka" 
          ? "შეცდომა მოხდა. სცადეთ თავიდან."
          : "Error occurred. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }

    if (onSendMessage) {
      onSendMessage(input, attachments);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(`ag.chat.${serviceId}`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/30 rounded-xl border border-cyan-500/20 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-cyan-500/20 bg-cyan-500/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-cyan-100">{serviceName}</span>
        </div>
        <button 
          onClick={clearChat}
          className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
        >
          {language === "ka" ? "გასუფთავება" : "Clear"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <Sparkles className="w-8 h-8 text-cyan-500/50 mx-auto" />
              <p className="text-slate-400 text-sm">
                {language === "ka"
                  ? "დაიწყეთ საუბარი AI-თან..."
                  : "Start a conversation with AI..."}
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                  message.role === "user"
                    ? "bg-cyan-500/20 border border-cyan-500/30"
                    : "bg-white/5 border border-slate-700/50"
                }`}
              >
                {message.content && (
                  <p className="text-sm mb-2 whitespace-pre-wrap">{message.content}</p>
                )}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="space-y-2">
                    {message.attachments.map((attachment, idx) => (
                      <div key={idx}>
                        {attachment.type === "image" ? (
                          <img
                            src={attachment.url}
                            alt={attachment.name}
                            className="rounded-lg max-w-full h-auto"
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-xs">
                            <Paperclip className="w-3 h-3" />
                            <span>{attachment.name}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="px-4 py-3 bg-white/5 border border-slate-700/50 rounded-2xl">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-cyan-500/10">
          <div className="flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="relative bg-white/5 border border-cyan-500/20 rounded-lg p-2 flex items-center gap-2"
              >
                {file.type.startsWith("image/") ? (
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Paperclip className="w-4 h-4 text-cyan-400" />
                )}
                <span className="text-xs max-w-[100px] truncate">
                  {file.name}
                </span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="ml-2 text-red-400 hover:text-red-300"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 border-t border-cyan-500/10">
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <input
            type="file"
            ref={cameraInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*"
            capture="environment"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg transition-colors"
            title={language === "ka" ? "ფაილის ატვირთვა" : "Upload file"}
          >
            <Paperclip className="w-5 h-5 text-cyan-400" />
          </button>

          <button
            onClick={() => cameraInputRef.current?.click()}
            className="p-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg transition-colors"
            title={language === "ka" ? "კამერა" : "Camera"}
          >
            <Camera className="w-5 h-5 text-cyan-400" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              placeholder ||
              (language === "ka"
                ? "ჩაწერეთ შეტყობინება..."
                : "Type a message...")
            }
            className="flex-1 bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
          />

          <button
            onClick={handleSend}
            disabled={(!input.trim() && attachments.length === 0) || isLoading}
            className="px-4 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-lg shadow-cyan-500/25"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
