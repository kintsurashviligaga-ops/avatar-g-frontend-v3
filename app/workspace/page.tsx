"use client";

import React, { Suspense, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { 
  Sparkles, Zap, MessageSquare, Video, Music, 
  Code, ChevronRight, Settings, User, LogOut,
  History, LayoutGrid
} from "lucide-react";
import Link from "next/link";

const SpaceSingularityBackground = dynamic(
  () => import("@/components/SpaceSingularityBackground"),
  { ssr: false, loading: () => <div className="fixed inset-0 bg-[#05070A]" /> }
);

const services = [
  { id: "text", title: "Text Intelligence", description: "Advanced NLP for content creation", icon: MessageSquare, color: "from-cyan-500 to-blue-600", href: "/services/text-intelligence" },
  { id: "video", title: "Video Cine-Lab", description: "AI-powered video generation", icon: Video, color: "from-purple-500 to-pink-600", href: "/services/video-cine-lab" },
  { id: "voice", title: "Voice Studio", description: "Text-to-speech & voice cloning", icon: Music, color: "from-emerald-500 to-teal-600", href: "/services/voice-studio" },
  { id: "code", title: "Code Forge", description: "Intelligent code generation", icon: Code, color: "from-orange-500 to-red-600", href: "/services/code-forge" },
  { id: "image", title: "Vision Lab", description: "Image generation & editing", icon: Sparkles, color: "from-violet-500 to-indigo-600", href: "/services/vision-lab" },
];

const navItems = [
  { label: "Workspace", href: "/workspace", icon: LayoutGrid, active: true },
  { label: "Services", href: "/services", icon: Sparkles, active: false },
  { label: "History", href: "/history", icon: History, active: false },
  { label: "Settings", href: "/settings", icon: Settings, active: false },
];

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? "bg-[#05070A]/90 backdrop-blur-xl border-b border-white/10" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link href="/workspace">
            <motion.div className="flex items-center gap-3 cursor-pointer" whileHover={{ scale: 1.02 }}>
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                <Zap className="w-5 h-5 text-white" fill="currentColor" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Avatar G</span>
            </motion.div>
          </Link>
          
          <nav className="hidden md:flex items-center gap-1 bg-white/5 rounded-full p-1 border border-white/10">
            {navItems.map((item) => (
              <Link key={item.label} href={item.href}>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${item.active ? "bg-white/15 text-white" : "text-gray-400 hover:text-white hover:bg-white/10"}`}>
                  <item.icon className="w-4 h-4" />{item.label}
                </motion.div>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              <Settings className="w-5 h-5" />
            </motion.button>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <LogOut className="w-5 h-5" />
            </motion.button>
            <motion.div whileHover={{ scale: 1.1 }} className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center ml-2 cursor-pointer shadow-lg shadow-cyan-500/30 border-2 border-white/10">
              <User className="w-5 h-5 text-white" />
            </motion.div>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

function ServiceCard({ service, index }: { service: typeof services[0]; index: number }) {
  const Icon = service.icon;
  return (
    <Link href={service.href}>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
        whileHover={{ y: -8, scale: 1.02 }} whileTap={{ scale: 0.98 }} className="group relative cursor-pointer h-full">
        <div className={`absolute -inset-0.5 bg-gradient-to-r ${service.color} rounded-2xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-500`} />
        <div className="relative h-full p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-all duration-300 shadow-lg`}>
            <Icon className="w-7 h-7 text-white" strokeWidth={2} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">{service.title}</h3>
          <p className="text-sm text-gray-400 mb-5 line-clamp-2 leading-relaxed">{service.description}</p>
          <div className="flex items-center text-sm font-medium text-cyan-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
            <span>Launch Service</span><ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function Avatar3D() {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.2 }} className="relative w-full max-w-lg mx-auto">
      <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/30 via-blue-500/10 to-transparent blur-3xl scale-110" />
      <div className="relative aspect-square rounded-3xl bg-gradient-to-b from-white/[0.08] to-transparent border border-white/20 backdrop-blur-md flex items-center justify-center overflow-hidden shadow-2xl shadow-cyan-500/10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="relative text-center z-10">
          <motion.div animate={{ y: [0, -15, 0], scale: [1, 1.05, 1] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="w-40 h-40 mx-auto mb-6 rounded-full bg-gradient-to-br from-cyan-400/30 to-blue-600/30 border-2 border-cyan-400/50 flex items-center justify-center shadow-2xl shadow-cyan-500/30 relative">
            <Sparkles className="w-16 h-16 text-cyan-300" strokeWidth={1.5} />
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute inset-2 border border-dashed border-cyan-400/30 rounded-full" />
          </motion.div>
          <p className="text-gray-300 text-lg font-medium">3D Avatar Agent</p>
          <p className="text-cyan-400 text-sm mt-2 font-medium tracking-wide uppercase">Ready to assist</p>
        </div>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className="absolute inset-8 border border-white/5 rounded-full" />
        <motion.div animate={{ rotate: -360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute inset-12 border border-dashed border-cyan-500/20 rounded-full" />
      </div>
    </motion.div>
  );
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#05070A] flex flex-col items-center justify-center z-50">
      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/50" />
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-6 text-gray-400 font-medium">Loading Avatar G...</motion.p>
    </div>
  );
}

export default function WorkspacePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <LoadingScreen />;

  return (
    <div className="relative min-h-screen bg-[#05070A] overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      <Suspense fallback={<div className="fixed inset-0 bg-[#05070A]" />}>
        <SpaceSingularityBackground />
      </Suspense>
      <Header />
      <main className="relative z-10 pt-24 md:pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-20 md:mb-28">
          <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="order-2 lg:order-1">
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm font-medium mb-6 backdrop-blur-sm">
              <Sparkles className="w-4 h-4" /><span>Universal AI Assistant</span>
            </motion.div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
              Your Creative<span className="block mt-2 bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-500 bg-clip-text text-transparent">AI Workspace</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-xl leading-relaxed">
              Access powerful AI tools for content creation, coding, video production, and more. All in one unified workspace.
            </p>
            <div className="flex flex-wrap gap-4">
              <motion.button whileHover={{ scale: 1.05, boxShadow: "0 20px 40px -10px rgba(6,182,212,0.5)" }} whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/30 transition-all duration-300">Get Started</motion.button>
              <motion.button whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.1)" }} whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-xl bg-white/5 border border-white/20 text-white font-semibold transition-all duration-300 backdrop-blur-sm">View Demo</motion.button>
            </div>
          </motion.div>
          <div className="order-1 lg:order-2"><Avatar3D /></div>
        </div>

        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.8 }}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">AI Services</h2>
              <p className="text-gray-400 text-lg">Choose a service to begin creating</p>
            </div>
            <Link href="/services">
              <motion.div whileHover={{ x: 5 }} className="text-cyan-400 flex items-center gap-2 mt-4 md:mt-0 cursor-pointer hover:text-cyan-300 transition-colors">
                <span className="font-medium">View All</span><ChevronRight className="w-5 h-5" />
              </motion.div>
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {services.map((service, index) => <ServiceCard key={service.id} service={service} index={index} />)}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="mt-16 md:mt-24 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[{ label: "Active Projects", value: "12" }, { label: "AI Generations", value: "2.4k" }, { label: "Time Saved", value: "48h" }, { label: "Efficiency", value: "+340%" }].map((stat, i) => (
            <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-center">
              <div className="text-2xl md:text-3xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </main>
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#05070A] to-transparent pointer-events-none" />
    </div>
  );
}
