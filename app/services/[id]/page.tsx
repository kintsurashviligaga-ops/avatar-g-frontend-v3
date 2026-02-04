"use client";

import React, { use } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { 
  Sparkles, 
  ArrowLeft, 
  MessageSquare, 
  Image, 
  Music, 
  Video, 
  Wand2, 
  Gamepad2, 
  Brain,
  Loader2
} from "lucide-react";
import SpaceSingularityBackground from "@/components/SpaceSingularityBackground";
import GlobalChatbot from "@/components/GlobalChatbot";
import ImageGenerator from "@/components/ImageGenerator";

const services: Record<string, {
  title: string;
  description: string;
  icon: any;
  color: string;
  component?: React.ReactNode;
}> = {
  "text-intelligence": {
    title: "ტექსტის ინტელექტი",
    description: "AI ტექსტის ანალიზი და გენერაცია",
    icon: MessageSquare,
    color: "from-cyan-500 to-blue-500",
  },
  "prompt-builder": {
    title: "პრომპტის ბილდერი",
    description: "პროფესიონალური პრომპტების შექმნა",
    icon: Sparkles,
    color: "from-violet-500 to-purple-500",
  },
  "image-generator": {
    title: "სურათის გენერატორი",
    description: "AI სურათების გენერაცია Stability AI-ით",
    icon: Image,
    color: "from-pink-500 to-rose-500",
    component: <ImageGenerator />,
  },
  "image-architect": {
    title: "სურათის არქიტექტორი",
    description: "სურათების რედაქტირება AI-ით",
    icon: Wand2,
    color: "from-amber-500 to-orange-500",
  },
  "music-studio": {
    title: "მუსიკის სტუდია",
    description: "AI მუსიკის გენერაცია",
    icon: Music,
    color: "from-emerald-500 to-teal-500",
  },
  "voice-lab": {
    title: "ხმის ლაბორატორია",
    description: "ხმის კლონირება და TTS",
    icon: MessageSquare,
    color: "from-indigo-500 to-blue-500",
  },
  "video-generator": {
    title: "ვიდეო გენერატორი",
    description: "AI ვიდეოების შექმნა",
    icon: Video,
    color: "from-red-500 to-pink-500",
  },
  "video-cine-lab": {
    title: "ვიდეო კინო ლაბი",
    description: "პროფესიონალური ვიდეო ედიტირება",
    icon: Video,
    color: "from-purple-500 to-indigo-500",
  },
  "game-forge": {
    title: "თამაშის ფორჯი",
    description: "AI თამაშების დეველოპმენტი",
    icon: Gamepad2,
    color: "from-green-500 to-emerald-500",
  },
  "agent-g": {
    title: "Agent G",
    description: "თქვენი პერსონალური AI აგენტი",
    icon: Brain,
    color: "from-cyan-500 to-blue-600",
  },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ServicePage({ params }: PageProps) {
  const router = useRouter();
  const { id } = use(params);
  const service = services[id];

  if (!service) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#05070A] flex items-center justify-center">
        <SpaceSingularityBackground />
        <div className="text-center">
          <h1 className="text-2xl text-white mb-4">სერვისი ვერ მოიძებნა</h1>
          <button
            onClick={() => router.push("/services")}
            className="px-4 py-2 rounded-lg bg-cyan-500 text-white"
          >
            სერვისებზე დაბრუნება
          </button>
        </div>
      </main>
    );
  }

  const Icon = service.icon;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070A]">
      <SpaceSingularityBackground />
      
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#05070A]/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/services")}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{service.title}</h1>
              <p className="text-sm text-gray-400">{service.description}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {service.component ? (
          service.component
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-8 text-center"
          >
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center mx-auto mb-6`}>
              <Icon className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">{service.title}</h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              {service.description}
            </p>
            <p className="text-cyan-400 text-sm">
              🚧 ეს სერვისი მალე დაემატება
            </p>
          </motion.div>
        )}
      </div>

      <GlobalChatbot />
    </main>
  );
}
