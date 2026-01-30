"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Paperclip,
  Sparkles,
  ChevronDown,
  Crown,
  Video,
  Mic2,
  Image as ImageIcon,
  Music,
  Gamepad2,
  Wand2,
  FileText,
  Camera,
  UserCircle,
  Briefcase,
  Zap,
  X,
} from "lucide-react";
import Link from "next/link";

type Agent = {
  id: string;
  name: string;
  nameKa: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  isPremium?: boolean;
  status: "active" | "idle" | "busy";
  tools: string[];
};

const agents: Agent[] = [
  {
    id: "agent-g",
    name: "Agent G",
    nameKa: "აგენტი G",
    subtitle: "Universal AI Assistant",
    icon: Crown,
    color: "from-amber-500 to-yellow-600",
    isPremium: true,
    status: "active",
    tools: ["Chat", "Code", "Analyze", "Create"],
  },
  {
    id: "avatar-builder",
    name: "Avatar Builder",
    nameKa: "ავატარი",
    subtitle: "AI Avatar Creation",
    icon: UserCircle,
    color: "from-green-500 to-emerald-600",
    status: "idle",
    tools: ["Generate", "Edit", "Animate"],
  },
  {
    id: "voice-lab",
    name: "Voice Lab",
    nameKa: "ხმა",
    subtitle: "Voice Synthesis",
    icon: Mic2,
    color: "from-purple-500 to-pink-600",
    status: "idle",
    tools: ["Clone", "Generate", "Edit"],
  },
  {
    id: "image-architect",
    name: "Image Architect",
    nameKa: "სურათი",
    subtitle: "Image Generation",
    icon: ImageIcon,
    color: "from-cyan-500 to-blue-600",
    status: "idle",
    tools: ["Generate", "Edit", "Upscale"],
  },
  {
    id: "music-studio",
    name: "Music Studio",
    nameKa: "მუსიკა",
    subtitle: "AI Music Creation",
    icon: Music,
    color: "from-pink-500 to-rose-600",
    status: "idle",
    tools: ["Compose", "Mix", "Master"],
  },
  {
    id: "video-cine-lab",
    name: "Video Cine-Lab",
    nameKa: "ვიდეო",
    subtitle: "Cinematic Video",
    icon: Video,
    color: "from-orange-500 to-red-600",
    status: "idle",
    tools: ["Generate", "Edit", "Render"],
  },
  {
    id: "game-forge",
    name: "Game Forge",
    nameKa: "თამაში",
    subtitle: "Game Assets",
    icon: Gamepad2,
    color: "from-indigo-500 to-violet-600",
    status: "idle",
    tools: ["Sprites", "Models", "Textures"],
  },
  {
    id: "ai-production",
    name: "AI Production",
    nameKa: "პროდაქშენი",
    subtitle: "Media Production",
    icon: Zap,
    color: "from-yellow-500 to-amber-600",
    status: "idle",
    tools: ["Batch", "Pipeline", "Export"],
  },
  {
    id: "business-agent",
    name: "Business Agent",
    nameKa: "ბიზნესი",
    subtitle: "Business AI",
    icon: Briefcase,
    color: "from-blue-500 to-indigo-600",
    status: "idle",
    tools: ["Analyze", "Report", "Forecast"],
  },
  {
    id: "prompt-builder",
    name: "Prompt Builder",
    nameKa: "პრომპტი",
    subtitle: "Prompt Engineering",
    icon: Sparkles,
    color: "from-teal-500 to-cyan-600",
    status: "idle",
    tools: ["Optimize", "Generate", "Test"],
  },
  {
    id: "image-generator",
    name: "Image Generator",
    nameKa: "გენერატორი",
    subtitle: "Fast Image Gen",
    icon: Camera,
    color: "from-lime-500 to-green-600",
    status: "idle",
    tools: ["Quick", "Batch", "Variation"],
  },
  {
    id: "video-generator",
    name: "Video Generator",
    nameKa: "ვიდეო გენ",
    subtitle: "Quick Video",
    icon: Video,
    color: "from-red-500 to-pink-600",
    status: "idle",
    tools: ["Shorts", "Clips", "Ads"],
  },
  {
    id: "text-intelligence",
    name: "Text Intelligence",
    nameKa: "ტექსტი",
    subtitle: "AI Writing",
    icon: FileText,
    color: "from-slate-500 to-gray-600",
    status: "idle",
    tools: ["Write", "Edit", "Translate"],
  },
];

type Message = {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
  agentId?: string;
};

export default function WorkspacePage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent>(agents[0]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "agent",
      content: "გამარჯობა! მე ვარ Agent G, თქვენი AI ასისტენტი. რით შემიძლია დაგეხმაროთ?",
      timestamp: new Date(),
      agentId: "agent-g",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    setTimeout(() => {
      const agentMsg: Message = {
        id: `agent-${Date.now()}`,
        role: "agent",
        content: `მშვენიერია! ვმუშაობ "${inputValue}"-ზე...`,
        timestamp: new Date(),
        agentId: selectedAgent.id,
      };
      setMessages((prev) => [...prev, agentMsg]);
    }, 1000);
  };

  const handleAgentSwitch = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsAgentMenuOpen(false);
    showToast(`გადართულია: ${agent.nameKa}`);

    const systemMsg: Message = {
      id: `system-${Date.now()}`,
      role: "agent",
      content: `ახლა ვარ ${agent.name}. ${agent.subtitle}. რით შემიძლია დაგეხმაროთ?`,
      timestamp: new Date(),
      agentId: agent.id,
    };
    setMessages((prev) => [...prev, systemMsg]);
  };

  const AgentIcon = selectedAgent.icon;

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 max-w-md mx-auto h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-xl font-bold">A</span>
            </div>
            <div>
              <h1 className="text-sm font-bold">Avatar G</h1>
              <p className="text-[10px] text-gray-400">Workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-400">Online</span>
          </div>
        </header>

        {/* Agent Selector Bar */}
        <div className="px-4 py-3 border-b border-white/10 bg-black/20">
          <button
            onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${selectedAgent.color} flex items-center justify-center`}>
                <AgentIcon className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{selectedAgent.nameKa}</span>
                  {selectedAgent.isPremium && <Crown className="w-3 h-3 text-amber-400" />}
                </div>
                <p className="text-[10px] text-gray-400">{selectedAgent.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-[10px] font-medium">
                Active
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isAgentMenuOpen ? "rotate-180" : ""}`} />
            </div>
          </button>

          {/* Agent Dropdown */}
          <AnimatePresence>
            {isAgentMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-2 p-2 rounded-xl bg-black/80 border border-white/10 backdrop-blur-xl max-h-64 overflow-y-auto"
              >
                {agents.map((agent) => {
                  const Icon = agent.icon;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => handleAgentSwitch(agent)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
                        selectedAgent.id === agent.id ? "bg-white/10" : "hover:bg-white/5"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium">{agent.nameKa}</span>
                          {agent.isPremium && <Crown className="w-3 h-3 text-amber-400" />}
                        </div>
                        <p className="text-[10px] text-gray-500">{agent.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Service Shortcuts */}
        <div className="px-4 py-2 border-b border-white/10">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">სერვისები</p>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {agents.slice(1).map((agent) => {
              const Icon = agent.icon;
              return (
                <Link
                  key={agent.id}
                  href={`/${agent.id}`}
                  className="flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all min-w-[64px]"
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{agent.nameKa}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-2xl ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-br-md"
                    : "bg-white/5 border border-white/10 text-gray-200 rounded-bl-md"
                }`}
              >
                <p className="text-sm leading-relaxed">{msg.content}</p>
                <p className="text-[10px] opacity-60 mt-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </motion.div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Tools Panel (Collapsible) */}
        <AnimatePresence>
          {showTools && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="border-t border-white/10 bg-black/40 overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-gray-400">ხელსაწყოები</p>
                  <button onClick={() => setShowTools(false)} className="p-1 rounded-lg hover:bg-white/10">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {selectedAgent.tools.map((tool) => (
                    <button
                      key={tool}
                      className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                    >
                      <span className="text-[10px] text-gray-300">{tool}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Composer */}
        <div className="p-4 border-t border-white/10 bg-black/40 backdrop-blur-xl">
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-3 px-3 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs text-center"
            >
              {toast}
            </motion.div>
          )}

          <div className="flex items-end gap-2">
            <button
              onClick={() => setShowTools(!showTools)}
              className={`p-3 rounded-xl border transition-all ${
                showTools
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400"
                  : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
              }`}
            >
              <Sparkles className="w-5 h-5" />
            </button>

            <div className="flex-1 relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="შეიყვანეთ მესიჯი..."
                rows={1}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50 placeholder:text-gray-600"
                style={{ minHeight: "48px", maxHeight: "120px" }}
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/10 text-gray-400">
                <Paperclip className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-cyan-500/40"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
