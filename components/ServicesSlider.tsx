"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Video,
  Mic,
  UserCircle,
  Gamepad2,
  Image as ImageIcon,
  Music,
  Wand2,
  Sparkles,
  FileText,
  Bot,
  Camera,
  Palette,
  Code2,
  Briefcase,
  Zap,
  Crown,
} from "lucide-react";

const services = [
  {
    id: "video-cine-lab",
    title: "ვიდეო",
    subtitle: "Cinematic",
    icon: Video,
    color: "from-orange-500 to-red-600",
    href: "/video-cine-lab",
    implemented: true,
  },
  {
    id: "voice-lab",
    title: "ხმა",
    subtitle: "Voice AI",
    icon: Mic,
    color: "from-purple-500 to-pink-600",
    href: "/voice-lab",
    implemented: true,
  },
  {
    id: "avatar-builder",
    title: "ავატარი",
    subtitle: "Avatars",
    icon: UserCircle,
    color: "from-green-500 to-emerald-600",
    href: "/avatar-builder",
    implemented: true,
  },
  {
    id: "image-architect",
    title: "სურათი",
    subtitle: "Images",
    icon: ImageIcon,
    color: "from-cyan-500 to-blue-600",
    href: "/image-architect",
    implemented: true,
  },
  {
    id: "music-studio",
    title: "მუსიკა",
    subtitle: "Music",
    icon: Music,
    color: "from-pink-500 to-rose-600",
    href: "/music-studio",
    implemented: true,
  },
  {
    id: "game-forge",
    title: "თამაში",
    subtitle: "Game Assets",
    icon: Gamepad2,
    color: "from-indigo-500 to-violet-600",
    href: "/game-forge",
    implemented: true,
  },
  {
    id: "ai-production",
    title: "პროდაქშენი",
    subtitle: "Production",
    icon: Zap,
    color: "from-yellow-500 to-amber-600",
    href: "/ai-production",
    implemented: true,
  },
  {
    id: "business-agent",
    title: "ბიზნესი",
    subtitle: "Business",
    icon: Briefcase,
    color: "from-blue-500 to-indigo-600",
    href: "/business-agent",
    implemented: true,
  },
  {
    id: "prompt-builder",
    title: "პრომპტი",
    subtitle: "Prompts",
    icon: Sparkles,
    color: "from-teal-500 to-cyan-600",
    href: "/prompt-builder",
    implemented: true,
  },
  {
    id: "image-generator",
    title: "გენერატორი",
    subtitle: "Fast Gen",
    icon: Camera,
    color: "from-lime-500 to-green-600",
    href: "/image-generator",
    implemented: true,
  },
  {
    id: "video-generator",
    title: "ვიდეო გენ",
    subtitle: "Quick Video",
    icon: Video,
    color: "from-red-500 to-pink-600",
    href: "/video-generator",
    implemented: true,
  },
  {
    id: "text-intelligence",
    title: "ტექსტი",
    subtitle: "Writing",
    icon: FileText,
    color: "from-slate-500 to-gray-600",
    href: "/text-intelligence",
    implemented: true,
  },
  {
    id: "agent-g",
    title: "Agent G",
    subtitle: "Premium",
    icon: Crown,
    color: "from-amber-500 to-yellow-600",
    href: "/agent-g",
    implemented: true,
    isPremium: true,
  },
];

export default function ServicesSlider() {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollLeft = containerRef.current.scrollLeft;
    const itemWidth = 280 + 16;
    const newIndex = Math.round(scrollLeft / itemWidth);
    setActiveIndex(newIndex);
  };

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide px-4 py-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {services.map((service, index) => {
          const Icon = service.icon;
          return (
            <Link
              key={service.id}
              href={service.href}
              className="flex-shrink-0 w-[280px] snap-center"
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`relative p-6 rounded-3xl border backdrop-blur-sm transition-all ${
                  index === activeIndex
                    ? "bg-white/10 border-white/20"
                    : "bg-white/5 border-white/10"
                }`}
              >
                {service.isPremium && (
                  <div className="absolute top-3 right-3">
                    <Crown className="w-4 h-4 text-amber-400" />
                  </div>
                )}

                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-4`}
                >
                  <Icon className="w-7 h-7 text-white" />
                </div>

                <h3 className="text-lg font-bold mb-1">{service.title}</h3>
                <p className="text-sm text-gray-400">{service.subtitle}</p>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-cyan-400">Open →</span>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                </div>
              </motion.div>
            </Link>
          );
        })}
      </div>

      {/* Pagination Dots */}
      <div className="flex justify-center gap-2 mt-4">
        {services.map((_, index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-all ${
              index === activeIndex ? "bg-cyan-500 w-4" : "bg-white/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
