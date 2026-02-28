"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Play, Zap, Check, Sparkles } from "lucide-react";
import { SERVICE_REGISTRY } from "@/lib/service-registry";
import { OrbitSolarSystem } from "@/components/OrbitSolarSystem";
import { PRICING_PLANS } from "@/lib/pricing/canonicalPricing";
import Link from "next/link";

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

      {/* ── Pricing Section ──────────────────────────────────── */}
      <section id="pricing" className="relative py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
              Choose Your <span className="text-cyan-400">Plan</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-xl mx-auto">
              Upgrade, downgrade, or cancel anytime.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRICING_PLANS.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className={`relative flex flex-col rounded-2xl border p-6 backdrop-blur-lg ${
                  plan.popular
                    ? "bg-gradient-to-b from-cyan-500/20 to-blue-500/20 border-cyan-400/60 ring-2 ring-cyan-400/30"
                    : "bg-white/5 border-white/15"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-medium rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Most Popular
                  </div>
                )}
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
                <div className="flex items-baseline gap-1 mt-4 mb-6">
                  <span className="text-4xl font-extrabold text-cyan-300">${plan.price}</span>
                  <span className="text-gray-400 text-sm">/mo</span>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.price === 0 ? "/signup" : `/signup?plan=${plan.name.toLowerCase()}`}
                  className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    plan.popular
                      ? "bg-cyan-500 hover:bg-cyan-400 text-black"
                      : "bg-white/10 hover:bg-white/20 text-white"
                  }`}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 px-4 sm:px-6 text-center">
        <p className="text-sm text-gray-500">© {new Date().getFullYear()} MyAvatar.ge — All rights reserved</p>
      </footer>

      <PremiumAgentForm isOpen={showPremiumForm} onClose={() => setShowPremiumForm(false)} />
    </div>
  );
}
