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
  Settings,
  Shield,
  Globe,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import SpaceSingularityBackground from "@/components/SpaceSingularityBackground";
import AgentPresence3D from "@/components/AgentPresence3D";
import OnboardingCinematic from "@/components/OnboardingCinematic";

type Agent = {
  id: string;
  name: string;
  nameKa: string;
  subtitle: string;
  icon: React.ElementType;
  imageIcon?: string;
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
    imageIcon: "/icons/services/avatar-builder.webp",
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
    imageIcon: "/icons/services/voice-lab.webp",
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
    imageIcon: "/icons/services/image-architect.webp",
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
    imageIcon: "/icons/services/music-studio.webp",
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
    imageIcon: "/icons/services/video-cine-lab.webp",
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
    imageIcon: "/icons/services/game-forge.webp",
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
    imageIcon: "/icons/services/ai-production.webp",
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
    imageIcon: "/icons/services/business-agent.webp",
    color: "from-blue-500 to-indigo-600",
    status: "idle",
    tools: ["Analyze", "Report", "Forecast"],
  },
  {
    id: "prompt-builder",
    name: "Prompt Builder",
    nameKa: "პრომპტი",
    subtitle: "Prompt Engineering",
    icon: Wand2,
    imageIcon: "/icons/services/prompt-builder.webp",
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
    imageIcon: "/icons/services/image-generator.webp",
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
    imageIcon: "/icons/services/video-generator.webp",
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
    imageIcon: "/icons/services/text-intelligence.webp",
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
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent>(agents[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const showToastMsg = (message: string) => {
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
        content: `მე ვარ ${selectedAgent.nameKa}. ${inputValue}-ზე ვმუშაობ...`,
        timestamp: new Date(),
        agentId: selectedAgent.id,
      };
      setMessages((prev) => [...prev, agentMsg]);
    }, 1000);
  };

  const handleAgentSwitch = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsAgentMenuOpen(false);
    showToastMsg(`გადართულია: ${agent.nameKa}`);

    const systemMsg: Message = {
      id: `system-${Date.now()}`,
      role: "agent",
      content: `ახლა ვარ ${agent.nameKa}. ${agent.subtitle}. რით შემიძლია დაგეხმაროთ?`,
      timestamp: new Date(),
      agentId: agent.id,
    };
    setMessages((prev) => [...prev, systemMsg]);
  };

  const AgentIcon = selectedAgent.icon;

  const ServiceIcon = ({ agent, size = 44 }: { agent: Agent; size?: number }) => {
    if (agent.imageIcon) {
      return (
        <div 
          className="relative rounded-xl overflow-hidden shadow-lg ring-1 ring-white/10"
          style={{ width: size, height: size }}
        >
          <Image
            src={agent.imageIcon}
            alt={agent.name}
            width={size}
            height={size}
            className="object-cover w-full h-full"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      );
    }
    
    const Icon = agent.icon;
    return (
      <div 
        className={`rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center shadow-lg ring-1 ring-white/20`}
        style={{ width: size, height: size }}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
    );
  };

  if (showOnboarding) {
    return <OnboardingCinematic onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="min-h-screen text-white overflow-hidden relative">
      {/* Cinematic Space Background */}
      <SpaceSingularityBackground />

      {/* Main Chat Window - Premium Glass Container */}
      <div className="relative z-10 max-w-md mx-auto h-screen flex flex-col">
        
        {/* Top Bar - Premium Minimal */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#0A1423]/60 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {/* Silver Rocket Logo */}
            <div className="w-9 h-9 relative">
              <Image
                src="/brand/logo.svg"
                alt="Avatar G"
                width={36}
                height={36}
                className="drop-shadow-[0_0_8px_rgba(192,192,192,0.5)]"
              />
            </div>
            <div>
              <h1 className="text-[15px] font-medium tracking-wide text-gray-100">Avatar G</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Settings className="w-4 h-4 text-gray-400" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
              <span className="text-[11px] text-green-400 font-medium">Online</span>
            </div>
          </div>
        </header>

        {/* Agent Selector - Glass Bar */}
        <div className="px-4 py-3 border-b border-white/10 bg-[#0A1423]/40 backdrop-blur-lg">
          <button
            onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${selectedAgent.color} flex items-center justify-center shadow-lg ring-1 ring-white/20`}>
                <AgentIcon className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-gray-100">{selectedAgent.nameKa}</span>
                  {selectedAgent.isPremium && (
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </div>
                <p className="text-[11px] text-gray-500">{selectedAgent.subtitle}</p>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${isAgentMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Agent Dropdown */}
          <AnimatePresence>
            {isAgentMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 overflow-hidden"
              >
                <div className="p-2 rounded-2xl bg-[#0A1423]/95 border border-white/10 backdrop-blur-xl shadow-2xl max-h-64 overflow-y-auto">
                  {agents.map((agent) => {
                    const Icon = agent.icon;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => handleAgentSwitch(agent)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                          selectedAgent.id === agent.id 
                            ? "bg-cyan-500/10 border border-cyan-500/20" 
                            : "hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center shadow-md`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="text-left flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-gray-200">{agent.nameKa}</span>
                            {agent.isPremium && <Crown className="w-3 h-3 text-amber-400" />}
                          </div>
                          <p className="text-[10px] text-gray-500">{agent.subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Services Row - Photoreal Retro Icons */}
        <div className="px-4 py-3 border-b border-white/10 bg-[#0A1423]/30 backdrop-blur-md">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium ml-1">სერვისები</p>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {agents.slice(1).map((agent) => (
              <Link
                key={agent.id}
                href={`/${agent.id}`}
                className="flex-shrink-0 flex flex-col items-center gap-2 p-2 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300 min-w-[76px] group"
              >
                <ServiceIcon agent={agent} size={48} />
                <span className="text-[10px] text-gray-400 group-hover:text-gray-300 whitespace-nowrap transition-colors">
                  {agent.nameKa}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
          {/* 3D Agent Presence - When Empty */}
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-10 gap-5"
            >
              <AgentPresence3D isActive={true} size={130} />
              <div className="text-center space-y-2">
                <p className="text-[15px] text-gray-200 font-light tracking-wide">
                  {selectedAgent.nameKa} მზადაა
                </p>
                <p className="text-xs text-gray-500 font-light">
                  დაწერეთ რაიმე დაიწყოთ
                </p>
              </div>
            </motion.div>
          )}

          {/* Messages */}
          {messages.map((msg, index) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-br-md shadow-lg shadow-cyan-500/20"
                    : "bg-[#0A1423]/60 border border-white/[0.08] text-gray-200 rounded-bl-md backdrop-blur-sm"
                }`}
              >
                <p className="text-[14px] leading-relaxed font-light">{msg.content}</p>
                <p className="text-[10px] opacity-50 mt-1.5">
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </motion.div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Tools Panel */}
        <AnimatePresence>
          {showTools && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-white/10 bg-[#0A1423]/50 backdrop-blur-lg overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-400 font-medium">ხელსაწყოები</p>
                  <button onClick={() => setShowTools(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {selectedAgent.tools.map((tool) => (
                    <button
                      key={tool}
                      className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-cyan-500/30 transition-all"
                    >
                      <span className="text-[10px] text-gray-400">{tool}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Composer - Premium Glass */}
        <div className="p-4 border-t border-white/10 bg-[#0A1423]/70 backdrop-blur-xl">
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-3 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs text-center"
            >
              {toast}
            </motion.div>
          )}

          <div className="flex items-end gap-2">
            <button
              onClick={() => setShowTools(!showTools)}
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                showTools
                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                  : "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:bg-white/[0.06]"
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
                className="w-full px-4 py-3.5 pr-12 rounded-xl bg-[#05070A]/50 border border-white/[0.08] text-[14px] text-gray-100 resize-none focus:outline-none focus:border-cyan-500/30 focus:bg-[#05070A]/70 transition-all placeholder:text-gray-600"
                style={{ minHeight: "52px", maxHeight: "120px" }}
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-white/10 text-gray-500 transition-colors">
                <Paperclip className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:shadow-cyan-500/40 active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#0A1423]/95 border border-white/10 rounded-3xl p-6 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-gray-100">პარამეტრები</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 rounded-lg hover:bg-white/10">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-5">
                {/* Memory */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-medium text-gray-200">Agent G მეხსიერება</h3>
                  </div>
                  <div className="space-y-2 pl-6">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-gray-400">პროექტის მეხსიერება</span>
                      <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500" />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-gray-400">პრეფერენციები</span>
                      <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500" />
                    </label>
                  </div>
                </div>

                {/* Privacy */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-green-400" />
                    <h3 className="text-sm font-medium text-gray-200">პრივატულობა</h3>
                  </div>
                  <div className="space-y-2 pl-6">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-gray-400">ლოკალური მეხსიერება</span>
                      <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500" />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-gray-400">AI სწავლება</span>
                      <input type="checkbox" className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500" />
                    </label>
                  </div>
                </div>

                {/* Language */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-medium text-gray-200">ენა</h3>
                  </div>
                  <div className="flex gap-2 pl-6">
                    <button className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs border border-cyan-500/30">ქართული</button>
                    <button className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 text-xs border border-white/10 hover:bg-white/10">English</button>
                  </div>
                </div>

                {/* Premium */}
                <div className="pt-4 border-t border-white/10">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-yellow-600/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-medium text-amber-400">Agent G Premium</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">პერსონალური AI აგენტი სრული კონტროლით</p>
                    <p className="text-lg font-light text-amber-400">2000 GEL <span className="text-xs text-gray-500">/ წელიწადში</span></p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
