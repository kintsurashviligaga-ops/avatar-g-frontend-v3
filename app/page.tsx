"use client";

import React, { Suspense, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { 
  Sparkles, Zap, MessageSquare, Video, Music, 
  Code, ChevronRight, Settings, User, LogOut 
} from "lucide-react";

// Dynamic import for SSR safety
const SpaceSingularityBackground = dynamic(
  () => import("@/components/SpaceSingularityBackground"),
  { ssr: false, loading: () => <div className="fixed inset-0 bg-[#05070A]" /> }
);

const services = [
  { id: "text", title: "Text Intelligence", desc: "Advanced NLP for content creation", icon: MessageSquare, color: "from-cyan-500 to-blue-600" },
  { id: "video", title: "Video Cine-Lab", desc: "AI-powered video generation", icon: Video, color: "from-purple-500 to-pink-600" },
  { id: "voice", title: "Voice Studio", desc: "Text-to-speech & voice cloning", icon: Music, color: "from-emerald-500 to-teal-600" },
  { id: "code", title: "Code Forge", desc: "Intelligent code generation", icon: Code, color: "from-orange-500 to-red-600" },
  { id: "image", title: "Vision Lab", desc: "Image generation & editing", icon: Sparkles, color: "from-violet-500 to-indigo-600" },
];

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header initial={{ y: -100 }} animate={{ y: 0 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "bg-[#05070A]/80 backdrop-blur-xl border-b border-white/5" : "bg-transparent"
      }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <motion.div className="flex items-center gap-3" whileHover={{ scale: 1.02 }}>
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
              <div className="absolute inset-0 rounded-xl bg-cyan-500/20 blur-xl" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Avatar G</span>
          </motion.div>
          
          <nav className="hidden md:flex items-center gap-1">
            {["Workspace", "Services", "History", "Settings"].map((item) => (
              <a key={item} href={`/${item.toLowerCase()}`} 
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  item === "Workspace" ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}>
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all"><Settings className="w-5 h-5" /></button>
            <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all"><LogOut className="w-5 h-5" /></button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center ml-2"><User className="w-4 h-4 text-white" /></div>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

function ServiceCard({ service, index }: { service: typeof services[0]; index: number }) {
  const Icon = service.icon;
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
      whileHover={{ y: -5, scale: 1.02 }} className="group relative">
      <div className={`absolute inset-0 bg-gradient-to-r ${service.color} rounded-2xl opacity-0 group-hover:opacity-10 blur-xl transition-opacity`} />
      <div className="relative h-full p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.04] hover:border-white/10 transition-all">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-cyan-400 transition-colors">{service.title}</h3>
        <p className="text-sm text-gray-400 mb-4">{service.desc}</p>
        <div className="flex items-center text-sm text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <span>Launch</span><ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </motion.div>
  );
}

function Avatar3D() {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="relative w-full max-w-md mx-auto">
      <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/20 via-transparent to-transparent blur-3xl" />
      <div className="relative aspect-square rounded-3xl bg-gradient-to-b from-white/5 to-transparent border border-white/10 backdrop-blur-sm flex items-center justify-center overflow-hidden">
        <div className="text-center">
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="w-32 h-32 mx-auto mb-4 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
            <Sparkles className="w-12 h-12 text-cyan-400" />
          </motion.div>
          <p className="text-gray-400 text-sm">3D Avatar Agent</p>
          <p className="text-cyan-400 text-xs mt-1">Ready to assist</p>
        </div>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute inset-4 border border-dashed border-white/10 rounded-full" />
      </div>
    </motion.div>
  );
}

export default function WorkspacePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  if (!mounted) return <div className="fixed inset-0 bg-[#05070A]" />;

  return (
    <div className="relative min-h-screen bg-[#05070A] overflow-x-hidden">
      <Suspense fallback={<div className="fixed inset-0 bg-[#05070A]" />}>
        <SpaceSingularityBackground />
      </Suspense>
      
      <Header />
      
      <main className="relative z-10 pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm mb-6">
              <Sparkles className="w-4 h-4" /><span>Universal AI Assistant</span>
            </motion.div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Your Creative<span className="block bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">AI Workspace</span>
            </h1>
            
            <p className="text-lg text-gray-400 mb-8 max-w-lg">
              Access powerful AI tools for content creation, coding, video production, and more. All in one unified workspace.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-shadow">
                Get Started
              </motion.button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-colors">
                View Demo
              </motion.button>
            </div>
          </motion.div>
          
          <Avatar3D />
        </div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">AI Services</h2>
          <p className="text-gray-400 mb-8">Choose a service to begin creating</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {services.map((service, index) => <ServiceCard key={service.id} service={service} index={index} />)}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
