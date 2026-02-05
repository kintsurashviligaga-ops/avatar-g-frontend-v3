"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export default function CTASection() {
  return (
    <section className="py-24 relative">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center p-12 bg-gradient-to-br from-[#D4AF37]/20 via-[#00FFFF]/10 to-transparent border border-[#D4AF37]/30 rounded-3xl relative overflow-hidden"
        >
          {/* Background Animation */}
          <div className="absolute inset-0 pointer-events-none">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute -top-1/2 -left-1/2 w-full h-full border border-[#D4AF37]/20 rounded-full"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="absolute -bottom-1/2 -right-1/2 w-full h-full border border-[#00FFFF]/20 rounded-full"
            />
          </div>

          <div className="relative z-10">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] flex items-center justify-center"
            >
              <Sparkles className="w-8 h-8 text-black" />
            </motion.div>

            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Ready to Create Your
              <br />
              <span className="bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] bg-clip-text text-transparent">
                Digital Twin?
              </span>
            </h2>

            <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
              Join thousands of creators, professionals, and enterprises who are 
              already using Avatar G to power their digital presence.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/services/avatar-builder"
                className="group px-8 py-4 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-[#00FFFF]/30 transition-all"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-white/5 border border-white/20 rounded-2xl font-bold text-lg hover:bg-white/10 transition-all"
              >
                View Dashboard
              </Link>
            </div>

            <p className="text-sm text-gray-500 mt-6">
              No credit card required. Free tier includes 100 generations/month.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
