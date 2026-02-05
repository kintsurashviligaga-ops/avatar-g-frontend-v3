"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MapPin, Phone, Send, CheckCircle } from "lucide-react";
import SpaceBackground from "@/components/SpaceBackground";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <Header />
      <section className="pt-32 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
            <h1 className="text-5xl font-bold text-white mb-4">დაგვიკავშირდი</h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">გაქვთ კითხვები? ჩვენ მზად ვართ დაგეხმაროთ</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0"><Mail className="w-6 h-6 text-white" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Email</h3>
                  <p className="text-gray-400">hello@avatarg.ai</p>
                  <p className="text-gray-400">support@avatarg.ai</p>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center flex-shrink-0"><MapPin className="w-6 h-6 text-white" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">მისამართი</h3>
                  <p className="text-gray-400">თბილისი, საქართველო</p>
                  <p className="text-gray-400">საბუნიაშვილის ქ. 15ა</p>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0"><Phone className="w-6 h-6 text-white" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">ტელეფონი</h3>
                  <p className="text-gray-400">+995 32 2 00 00 00</p>
                  <p className="text-gray-400">+995 555 00 00 00</p>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              {sent ? (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4"><CheckCircle className="w-8 h-8 text-green-400" /></div>
                  <h3 className="text-xl font-semibold text-white mb-2">შეტყობინება გაგზავნილია!</h3>
                  <p className="text-gray-400">მალე დაგიკავშირდებით</p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">სახელი</label>
                    <input type="text" required className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50" placeholder="თქვენი სახელი" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                    <input type="email" required className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50" placeholder="your@email.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">შეტყობინება</label>
                    <textarea rows={4} required className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 resize-none focus:outline-none focus:border-cyan-500/50" placeholder="რით შეგვიძლია დაგეხმაროთ?" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-cyan-500/25 transition-shadow">
                    <Send className="w-5 h-5" />გაგზავნა
                  </motion.button>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
