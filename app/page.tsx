"use client";

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
  Code2
} from "lucide-react";

const services = [
  {
    id: "video-cine-lab",
    title: "Video Cine-Lab",
    description: "Cinematic video generation",
    icon: Video,
    color: "from-cyan-500 to-blue-600",
    href: "/video-cine-lab",
  },
  {
    id: "voice-lab",
    title: "Voice Lab",
    description: "AI voice generation",
    icon: Mic,
    color: "from-purple-500 to-pink-600",
    href: "/voice-lab",
  },
  {
    id: "avatar-builder",
    title: "Avatar Builder",
    description: "Create AI avatars",
    icon: UserCircle,
    color: "from-green-500 to-emerald-600",
    href: "/avatar-builder",
  },
  {
    id: "game-forge",
    title: "Game Forge",
    description: "Game asset generation",
    icon: Gamepad2,
    color: "from-orange-500 to-red-600",
    href: "/game-forge",
  },
  {
    id: "ai-production",
    title: "AI Production",
    description: "Image generation",
    icon: ImageIcon,
    color: "from-yellow-500 to-amber-600",
    href: "/ai-production",
  },
  {
    id: "music-studio",
    title: "Music Studio",
    description: "AI music generation",
    icon: Music,
    color: "from-pink-500 to-rose-600",
    href: "/music-studio",
  },
  {
    id: "magic-studio",
    title: "Magic Studio",
    description: "AI-powered effects",
    icon: Wand2,
    color: "from-indigo-500 to-violet-600",
    href: "/magic-studio",
  },
  {
    id: "sparkle-lab",
    title: "Sparkle Lab",
    description: "Visual effects",
    icon: Sparkles,
    color: "from-teal-500 to-cyan-600",
    href: "/sparkle-lab",
  },
  {
    id: "text-craft",
    title: "Text Craft",
    description: "AI text generation",
    icon: FileText,
    color: "from-blue-500 to-indigo-600",
    href: "/text-craft",
  },
  {
    id: "ai-agent",
    title: "AI Agent",
    description: "Intelligent assistants",
    icon: Bot,
    color: "from-red-500 to-pink-600",
    href: "/ai-agent",
  },
  {
    id: "photo-lab",
    title: "Photo Lab",
    description: "Photo enhancement",
    icon: Camera,
    color: "from-lime-500 to-green-600",
    href: "/photo-lab",
  },
  {
    id: "art-studio",
    title: "Art Studio",
    description: "Digital art creation",
    icon: Palette,
    color: "from-fuchsia-500 to-purple-600",
    href: "/art-studio",
  },
  {
    id: "code-lab",
    title: "Code Lab",
    description: "AI code generation",
    icon: Code2,
    color: "from-slate-500 to-gray-600",
    href: "/code-lab",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-xl font-bold">A</span>
            </div>
            <div>
              <h1 className="text-lg font-bold">Avatar G</h1>
              <p className="text-xs text-gray-400">AI Media Factory</p>
            </div>
          </div>
          <div className="text-xs text-gray-500">v2.0</div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            AI-Powered Media Creation
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            13 powerful AI tools for video, voice, images, code, and more
          </p>
        </div>

        {/* Services Grid - 13 cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <Link
                key={service.id}
                href={service.href}
                className="group relative p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02]"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2 group-hover:text-cyan-400 transition-colors">
                  {service.title}
                </h3>
                <p className="text-sm text-gray-400">
                  {service.description}
                </p>
                <div className="mt-4 flex items-center text-xs text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open →
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-gray-500">
          © 2024 Avatar G. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
