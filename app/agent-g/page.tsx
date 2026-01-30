"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Sparkles, Zap, Shield, Clock, Star } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

export default function AgentGPage() {
  const [isPremium, setIsPremium] = useState(false);

  return (
    <ServicePageShell
      serviceId="agent-g"
      serviceNameKa="Agent G"
      serviceNameEn="Agent G (Luxury)"
      serviceDescriptionKa="თქვენი პერსონალური AI ასისტენტი. ყველა სერვისის გასაღები ერთ ადგილას."
      serviceDescriptionEn="Your personal AI assistant. The key to all services in one place."
      icon={<Crown className="w-6 h-6 text-white" />}
      gradient="from-amber-400 to-yellow-600"
      agentGContext="მე ვარ Agent G, თქვენი პერსონალური ასისტენტი. Premium რეჟიმში მე გახსენდება თქვენი პროექტები, სტილი და პრეფერენციები. / I am Agent G, your personal assistant. In Premium mode, I remember your projects, style, and preferences."
    >
      <div className="p-6">
        {/* Premium Status */}
        <div className="mb-8">
          <div className={`p-6 rounded-2xl border ${isPremium ? 'bg-gradient-to-br from-amber-500/20 to-yellow-600/20 border-amber-500/50' : 'bg-white/5 border-white/10'}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isPremium ? 'bg-gradient-to-br from-amber-400 to-yellow-600' : 'bg-white/10'}`}>
                <Crown className={`w-8 h-8 ${isPremium ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1">
                  {isPremium ? 'Agent G Premium' : 'Agent G Basic'}
                </h3>
                <p className="text-sm text-gray-400">
                  {isPremium ? 'ყველა ფუნქცია გახსნილია / All features unlocked' : 'შეზღუდული ფუნქციები / Limited features'}
                </p>
              </div>
            </div>

            {!isPremium && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-white">2000 GEL</span>
                    <span className="text-sm text-gray-400">/ წელიწადი / year</span>
                  </div>
                  <ul className="space-y-2 mb-4">
                    {[
                      'პერსონალური Agent G / Personal Agent G',
                      'გრძელვადიანი მეხსიერება / Long-term memory',
                      'პრიორიტეტული პასუხები / Priority responses',
                      'კონსიერჟის რეჟიმი / Concierge mode'
                    ].map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                        <Star className="w-4 h-4 text-amber-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsPremium(true)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-semibold shadow-lg shadow-amber-500/30"
                  >
                    გახსნა / Unlock Premium
                  </motion.button>
                </div>
              </div>
            )}

            {isPremium && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-2 gap-4"
              >
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <Clock className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">∞</p>
                  <p className="text-xs text-gray-400">მეხსიერება / Memory</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <Zap className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">Instant</p>
                  <p className="text-xs text-gray-400">პასუხი / Response</p>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Shield, labelKa: 'უსაფრთხოება', labelEn: 'Security', desc: 'Local-first' },
            { icon: Sparkles, labelKa: 'ინტელექტი', labelEn: 'Intelligence', desc: 'GPT-4' },
            { icon: Clock, labelKa: 'გახსენება', labelEn: 'Memory', desc: 'Long-term' },
            { icon: Star, labelKa: 'ხარისხი', labelEn: 'Quality', desc: 'Premium' },
          ].map((feature, i) => (
            <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
              <feature.icon className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-white mb-1">{feature.labelKa}</p>
              <p className="text-xs text-gray-500">{feature.labelEn}</p>
              <p className="text-xs text-cyan-400 mt-1">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </ServicePageShell>
  );
}
