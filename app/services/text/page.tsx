"use client";

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import SpaceBackground from "@/components/SpaceBackground";
import Header from "@/components/Header";

export default function TextServicePage() {
  const router = useRouter();
  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <Header />
      <section className="pt-24 pb-12 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex flex-col items-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mb-6">
              <span className="text-3xl">🚀</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">Text სერვისი</h1>
            <p className="text-gray-400 mb-8 max-w-md">ეს სერვისი მალე იქნება ხელმისაწვდომი.</p>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => router.push("/services")} className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />სერვისებზე დაბრუნება
            </motion.button>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
