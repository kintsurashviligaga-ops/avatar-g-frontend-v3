"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import SpaceBackground from "@/components/SpaceBackground";
import Header from "@/components/Header";
import ChatInterface from "@/components/ChatInterface";
import { MessageSquare, Image as ImageIcon, Video, Mic, FileText, Code, Sparkles, ChevronRight } from "lucide-react";

const quickActions = [
  { icon: MessageSquare, label: "ჩატი", color: "from-blue-500 to-cyan-400", href: "/services/chat" },
  { icon: ImageIcon, label: "სურათი", color: "from-purple-500 to-pink-500", href: "/services/image" },
  { icon: Video, label: "ვიდეო", color: "from-orange-500 to-red-500", href: "/services/video" },
  { icon: Mic, label: "ხმა", color: "from-green-500 to-emerald-400", href: "/services/voice" },
  { icon: FileText, label: "ტექსტი", color: "from-yellow-500 to-orange-400", href: "/services/text" },
  { icon: Code, label: "კოდი", color: "from-indigo-500 to-purple-500", href: "/services/code" },
];

export default function WorkspacePage() {
  const router = useRouter();
  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <Header />
      <section className="pt-24 pb-12 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[calc(100vh-6rem)]">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1 space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-cyan-400" />სწრაფი მენიუ</h2>
                <div className="space-y-2">
                  {quickActions.map((action) => (
                    <motion.button key={action.href} whileHover={{ x: 4 }} onClick={() => router.push(action.href)} className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 transition-all group">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center`}><action.icon className="w-4 h-4 text-white" /></div>
                        <span className="text-gray-300 group-hover:text-white transition-colors">{action.label}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors" />
                    </motion.button>
                  ))}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
                <h3 className="text-sm font-semibold text-cyan-400 mb-2">პრო ვერსია</h3>
                <p className="text-xs text-gray-400 mb-3">მიიღე წვდომა ყველა პრემიუმ ფუნქციაზე</p>
                <button className="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-cyan-500/25 transition-shadow">განახლება</button>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-3 h-full"><ChatInterface /></motion.div>
          </div>
        </div>
      </section>
    </main>
  );
}
