"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { 
  Sparkles, 
  MessageSquare, 
  Image, 
  Music, 
  Video, 
  Wand2, 
  Gamepad2, 
  Brain,
  ArrowLeft,
  Search,
  Filter
} from "lucide-react";
import SpaceSingularityBackground from "@/components/SpaceSingularityBackground";
import GlobalChatbot from "@/components/GlobalChatbot";
import ServiceCard from "@/components/ServiceCard";

const categories = ["ყველა", "ტექსტი", "სურათი", "ვიდეო", "აუდიო", "სხვა"];

const services = [
  { id: "text-intelligence", title: "ტექსტის ინტელექტი", description: "AI ტექსტის ანალიზი და გენერაცია", icon: MessageSquare, color: "from-cyan-500 to-blue-500", category: "ტექსტი" },
  { id: "prompt-builder", title: "პრომპტის ბილდერი", description: "პროფესიონალური პრომპტების შექმნა", icon: Sparkles, color: "from-violet-500 to-purple-500", category: "ტექსტი" },
  { id: "image-generator", title: "სურათის გენერატორი", description: "AI სურათების გენერაცია Stability AI-ით", icon: Image, color: "from-pink-500 to-rose-500", category: "სურათი" },
  { id: "image-architect", title: "სურათის არქიტექტორი", description: "სურათების რედაქტირება AI-ით", icon: Wand2, color: "from-amber-500 to-orange-500", category: "სურათი" },
  { id: "music-studio", title: "მუსიკის სტუდია", description: "AI მუსიკის გენერაცია", icon: Music, color: "from-emerald-500 to-teal-500", category: "აუდიო" },
  { id: "voice-lab", title: "ხმის ლაბორატორია", description: "ხმის კლონირება და TTS", icon: MessageSquare, color: "from-indigo-500 to-blue-500", category: "აუდიო" },
  { id: "video-generator", title: "ვიდეო გენერატორი", description: "AI ვიდეოების შექმნა", icon: Video, color: "from-red-500 to-pink-500", category: "ვიდეო" },
  { id: "video-cine-lab", title: "ვიდეო კინო ლაბი", description: "პროფესიონალური ვიდეო ედიტირება", icon: Video, color: "from-purple-500 to-indigo-500", category: "ვიდეო" },
  { id: "game-forge", title: "თამაშის ფორჯი", description: "AI თამაშების დეველოპმენტი", icon: Gamepad2, color: "from-green-500 to-emerald-500", category: "სხვა" },
  { id: "agent-g", title: "Agent G", description: "თქვენი პერსონალური AI აგენტი", icon: Brain, color: "from-cyan-500 to-blue-600", category: "სხვა" },
];

export default function ServicesPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("ყველა");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredServices = services.filter(service => {
    const matchesCategory = selectedCategory === "ყველა" || service.category === selectedCategory;
    const matchesSearch = service.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         service.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070A]">
      <SpaceSingularityBackground />
      
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#05070A]/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/")}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">სერვისები</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        {/* Search and Filter */}
        <div className="mb-8 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="მოძებნე სერვისი..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? "bg-cyan-500 text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Services Grid */}
        {filteredServices.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredServices.map((service, index) => (
              <ServiceCard
                key={service.id}
                id={service.id}
                title={service.title}
                description={service.description}
                icon={service.icon}
                color={service.color}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">სერვისები ვერ მოიძებნა</p>
          </div>
        )}
      </div>

      <GlobalChatbot />
    </main>
  );
}
