"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Play, Zap } from "lucide-react";
import { SERVICE_REGISTRY } from "@/lib/service-registry";
import { OrbitSolarSystem } from "@/components/OrbitSolarSystem";

// Lazy load premium form for performance
const PremiumAgentForm = dynamic(() => import("@/components/landing/PremiumAgentForm"), {
  ssr: false,
  loading: () => null,
});

const stats = [
  { value: "50K+", label: "Active Creators" },
  { value: "1M+", label: "Generations" },
  { value: "99.9%", label: "Uptime" },
];

export default function LandingPageClient() {
  const [showPremiumForm, setShowPremiumForm] = useState(false);
  const enabledServices = SERVICE_REGISTRY.filter((s) => s.enabled);
  const serviceStats = [{ value: String(enabledServices.length), label: "Active Services" }, ...stats];

  return (
    <div className="relative min-h-screen bg-[#05070A] text-white overflow-hidden">
      {/* ── Hero section ─────────────────────────────────────── */}
      <section className="relative pt-28 pb-10 px-4 sm:px-6 text-center">
        <motion.div
          className="mx-auto max-w-3xl space-y-6"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className="flex flex-wrap justify-center gap-3">
            <Badge className="w-fit">
              <span className="w-2 h-2 rounded-full bg-cyan-400 mr-2" />
              Orbit Experience v5.0
            </Badge>
            <Badge variant="primary" className="w-fit">
              premium AI creation suite
            </Badge>
          </div>

          <p className="text-sm md:text-base text-cyan-300 tracking-[0.18em] uppercase">
            პრემიუმ AI სტუდია თბილისიდან
          </p>

          <h1 className="text-5xl md:text-7xl font-bold leading-[1.05] text-balance">
            Your Universe.
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Your Avatar.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-300 text-balance max-w-xl mx-auto">
            13 AI modules orbit around your live avatar — video, music,
            images, social & more. Everything in one workspace.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                variant="primary"
                size="lg"
                className="gap-2 shadow-[0_0_32px_rgba(34,211,238,0.35)] hover:shadow-[0_0_40px_rgba(34,211,238,0.45)]"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button variant="outline" size="lg" className="gap-2 border-white/30">
                <Play className="w-4 h-4" />
                Watch Demo
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                onClick={() => setShowPremiumForm(true)}
                className="gap-2 bg-gradient-to-r from-amber-300 to-orange-500 hover:from-amber-400 hover:to-orange-600 text-black font-semibold shadow-[0_0_20px_rgba(251,191,36,0.25)] hover:shadow-[0_0_26px_rgba(251,191,36,0.35)]"
                size="lg"
              >
                <Zap className="w-4 h-4" />
                Premium Agent
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ── Orbit Solar System — THE hero visual ────────────── */}
      <section className="relative pb-12 px-4 sm:px-6">
        <OrbitSolarSystem />
      </section>

      {/* ── Stats bar ────────────────────────────────────────── */}
      <section className="relative pb-20 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-white/10 pt-8">
          {serviceStats.map((stat) => (
            <div key={stat.label} className="text-center space-y-2">
              <div className="text-2xl md:text-3xl font-bold text-cyan-300">{stat.value}</div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <PremiumAgentForm isOpen={showPremiumForm} onClose={() => setShowPremiumForm(false)} />
    </div>
  );
}
