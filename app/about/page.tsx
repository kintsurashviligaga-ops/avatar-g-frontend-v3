"use client";

import { motion } from "framer-motion";
import { Sparkles, Zap, Shield, Globe, Heart } from "lucide-react";
import SpaceBackground from "@/components/SpaceBackground";

const stats = [
  { value: "10K+", label: "მომხმარებელი" },
  { value: "1M+", label: "გენერირებული კონტენტი" },
  { value: "99.9%", label: "აპტაიმი" },
  { value: "24/7", label: "მხარდაჭერა" },
];

const values = [
  { icon: Zap, title: "სისწრაფე", description: "მაქსიმალური პროდუქტიულობა" },
  { icon: Shield, title: "უსაფრთხოება", description: "თქვენი მონაცემები დაცულია" },
  { icon: Globe, title: "გლობალურობა", description: "ხელმისაწვდომია ყველგან" },
  { icon: Heart, title: "მომხმარებელი", description: "ჩვენი პრიორიტეტი" },
];

export default function AboutPage() {
  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <section className="pt-32 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-6">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-cyan-300">ჩვენს შესახებ</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-6">ვქმნით <span className="text-cyan-400">მომავალს</span></h1>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">Avatar G არის ქართული AI პლატფორმა, რომელიც მიზნად ისახავს ხელოვნური ინტელექტის ტექნოლოგიების ხელმისაწვდომობას ყველასთვის.</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center p-6 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">{stat.value}</div>
                <div className="text-gray-400">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <h2 className="text-3xl font-bold text-white text-center mb-12">ჩვენი ღირებულებები</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((value, index) => (
                <motion.div key={value.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + index * 0.1 }} className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"><value.icon className="w-6 h-6 text-white" /></div>
                  <h3 className="text-lg font-semibold text-white mb-2">{value.title}</h3>
                  <p className="text-gray-400 text-sm">{value.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
