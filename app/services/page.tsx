"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Sparkles, MessageSquare, Image, Music, Video, Wand2, Gamepad2, Briefcase, Zap, Bot, ChevronRight, Search, ArrowLeft } from "lucide-react";
import SpaceSingularityBackground from "@/components/SpaceSingularityBackground";
import GlobalChatbot from "@/components/GlobalChatbot";
import ServiceCard from "@/components/ServiceCard";

const services = [
  { id: "text-intelligence", title: "ტექსტის ინტელექტი", description: "პროფესიონალური წერა და ანალიზი", icon: MessageSquare, color: "from-cyan-500 to-blue-500", category: "ტექსტი" },
  { id: "prompt-builder", title: "პრომპტის ბილდერი", description: "AI პრომპტების ოპტიმიზაცია", icon: Sparkles, color: "from-violet-500 to-purple-500", category: "ტექსტი" },
  { id: "image-generator", title: "სურათის გენერატორი", description: "AI სურათების შექმნა", icon: Image, color: "from-pink-500 to-rose-500", category: "ვიზუალი" },
  { id: "image-architect", title: "სურათის არქიტექტორი", description: "დიზაინის სისტემები", icon: Wand2, color: "from-indigo-500 to-blue-600", category: "ვიზუალი" },
  { id: "music-studio", title: "მუსიკის სტუდია", description: "AI მუსიკის შექმნა", icon: Music, color: "from-amber-500 to-orange-500", category: "აუდიო" },
  { id: "voice-lab", title: "ხმის ლაბორატორია", description: "ხმის გენერაცია და კლონირება", icon: Bot, color: "from-emerald-500 to-teal-500", category: "აუდიო" },
  { id: "video-generator", title: "ვიდეო გენერატორი", description: "AI ვიდეოების შექმნა", icon: Video, color: "from-red-500 to-pink-500", category: "ვიდეო" },
  { id: "video-cine-lab", title: "ვიდეო კინო ლაბი", description: "კინემატოგრაფიული პროდუქცია", icon: Video, color: "from-orange-500 to-red-500", category: "ვიდეო" },
  { id: "game-forge", title: "თამაშის ფორჯი", description: "თამაშის დიზაინი", icon: Gamepad2, color: "from-emerald-500 to-green-500", category: "თამაში" },
  { id: "ai-production", title: "AI პროდუქცია", description: "კონტენტის ქარხანა", icon: Zap, color: "from-yellow-500 to-amber-500", category: "პროდუქცია" },
  { id: "business-agent", title: "ბიზნეს აგენტი", description: "ბიზნეს სტრატეგია", icon: Briefcase, color: "from-blue-500 to-indigo-500", category: "ბიზნესი" },
];

const categories = ["ყველა", "ტექსტი", "ვიზუალი", "აუდიო", "ვიდეო", "თამაში", "პროდუქცია", "ბიზნესი"];

export default function ServicesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ყველა");

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="min-h-screen bg-[#05070A] flex items-center justify-center"><div className="animate-pulse text-cyan-400">Loading...</div></div>;

  const filteredServices = services.filter((service) => {
    const matchesSearch = service.title.toLowerCase().includes(searchQuery.toLowerCase()) || service.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "ყველა" || service.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070A]">
      <SpaceSingularityBackground />
      <div className="relative z-10">
        <header className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center gap-4 mb-6">
              <button onClick={() => router.push("/")} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /><span>უკან</span></button>
            </div>
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">ყველა სერვისი</h1>
              <p className="text-gray-400 max-w-2xl mx-auto mb-6 text-lg">აირჩიეთ AI ინსტრუმენტი თქვენი პროექტისთვის</p>
              <div className="relative max-w-md mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ძიება სერვისებში..." className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50" />
              </div>
            </motion.div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {categories.map((category) => <button key={category} onClick={() => setSelectedCategory(category)} className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedCategory === category ? "bg-cyan-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>{category}</button>)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredServices.map((service, index) => <ServiceCard key={service.id} {...service} index={index} />)}
          </div>
          {filteredServices.length === 0 && <div className="text-center py-12"><p className="text-gray-400">სერვისები ვერ მოიძებნა</p></div>}
        </main>
      </div>
      <GlobalChatbot />
    </div>
  );
}
