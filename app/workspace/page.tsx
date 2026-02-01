"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AgentOrb from "@/components/AgentOrb";
import ServicesSlider from "@/components/ServicesSlider";
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export default function WorkspacePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [orbState, setOrbState] = useState<
    "idle" | "thinking" | "processing" | "success" | "error"
  >("idle");
  const [isOnline] = useState(true);
  const { language } = useLanguage();

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setOrbState("thinking");

    setTimeout(() => {
      setOrbState("processing");
      setTimeout(() => {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t("workspace.sampleResponse"),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
        setOrbState("success");
        setTimeout(() => setOrbState("idle"), 2000);
      }, 1500);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-[#05070A] text-[#E5E7EB] flex flex-col">
      <header className="border-b border-cyan-500/20 bg-white/5 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            <span className="font-bold text-lg">Avatar G</span>
          </div>
          <h1 className="text-sm sm:text-base font-medium text-center absolute left-1/2 transform -translate-x-1/2">
            {t("workspace.title")}
          </h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isOnline ? "bg-green-400" : "bg-red-400"
                } animate-pulse`}
              />
              <span className="text-xs hidden sm:inline">
                {isOnline ? t("workspace.online") : t("workspace.offline")}
              </span>
            </div>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div className="w-full max-w-5xl h-[calc(100vh-8rem)] flex flex-col">
          <div className="flex-1 bg-white/5 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-2xl shadow-cyan-500/10 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-cyan-500/10">
              <ServicesSlider />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center space-y-8">
                  <AgentOrb
                    state={orbState}
                    labelKa={t("workspace.agentLabelKa")}
                    labelEn={t("workspace.agentLabelEn")}
                  />
                  <div className="text-center space-y-4 max-w-md">
                    <h2 className="text-2xl font-semibold text-cyan-400">
                      {t("workspace.welcomeTitle")}
                    </h2>
                    <p className="text-sm text-slate-400">
                      {t("workspace.welcomeSubtitle")}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25">
                      {t("workspace.primaryCTA")}
                    </button>
                    <button className="px-6 py-3 bg-white/10 hover:bg-white/20 text-slate-200 rounded-lg font-medium transition-colors border border-cyan-500/30">
                      {t("workspace.secondaryCTA")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence>
                    {messages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`flex ${
                          message.role === "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] sm:max-w-[70%] px-4 py-3 rounded-2xl ${
                            message.role === "user"
                              ? "bg-cyan-500/20 border border-cyan-500/30"
                              : "bg-white/10 border border-slate-700/50"
                          }`}
                        >
                          <p className="text-sm">{message.content}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {orbState !== "idle" && (
                    <div className="flex justify-start">
                      <AgentOrb state={orbState} size="sm" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-cyan-500/10">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={t("workspace.inputPlaceholder")}
                  className="flex-1 bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="px-4 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-lg shadow-cyan-500/25"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
