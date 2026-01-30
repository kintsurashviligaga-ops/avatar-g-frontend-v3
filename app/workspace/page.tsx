"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, 
  Sparkles, 
  Zap, 
  Crown,
  User,
  Bot,
  Image as ImageIcon,
  Music,
  Video,
  Code,
  Palette,
  Gamepad2,
  Briefcase,
  Wand2,
  FileText,
  MessageSquare,
  LayoutGrid
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const SpaceBackground = dynamic(
  () => import("@/components/SpaceSingularityBackground"),
  { ssr: false, loading: () => <div className="fixed inset-0 bg-[#05070A]" /> }
);

const AgentGOrb = dynamic(
  () => import("@/components/AgentGOrb"),
  { ssr: false }
);

// Types
interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
}

interface Service {
  id: string;
  nameKa: string;
  nameEn: string;
  icon: React.ElementType;
  href: string;
  isPremium?: boolean;
  color: string;
}

// LOCKED SERVICE ORDER - 13 services exact per blueprint
const services: Service[] = [
  { id: "agent-g", nameKa: "Agent G", nameEn: "Agent G (Luxury)", icon: Crown, href: "/agent-g", isPremium: true, color: "from-amber-400 to-yellow-600" },
  { id: "avatar-builder", nameKa: "Avatar Builder", nameEn: "Avatar Builder", icon: User, href: "/avatar-builder", color: "from-cyan-400 to-blue-600" },
  { id: "voice-lab", nameKa: "Voice Lab", nameEn: "Voice Lab", icon: Music, href: "/voice-lab", color: "from-emerald-400 to-teal-600" },
  { id: "image-architect", nameKa: "Image Architect", nameEn: "Image Architect", icon: Palette, href: "/image-architect", color: "from-violet-400 to-purple-600" },
  { id: "music-studio", nameKa: "Music Studio", nameEn: "Music Studio", icon: Music, href: "/music-studio", color: "from-pink-400 to-rose-600" },
  { id: "video-cine-lab", nameKa: "Video Cine Lab", nameEn: "Video Cine Lab", icon: Video, href: "/video-cine-lab", color: "from-red-400 to-orange-600" },
  { id: "game-forge", nameKa: "Game Forge", nameEn: "Game Forge", icon: Gamepad2, href: "/game-forge", color: "from-indigo-400 to-blue-600" },
  { id: "ai-production", nameKa: "AI Production", nameEn: "AI Production", icon: Sparkles, href: "/ai-production", color: "from-cyan-400 to-sky-600" },
  { id: "business-agent", nameKa: "Business Agent", nameEn: "Business Agent", icon: Briefcase, href: "/business-agent", color: "from-slate-400 to-gray-600" },
  { id: "prompt-builder", nameKa: "Prompt Builder", nameEn: "Prompt Builder", icon: Wand2, href: "/prompt-builder", color: "from-teal-400 to-cyan-600" },
  { id: "image-generator", nameKa: "Image Generator", nameEn: "Image Generator", icon: ImageIcon, href: "/image-generator", color: "from-fuchsia-400 to-pink-600" },
  { id: "video-generator", nameKa: "Video Generator", nameEn: "Video Generator", icon: Video, href: "/video-generator", color: "from-rose-400 to-red-600" },
  { id: "text-intelligence", nameKa: "Text Intelligence", nameEn: "Text Intelligence", icon: MessageSquare, href: "/text-intelligence", color: "from-blue-400 to-indigo-600" },
];

// Service Strip Item
function ServiceItem({ service, index }: { service: Service; index: number }) {
  const Icon = service.icon;
  
  return (
    <Link href={service.href}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 + index * 0.05 }}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        className="flex-shrink-0 w-20 cursor-pointer group"
      >
        <div className={`relative w-16 h-16 mx-auto mb-2 rounded-2xl bg-gradient-to-br ${service.color} p-[1px] shadow-lg shadow-black/50`}>
          <div className="w-full h-full rounded-2xl bg-[rgba(10,20,35,0.9)] backdrop-blur-sm flex items-center justify-center group-hover:bg-[rgba(10,20,35,0.7)] transition-colors">
            <Icon className="w-7 h-7 text-white" strokeWidth={1.5} />
          </div>
          {service.isPremium && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg">
              <Crown className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
        <p className="text-[10px] text-center text-gray-400 group-hover:text-cyan-300 transition-colors leading-tight line-clamp-2">
          {service.nameKa}
        </p>
      </motion.div>
    </Link>
  );
}

// Chat Message Bubble - EXACT SPECS
function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}
    >
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-1 ml-1">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs text-cyan-400 font-medium">Agent G</span>
          </div>
        )}
        
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-br-md shadow-lg shadow-cyan-500/20"
              : "bg-[rgba(10,20,35,0.7)] backdrop-blur-md border border-cyan-500/20 text-gray-200 rounded-bl-md"
          }`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        
        <span className="text-[10px] text-gray-600 mt-1 block">
          {message.timestamp.toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </motion.div>
  );
}

// Main Component
export default function WorkspacePage() {
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "agent",
      content: "გამარჯობა. მზად ვარ დაგეხმარო.\n\nHello. Ready to assist.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentState, setAgentState] = useState<"idle" | "thinking">("idle");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    setAgentState("thinking");
    
    // Simulate Agent G response
    setTimeout(() => {
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "agent",
        content: "ვფიქრობ… / Thinking…",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMessage]);
      setIsTyping(false);
      setAgentState("idle");
    }, 2000);
  };

  if (!mounted) {
    return (
      <div className="fixed inset-0 bg-[#05070A] flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600"
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#05070A] overflow-hidden">
      {/* Background */}
      <SpaceBackground />
      
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-[rgba(5,7,10,0.85)] backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 h-full flex items-center justify-between">
          {/* Left: Logo */}
          <Link href="/workspace">
            <motion.div 
              className="flex items-center gap-2 cursor-pointer"
              whileHover={{ scale: 1.02 }}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                <Zap className="w-4 h-4 text-white" fill="currentColor" />
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Avatar G
              </span>
            </motion.div>
          </Link>
          
          {/* Center: Online Indicator */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-gray-400">Online</span>
          </div>
          
          {/* Right: Settings */}
          <Link href="/settings">
            <motion.div 
              whileHover={{ scale: 1.1 }}
              className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:border-cyan-500/30 transition-colors cursor-pointer"
            >
              <LayoutGrid className="w-4 h-4 text-gray-400" />
            </motion.div>
          </Link>
        </div>
      </header>

      {/* Main Chat Cockpit */}
      <main className="relative z-10 pt-14 pb-4 h-screen flex flex-col max-w-4xl mx-auto px-4">
        {/* Agent G Presence - EXACT PLACEMENT */}
        <div className="flex-shrink-0 py-4 flex flex-col items-center">
          <AgentGOrb state={agentState} size="md" />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-3 text-center"
          >
            <h2 className="text-base font-semibold text-white">Agent G</h2>
            <p className="text-xs text-cyan-400">მზად არის დასახმარებლად / Ready to assist</p>
          </motion.div>
        </div>

        {/* Services Strip - INSIDE CHAT COCKPIT */}
        <div className="flex-shrink-0 mb-3">
          <p className="text-[10px] text-gray-600 mb-2 text-center uppercase tracking-wider">სერვისები / Services</p>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-2">
            {services.map((service, index) => (
              <ServiceItem key={service.id} service={service} index={index} />
            ))}
          </div>
        </div>

        {/* Chat Window - GLASS COCKPIT EXACT SPECS */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto rounded-2xl bg-[rgba(10,20,35,0.4)] backdrop-blur-md border border-white/10 p-4 mb-3 shadow-inner">
            <AnimatePresence>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
            </AnimatePresence>
            
            {isTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 ml-1"
              >
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="flex gap-1">
                  {[0, 0.2, 0.4].map((delay) => (
                    <motion.div
                      key={delay}
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay }}
                      className="w-2 h-2 rounded-full bg-cyan-400"
                    />
                  ))}
                </div>
              </motion.div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area - EXACT SPECS */}
          <div className="flex-shrink-0 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              onFocus={() => setAgentState("thinking")}
              onBlur={() => !isTyping && setAgentState("idle")}
              placeholder="შეიყვანეთ შეტყობინება... / Type your message..."
              className="flex-1 px-4 py-3 rounded-xl bg-[rgba(10,20,35,0.6)] backdrop-blur-md border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors text-sm"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSend}
              className="px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30"
            >
              <Send className="w-5 h-5" />
            </motion.button>
          </div>
        </div>
      </main>
    </div>
  );
}
