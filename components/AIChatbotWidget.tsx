"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Mic, Volume2, VolumeX, Loader2, Sparkles, StopCircle, AlertCircle } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useVoiceRecognition } from "@/lib/hooks/useVoiceRecognition";
import { useTextToSpeech } from "@/lib/hooks/useTextToSpeech";
import Image from "next/image";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  source?: string;
}

export default function AIChatbotWidget() {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [apiStatus, setApiStatus] = useState<"gemini" | "fallback" | "error">("gemini");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { isListening, transcript, isSupported: voiceSupported, startListening, stopListening } = useVoiceRecognition(language);
  const { speak, stop: stopSpeaking, isSpeaking, isSupported: ttsSupported } = useTextToSpeech(language);

  useEffect(() => {
    if (transcript && !isListening) {
      setInput(transcript);
    }
  }, [transcript, isListening]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("Network response was not ok: " + response.status);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "ბოდიში, პასუხის მიღება ვერ მოხერხდა.",
        timestamp: new Date(),
        source: data.source,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setApiStatus(data.source === "gemini" ? "gemini" : "fallback");

      // Voice output
      if (voiceEnabled && ttsSupported && data.response) {
        setTimeout(() => speak(data.response), 300);
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      
      let errorMessage = language === "ka" 
        ? "ბოდიში, დროებითი პრობლემა მოხდა 😅\n\nგთხოვთ სცადოთ:\n• თავიდან გაგზავნოთ\n• განაახლოთ გვერდი" 
        : "Sorry, a temporary issue occurred 😅\n\nPlease try:\n• Resend message\n• Refresh page";
      
      if (error.name === "AbortError") {
        errorMessage = language === "ka"
          ? "პასუხის მიღება დიდხანს გაგრძელდა ⏱️\n\nსცადეთ:\n• მოკლე შეკითხვა\n• თავიდან გაგზავნა"
          : "Response took too long ⏱️\n\nTry:\n• Shorter question\n• Resend";
      }

      const errorResponseMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: errorMessage,
        timestamp: new Date(),
        source: "error",
      };
      setMessages((prev) => [...prev, errorResponseMessage]);
      setApiStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const toggleVoice = () => {
    if (isListening) {
      stopListening();
    } else {
      if (isSpeaking) {
        stopSpeaking();
      }
      startListening();
    }
  };

  const quickQuestions = language === "ka" 
    ? [
        "რა სერვისები გაქვთ?",
        "როგორ გამოვიყენო?",
        "რა ღირს Agent G?",
      ]
    : [
        "What services do you offer?",
        "How do I use it?",
        "What's the price?",
      ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center z-50 group"
        aria-label="Open AI Chat"
      >
        <MessageSquare className="w-7 h-7 text-white" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] bg-[#05070A] border border-cyan-500/30 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-b border-cyan-500/30 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-1 flex-shrink-0">
            <Image src="/logo.jpg" alt="Avatar G" fill className="object-contain" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Agent G
            </h3>
            <div className="flex items-center gap-2">
              <span className={'w-2 h-2 rounded-full animate-pulse ' + (apiStatus === "gemini" ? "bg-green-400" : apiStatus === "fallback" ? "bg-yellow-400" : "bg-orange-400")} />
              <p className="text-xs text-slate-400">
                {apiStatus === "gemini" ? "Gemini AI" : apiStatus === "fallback" ? "Smart Mode" : "Basic Mode"}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-cyan-400" />
            </div>
            <h4 className="text-lg font-semibold mb-2">
              {language === "ka" ? "გამარჯობა! 👋" : "Hello! 👋"}
            </h4>
            <p className="text-sm text-slate-400 mb-4">
              {language === "ka" 
                ? "მე ვარ Agent G, Avatar G-ის AI ასისტენტი.\nროგორ შემიძლია დაგეხმაროთ?" 
                : "I'm Agent G, Avatar G's AI assistant.\nHow can I help you?"}
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-xs transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={"flex gap-3 " + (message.role === "user" ? "justify-end" : "justify-start")}
          >
            {message.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
                {message.source === "error" ? (
                  <AlertCircle className="w-4 h-4 text-orange-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                )}
              </div>
            )}
            <div
              className={
                "max-w-[75%] rounded-2xl px-4 py-3 " +
                (message.role === "user"
                  ? "bg-cyan-500 text-white"
                  : "bg-white/5 border border-cyan-500/20 text-slate-200")
              }
            >
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
              <span className="text-xs opacity-50 mt-1 block">
                {message.timestamp.toLocaleTimeString(language === "ka" ? "ka-GE" : "en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            </div>
            <div className="bg-white/5 border border-cyan-500/20 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-cyan-500/30 p-4 bg-[#05070A]">
        <div className="flex gap-2 mb-2">
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              className={
                "p-2 rounded-lg transition-all " +
                (isListening
                  ? "bg-red-500 text-white animate-pulse scale-110"
                  : "bg-white/5 hover:bg-white/10 text-slate-400")
              }
              title={language === "ka" ? "ხმოვანი შეყვანა" : "Voice input"}
            >
              {isListening ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          {ttsSupported && (
            <button
              type="button"
              onClick={() => {
                setVoiceEnabled(!voiceEnabled);
                if (isSpeaking) stopSpeaking();
              }}
              className={
                "p-2 rounded-lg transition-colors " +
                (voiceEnabled
                  ? "bg-cyan-500 text-white"
                  : "bg-white/5 hover:bg-white/10 text-slate-400")
              }
              title={language === "ka" ? "ხმოვანი პასუხი" : "Voice response"}
            >
              {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isListening 
                ? (language === "ka" ? "🎤 მსმენა..." : "🎤 Listening...") 
                : (language === "ka" ? "ჩაწერეთ შეტყობინება..." : "Type a message...")
            }
            className="flex-1 bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
            disabled={isLoading || isListening}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || isListening}
            className="px-4 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>

        {isListening && (
          <div className="mt-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <p className="text-xs text-red-400">
              {language === "ka" ? "მსმენა..." : "Listening..."}
            </p>
          </div>
        )}

        {transcript && isListening && (
          <p className="text-xs text-cyan-400 mt-1 italic">&quot;{transcript}&quot;</p>
        )}
      </form>
    </div>
  );
}
