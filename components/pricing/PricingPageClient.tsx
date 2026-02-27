"use client";

import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import SpaceBackground from "@/components/SpaceBackground";
import Link from "next/link";

import { PRICING_PLANS } from '@/lib/pricing/canonicalPricing';
const plans = PRICING_PLANS;

export default function PricingPageClient() {
  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <section className="pt-32 pb-24">
        <div className="mx-auto max-w-[92vw] sm:max-w-2xl md:max-w-4xl lg:max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12 md:mb-16">
            <h1 className="text-5xl font-bold text-white mb-4">
              Choose Your <span className="text-cyan-400">Plan</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Start free and upgrade when you&apos;re ready
            </p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {plans.map((plan, index) => (
              <motion.div 
                key={plan.name} 
                initial={{ opacity: 0, y: 24 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: index * 0.08, duration: 0.5, ease: "easeOut" }} 
                className={`relative p-10 md:p-12 rounded-3xl shadow-2xl border transition-all duration-300 ${plan.popular ? "bg-gradient-to-b from-cyan-500/20 to-blue-500/20 border-2 border-cyan-400/70 scale-105 ring-2 ring-cyan-400/30 z-10" : "bg-white/5 border-white/15"} backdrop-blur-lg`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium rounded-full flex items-center gap-1">
                    <Sparkles className="w-4 h-4" />
                    Most Popular
                  </div>
                )}
                <div className="text-center mb-10">
                  <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-6 md:my-8" aria-hidden="true" />
                  <h3 className="text-3xl md:text-4xl font-extrabold text-white mb-3 tracking-tight">{plan.name}</h3>
                  <p className="text-gray-400 text-base mb-5">{plan.description}</p>
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-5xl md:text-6xl font-extrabold text-cyan-300 drop-shadow">${plan.price}</span>
                    <span className="text-gray-400 text-lg">/month</span>
                  </div>
                </div>
                <ul className="space-y-4 mb-10">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-4">
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${plan.gradient} flex items-center justify-center flex-shrink-0 shadow-md`}>
                        <Check className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-gray-200 text-base md:text-lg font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/dashboard/billing">
                  <motion.button 
                    whileHover={{ scale: 1.03 }} 
                    whileTap={{ scale: 0.97 }} 
                    className={`w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-lg focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:outline-none ${plan.popular ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-cyan-500/25 ring-2 ring-cyan-400/60" : "bg-white/10 text-white hover:bg-white/20"}`}
                    aria-label={plan.cta}
                  >
                    {plan.cta}
                  </motion.button>
                </Link>
                <p className="mt-3 text-xs text-gray-400 text-center">
                  {plan.name === "Free"
                    ? "No card required. Upgrade only when Avatar G feels essential."
                    : "Cancel anytime. No long-term contracts or hidden fees."}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
