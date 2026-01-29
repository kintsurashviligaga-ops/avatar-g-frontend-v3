"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Navigation from "@/components/Navigation";

const ServicesSlider = dynamic(() => import("@/components/ServicesSlider"), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

const AgentGConsole = dynamic(() => import("@/components/AgentGConsole"), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] rounded-3xl bg-[#0E1116] border border-white/10 animate-pulse" />
  ),
});

const SpaceBackground = dynamic(() => import("@/components/SpaceBackground"), {
  ssr: false,
});

const PRICING = [
  {
    tier: "Beginner",
    price: "80₾",
    period: "/თვე",
    description: "საწყისი წვდომა AI ეკოსისტემაზე",
    features: ["5 სერვისი", "ძირითადი მხარდაჭერა", "1GB საცავი"],
    color: "#4ECDC4",
  },
  {
    tier: "Pro",
    price: "250₾",
    period: "/თვე",
    description: "სრული ინსტრუმენტები და ავტომატიზაცია",
    features: ["ყველა სერვისი", "პრიორიტეტული მხარდაჭერა", "50GB საცავი", "API წვდომა"],
    color: "#FF6B6B",
    popular: true,
  },
  {
    tier: "Agent G",
    price: "2000₾",
    period: "/წელი",
    description: "პერსონალური AI აგენტი. მხოლოდ შენთვის.",
    features: ["ექსკლუზიური Agent G", "პერსონალური ტრენინგი", "ულიმიტო საცავი", "24/7 დედიკაციური მხარდაჭერა"],
    color: "#FFD700",
    luxury: true,
  },
];

export default function AvatarGApp() {
  const [activeSection, setActiveSection] = useState("hero");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => { entries.forEach((entry) => { if (entry.isIntersecting) setActiveSection(entry.target.id); }); },
      { threshold: 0.3, rootMargin: "-10% 0px -10% 0px" }
    );
    ["hero", "services", "agent", "pricing"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!mounted) return <div className="min-h-screen bg-black" />;

  return (
    <div className="relative min-h-screen bg-black text-white overflow-x-hidden">
      <Navigation activeSection={activeSection} onNavigate={scrollToSection} soundEnabled={soundEnabled} onToggleSound={() => setSoundEnabled((prev) => !prev)} />
      <div className="fixed inset-0 z-0"><SpaceBackground /></div>
      <main className="relative z-10">
        <section id="hero" className="relative h-screen flex items-center justify-center px-4 sm:px-6">
          <div className="text-center max-w-5xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.2 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6 sm:mb-8">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs tracking-widest uppercase text-gray-400">სისტემა ონლაინია</span>
              </div>
              <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-4 sm:mb-6 tracking-tight">
                <span className="block text-white">შენი პერსონალური</span>
                <span className="block mt-1 sm:mt-2 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">AI ეკოსისტემა</span>
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-gray-400 mb-8 sm:mb-12 max-w-2xl mx-auto font-light px-4">სერვისები. აგენტები. გონება. ერთ სივრცეში.</p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} onClick={() => scrollToSection("services")} className="px-6 sm:px-8 py-3 sm:py-4 bg-white text-black rounded-full font-semibold text-base sm:text-lg hover:bg-gray-100 transition-colors">დაიწყე ახლა</motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} onClick={() => scrollToSection("agent")} className="px-6 sm:px-8 py-3 sm:py-4 rounded-full border border-white/20 text-white font-medium hover:bg-white/10 transition-all backdrop-blur-sm">გაიცანი Agent G</motion.button>
              </div>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }} className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-500">
            <span className="text-[10px] sm:text-xs tracking-widest uppercase">ქვემოთ</span>
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="w-5 sm:w-6 h-8 sm:h-10 rounded-full border-2 border-gray-600 flex justify-center pt-1.5 sm:pt-2">
              <div className="w-0.5 sm:w-1 h-1.5 sm:h-2 bg-gray-400 rounded-full" />
            </motion.div>
          </motion.div>
        </section>

        <section id="services" className="relative py-20 sm:py-32 min-h-screen flex items-center">
          <div className="w-full">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10 sm:mb-16 px-4">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">13 ინტელექტუალური სერვისი</h2>
              <p className="text-gray-400 text-base sm:text-lg">შექმენი, დააგენერირე, ავტომატიზაცია</p>
            </motion.div>
            <ServicesSlider soundEnabled={soundEnabled} />
          </div>
        </section>

        <section id="agent" className="relative py-20 sm:py-32 min-h-screen">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-8 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">დაილაპარაკე <span className="text-cyan-400">Agent G</span>-სთან</h2>
              <p className="text-gray-400 text-base sm:text-lg">ლოკალური. უსაფრთხო. გონიერი.</p>
            </motion.div>
            <AgentGConsole />
          </div>
        </section>

        <section id="pricing" className="relative py-20 sm:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold
