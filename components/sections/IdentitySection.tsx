"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { CheckCircle, ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Create Avatar",
    description: "Generate your 3D digital twin with our AI photogrammetry system",
    duration: "2 minutes"
  },
  {
    number: "02",
    title: "Clone Voice",
    description: "Record 60 seconds of audio to create your voice model",
    duration: "1 minute"
  },
  {
    number: "03",
    title: "Generate Media",
    description: "Use your identity across all AI services instantly",
    duration: "Instant"
  }
];

export default function IdentitySection() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#D4AF37]/10 rounded-full blur-[150px] pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Your Identity,
              <br />
              <span className="bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] bg-clip-text text-transparent">
                Everywhere
              </span>
            </h2>
            
            <p className="text-gray-400 text-lg mb-8">
              Create once, use everywhere. Your digital twin becomes the foundation 
              for all AI-generated content, maintaining consistency across videos, 
              images, voice, and music.
            </p>

            <div className="space-y-6">
              {[
                "32-point facial mesh technology",
                "97.3% voice cloning accuracy",
                "Cross-platform identity sync",
                "Enterprise-grade security"
              ].map((feature, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <CheckCircle className="w-5 h-5 text-[#00FFFF] flex-shrink-0" />
                  <span className="text-gray-300">{feature}</span>
                </motion.div>
              ))}
            </div>

            <Link
              href="/services/avatar-builder"
              className="inline-flex items-center gap-2 mt-8 px-8 py-4 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-2xl font-bold hover:shadow-lg hover:shadow-[#00FFFF]/20 transition-all"
            >
              Start Creating
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>

          {/* Right Content - Steps */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            {steps.map((step, idx) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.2 }}
                className="relative p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:border-[#D4AF37]/50 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <span className="text-4xl font-bold text-white/10 group-hover:text-[#D4AF37]/30 transition-colors">
                    {step.number}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xl font-semibold">{step.title}</h3>
                      <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-full">
                        {step.duration}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm">
                      {step.description}
                    </p>
                  </div>
                </div>
                
                {/* Connector Line */}
                {idx < steps.length - 1 && (
                  <div className="absolute left-10 top-full w-px h-6 bg-gradient-to-b from-[#D4AF37]/50 to-transparent" />
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
