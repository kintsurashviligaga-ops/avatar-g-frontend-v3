"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowRight, Play, Sparkles, Film, Music, Camera, User, Zap } from "lucide-react";
import CinematicHero3D from "@/components/landing/CinematicHero3D";

// Lazy load premium form for performance
const PremiumAgentForm = dynamic(() => import("@/components/landing/PremiumAgentForm"), {
  ssr: false,
  loading: () => null,
});

const services = [
  {
    id: "avatar-builder",
    name: "Avatar Builder",
    icon: User,
    color: "from-cyan-400 to-blue-500",
    description: "Create your digital twin with cinematic realism.",
  },
  {
    id: "music-studio",
    name: "Music Studio",
    icon: Music,
    color: "from-purple-400 to-pink-500",
    description: "Compose AI music in a Suno-like studio flow.",
  },
  {
    id: "media-production",
    name: "Video Generation",
    icon: Film,
    color: "from-red-400 to-orange-500",
    description: "Generate premium video scenes and reels.",
  },
  {
    id: "photo-studio",
    name: "Photo Studio",
    icon: Camera,
    color: "from-yellow-400 to-amber-500",
    description: "Create editorial-grade AI photography.",
  },
];

const stats = [
  { value: "4", label: "Core Studios" },
  { value: "50K+", label: "Active Creators" },
  { value: "1M+", label: "Generations" },
  { value: "99.9%", label: "Uptime" },
];

export default function Home() {
  const [showPremiumForm, setShowPremiumForm] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#05070A] text-white overflow-hidden">
      <div className="absolute inset-0">
        <CinematicHero3D />
      </div>

      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent pointer-events-none" />

      <div className="relative z-10">
        <section className="relative min-h-screen flex items-center pt-28 pb-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full">
            <div className="max-w-2xl space-y-8">
              <div className="flex flex-wrap gap-3">
                <Badge className="w-fit">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 mr-2" />
                  Cinematic Experience v4.1
                </Badge>
                <Badge variant="primary" className="w-fit">
                  premium AI creation suite
                </Badge>
              </div>

              <div className="space-y-4">
                <h1 className="text-5xl md:text-7xl font-bold leading-tight">
                  Build
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    {" "}Anything
                  </span>
                  {" "}with Avatar G
                </h1>
                <p className="text-lg md:text-xl text-gray-300">
                  A cinematic AI studio for avatars, music, video, and photography. Create with a
                  premium workflow, elite rendering, and your personal avatar at the center.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                  <Button variant="primary" size="lg" className="gap-2">
                    Get Started Free
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                  <Button variant="secondary" size="lg" className="gap-2">
                    <Play className="w-4 h-4" />
                    Watch Demo
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                  <Button 
                    onClick={() => setShowPremiumForm(true)}
                    className="gap-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-black font-semibold"
                    size="lg"
                  >
                    <Zap className="w-4 h-4" />
                    Premium Agent
                  </Button>
                </motion.div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/10">
                {stats.map((stat) => (
                  <div key={stat.label} className="space-y-2">
                    <div className="text-2xl md:text-3xl font-bold text-cyan-300">
                      {stat.value}
                    </div>
                    <div className="text-xs text-gray-400 uppercase tracking-widest">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative py-20 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-cyan-300">
                <Sparkles className="w-4 h-4" />
                Your cinematic production suite
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mt-4">Core Studios</h2>
              <p className="text-gray-400 mt-3 max-w-2xl mx-auto">
                Launch each studio with a premium, unified workflow. No broken flows. No
                compromises.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {services.map((service) => {
                const Icon = service.icon;
                return (
                  <motion.div
                    key={service.id}
                    whileHover={{ y: -6 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  >
                    <Card className="h-full p-6 bg-black/40 border-white/10 hover:border-cyan-400/40 transition-colors">
                      <div className="space-y-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">{service.name}</h3>
                          <p className="text-sm text-gray-400 mt-2">{service.description}</p>
                        </div>
                        <Link
                          href={`/services/${service.id}`}
                          className="inline-flex items-center text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                        >
                          Enter Studio
                          <ArrowRight className="ml-2 w-3 h-3" />
                        </Link>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <PremiumAgentForm isOpen={showPremiumForm} onClose={() => setShowPremiumForm(false)} />
    </div>
  );
}