"use client";

import React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, MessageSquare, Image, Music, Video, Wand2, Gamepad2, Brain } from "lucide-react";
import SpaceSingularityBackground from "@/components/SpaceSingularityBackground";
import Agent3D from "@/components/Agent3D";
import GlobalChatbot from "@/components/GlobalChatbot";

const services = [
  { id: "text-intelligence", title: "ტექსტის ინტელექტი", description: "AI ტექსტის ანალიზი და გენერაცია", icon: MessageSquare, color: "from-cyan-500 to-blue-500" },
  { id: "prompt-builder", title: "პრომპტის ბილდერი", description: "პროფესიონალური პრომპტების შექმნა", icon: Sparkles, color: "from-violet-500 to-purple-500" },
  { id: "image-generator", title: "სურათის გენერატორი", description: "AI სურათების გენერაცია", icon: Image, color: "from-pink-500 to-rose-500" },
  { id: "image-architect", title: "სურათის არქიტექტორი", description: "სურათების რედაქტირება AI-ით", icon: Wand2, color: "from-amber-500 to-orange-500" },
  { id: "music-studio", title: "მუსიკის სტუდია", description: "AI მუსიკის გენერაცია", icon: Music, color: "from-emerald-500 to-teal-500" },
  { id: "voice-lab", title: "ხმის ლაბორატორია", description: "ხმის კლონირება და TTS", icon: MessageSquare, color: "from-indigo-500 to-blue-500" },
  { id: "video-generator", title: "ვიდეო გენერატორი", description: "AI ვიდეოების შექმნა", icon: Video, color: "from-red-500 to-pink-500" },
  { id: "video-cine-lab", title: "ვიდეო კინო ლაბი", description: "პროფესიონალური ვიდეო ედიტირება", icon: Video, color: "from-purple-500 to-indigo-500" },
  { id: "game-forge", title: "თამაშის ფორჯი", description: "AI თამაშების დეველოპმენტი", icon: Gamepad2, color: "from-green-500 to-emerald-500" },
  { id: "agent-g", title: "Agent G", description: "თქვენი პერსონალური AI აგენტი", icon: Brain, color: "from-cyan-500 to-blue-600" },
];

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070A]">
      <SpaceSingularityBackground />
      <Agent3D />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        {/* Hero Text */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-gray-300">AI-Powered Platform</span>
          </motion.div>
          
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white mb-6 tracking-tight">
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              Avatar G
            </span>
          </h1>
          
          <p className="text-xl sm:text-2xl text-gray-400 max-w-2xl mx-auto mb-4">
            შექმენი მომავალი AI-სთან ერთად
          </p>
          
          <p className="text-gray-500 max-w-xl mx-auto mb-8">
            პროფესიონალური AI ინსტრუმენტები ქართულ ენაზე
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push("/services")}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25"
            >
              <span>დაიწყე ახლა</span>
              <ArrowRight className="w-5 h-5" />
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push("/services")}
              className="px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-colors"
            >
              ყველა სერვისი
            </motion.button>
          </div>
        </motion.div>

        {/* Service Cards Preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="w-full max-w-6xl"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {services.slice(0, 5).map((service, index) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                whileHover={{ scale: 1.05, y: -5 }}
                onClick={() => router.push(`/services/${service.id}`)}
                className="group cursor-pointer"
              >
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-cyan-500/50 transition-all h-full">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${service.color} flex items-center justify-center mb-3`}>
                    <service.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-medium text-white mb-1 group-hover:text-cyan-400 transition-colors">
                    {service.title}
                  </h3>
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {service.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-center mt-6"
          >
            <button
              onClick={() => router.push("/services")}
              className="text-cyan-400 hover:text-cyan-300 text-sm font-medium flex items-center gap-1 mx-auto"
            >
              <span>ყველა სერვისის ნახვა</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        </motion.div>
      </div>

      <GlobalChatbot />
    </main>
  );
}
