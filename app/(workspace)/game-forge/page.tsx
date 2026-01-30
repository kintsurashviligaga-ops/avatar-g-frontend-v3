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
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">აირჩიე შენი გეგმა</h2>
              <p className="text-gray-400 text-base sm:text-lg">გააფართოე შესაძლებლობები</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
              {PRICING.map((plan, index) => (
                <motion.div
                  key={plan.tier}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -8 }}
                  className={`relative rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl border ${
                    plan.luxury
                      ? "bg-gradient-to-b from-yellow-500/10 to-black/40 border-yellow-500/30"
                      : plan.popular
                      ? "bg-gradient-to-b from-red-500/10 to-black/40 border-red-500/30"
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-red-500 text-white text-xs font-semibold">
                      პოპულარული
                    </div>
                  )}
                  {plan.luxury && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-yellow-500 text-black text-xs font-semibold">
                      ექსკლუზიური
                    </div>
                  )}
                  <div className="text-center mb-6 sm:mb-8">
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">{plan.tier}</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-3xl sm:text-4xl font-bold" style={{ color: plan.color }}>{plan.price}</span>
                      <span className="text-gray-400 text-sm">{plan.period}</span>
                    </div>
                    <p className="text-gray-400 text-sm mt-2">{plan.description}</p>
                  </div>
                  <ul className="space-y-3 mb-6 sm:mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: plan.color }} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full py-3 sm:py-4 rounded-xl font-semibold transition-colors ${
                      plan.luxury
                        ? "bg-yellow-500 text-black hover:bg-yellow-400"
                        : plan.popular
                        ? "bg-red-500 text-white hover:bg-red-400"
                        : "bg-white text-black hover:bg-gray-100"
                    }`}
                  >
                    აირჩიე {plan.tier}
                  </motion.button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <footer className="relative py-12 sm:py-20 border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="text-center md:text-left">
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Avatar G</h3>
                <p className="text-gray-400 text-sm">პერსონალური AI ეკოსისტემა</p>
              </div>
              <div className="flex gap-6 text-sm text-gray-400">
                <a href="#" className="hover:text-white transition-colors">კონფიდენციალურობა</a>
                <a href="#" className="hover:text-white transition-colors">წესები</a>
                <a href="#" className="hover:text-white transition-colors">კონტაქტი</a>
              </div>
              <p className="text-gray-500 text-xs">© 2025 Avatar G. ყველა უფლება დაცულია.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
