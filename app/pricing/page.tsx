"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  Crown, 
  Check, 
  Shield, 
  Zap, 
  Clock, 
  Star,
  Sparkles
} from "lucide-react";
import Link from "next/link";

const features = [
  { ka: "პერსონალური Agent G", en: "Personal Agent G", icon: Crown },
  { ka: "გრძელვადიანი მეხსიერება", en: "Long-term memory", icon: Clock },
  { ka: "პრიორიტეტული პასუხები", en: "Priority responses", icon: Zap },
  { ka: "კონსიერჟის რეჟიმი", en: "Concierge mode", icon: Star },
  { ka: "ულიმიტო პროექტები", en: "Unlimited projects", icon: Sparkles },
  { ka: "Premium მხარდაჭერა", en: "Premium support", icon: Shield },
];

export default function PricingPage() {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#05070A] overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-[#05070A] to-[#05070A]" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-[rgba(5,7,10,0.9)] backdrop-blur-xl border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 h-full flex items-center justify-between">
          <Link href="/workspace">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← უკან / Back
            </motion.button>
          </Link>
          <h1 className="text-lg font-bold text-white">ფასები / Pricing</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 pt-24 pb-8 px-4 max-w-md mx-auto">
        {/* Premium Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm mb-4">
            <Crown className="w-4 h-4" />
            <span>Agent G Premium</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">გახდი Premium</h1>
          <p className="text-gray-400">Unlock Your Full Potential</p>
        </motion.div>

        {/* Price Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          className="relative rounded-3xl overflow-hidden mb-8"
        >
          {/* Glow Effect */}
          <motion.div
            animate={{ opacity: isHovering ? 1 : 0.5 }}
            className="absolute -inset-1 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 blur-xl"
          />
          
          {/* Card Content */}
          <div className="relative p-8 bg-[rgba(10,20,35,0.9)] backdrop-blur-xl border border-amber-500/30 rounded-3xl">
            {/* Price */}
            <div className="text-center mb-8">
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl font-bold text-white">2000</span>
                <span className="text-xl text-gray-400">GEL</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">/ წელიწადი / year</p>
            </div>

            {/* Features */}
            <div className="space-y-4 mb-8">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm text-white">{feature.ka}</p>
                      <p className="text-xs text-gray-500">{feature.en}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* CTA Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-semibold shadow-lg shadow-amber-500/30"
            >
              გახსნა / Unlock Premium
            </motion.button>

            {/* Trust Note */}
            <p className="text-center text-xs text-gray-500 mt-4">
              გაუქმება ნებისმიერ დროს • Cancel anytime
            </p>
          </div>
        </motion.div>

        {/* Free Comparison */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="p-6 rounded-2xl bg-white/5 border border-white/10"
        >
          <h3 className="text-sm font-semibold text-white mb-4">Basic vs Premium</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">მეხსიერება / Memory</span>
              <div className="flex gap-4">
                <span className="text-gray-500">7 დღე</span>
                <span className="text-amber-400">∞</span>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">პროექტები / Projects</span>
              <div className="flex gap-4">
                <span className="text-gray-500">5</span>
                <span className="text-amber-400">ულიმიტო</span>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">პასუხის დრო / Response</span>
              <div className="flex gap-4">
                <span className="text-gray-500">სტანდარტული</span>
                <span className="text-amber-400">პრიორიტეტული</span>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
