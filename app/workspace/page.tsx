"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  Search, 
  Sparkles, 
  MessageSquare, 
  Image as ImageIcon, 
  Palette, 
  Music, 
  Mic, 
  Video, 
  Film, 
  Gamepad2, 
  Factory, 
  Briefcase
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import LanguageToggle from "@/components/LanguageToggle";
import AIChatbotWidget from "@/components/AIChatbotWidget";

interface Service {
  id: string;
  nameKa: string;
  nameEn: string;
  descriptionKa: string;
  descriptionEn: string;
  icon: any;
  href: string;
  color: string;
}

export default function WorkspacePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { language } = useLanguage();

  const services: Service[] = [
    {
      id: "text-intelligence",
      nameKa: "ტექსტის ინტელექტი",
      nameEn: "Text Intelligence",
      descriptionKa: "პროფესიონალური წერა და ანალიზი",
      descriptionEn: "Professional writing & analysis",
      icon: MessageSquare,
      href: "/text-intelligence",
      color: "from-blue-500/20 to-cyan-500/20",
    },
    {
      id: "prompt-builder",
      nameKa: "პრომპტის ბილდერი",
      nameEn: "Prompt Builder",
      descriptionKa: "AI პრომპტების ოპტიმიზაცია",
      descriptionEn: "AI prompt optimization",
      icon: Sparkles,
      href: "/prompt-builder",
      color: "from-purple-500/20 to-pink-500/20",
    },
    {
      id: "image-generator",
      nameKa: "სურათის გენერატორი",
      nameEn: "Image Generator",
      descriptionKa: "AI სურათების შექმნა",
      descriptionEn: "AI image creation",
      icon: ImageIcon,
      href: "/image-generator",
      color: "from-green-500/20 to-emerald-500/20",
    },
    {
      id: "image-architect",
      nameKa: "სურათის არქიტექტორი",
      nameEn: "Image Architect",
      descriptionKa: "დიზაინის სისტემები",
      descriptionEn: "Design systems",
      icon: Palette,
      href: "/image-architect",
      color: "from-orange-500/20 to-red-500/20",
    },
    {
      id: "music-studio",
      nameKa: "მუსიკის სტუდია",
      nameEn: "Music Studio",
      descriptionKa: "AI მუსიკის შექმნა",
      descriptionEn: "AI music creation",
      icon: Music,
      href: "/music-studio",
      color: "from-violet-500/20 to-purple-500/20",
    },
    {
      id: "voice-lab",
      nameKa: "ხმის ლაბორატორია",
      nameEn: "Voice Lab",
      descriptionKa: "ხმის გენერაცია და კლონირება",
      descriptionEn: "Voice generation & cloning",
      icon: Mic,
      href: "/voice-lab",
      color: "from-cyan-500/20 to-blue-500/20",
    },
    {
      id: "video-generator",
      nameKa: "ვიდეო გენერატორი",
      nameEn: "Video Generator",
      descriptionKa: "AI ვიდეოების შექმნა",
      descriptionEn: "AI video creation",
      icon: Video,
      href: "/video-generator",
      color: "from-pink-500/20 to-rose-500/20",
    },
    {
      id: "video-cine-lab",
      nameKa: "ვიდეო კინო ლაბი",
      nameEn: "Video Cine Lab",
      descriptionKa: "კინემატოგრაფიული პროდუქცია",
      descriptionEn: "Cinematic production",
      icon: Film,
      href: "/video-cine-lab",
      color: "from-indigo-500/20 to-blue-500/20",
    },
    {
      id: "game-forge",
      nameKa: "თამაშის ფორჯი",
      nameEn: "Game Forge",
      descriptionKa: "თამაშის დიზაინი",
      descriptionEn: "Game design",
      icon: Gamepad2,
      href: "/game-forge",
      color: "from-yellow-500/20 to-orange-500/20",
    },
    {
      id: "ai-production",
      nameKa: "AI პროდუქცია",
      nameEn: "AI Production",
      descriptionKa: "კონტენტის ქარხანა",
      descriptionEn: "Content factory",
      icon: Factory,
      href: "/ai-production",
      color: "from-teal-500/20 to-green-500/20",
    },
    {
      id: "business-agent",
      nameKa: "ბიზნეს აგენტი",
      nameEn: "Business Agent",
      descriptionKa: "ბიზნეს სტრატეგია",
      descriptionEn: "Business strategy",
      icon: Briefcase,
      href: "/business-agent",
      color: "from-gray-500/20 to-slate-500/20",
    },
  ];

  const filteredServices = services.filter((service) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      service.nameKa.toLowerCase().includes(searchLower) ||
      service.nameEn.toLowerCase().includes(searchLower) ||
      service.descriptionKa.toLowerCase().includes(searchLower) ||
      service.descriptionEn.toLowerCase().includes(searchLower)
    );
  });

  return (
    <>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <header className="border-b border-cyan-500/20 bg-white/5 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-1">
                <Image
                  src="/logo.jpg"
                  alt="Avatar G"
                  fill
                  className="object-contain"
                />
              </div>
              <div>
                <h1 className="text-lg font-bold">Avatar G</h1>
                <p className="text-xs text-slate-400">
                  {language === "ka" ? "AI სერვისების პლატფორმა" : "AI Services Platform"}
                </p>
              </div>
            </div>
            <LanguageToggle />
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === "ka" ? "ძებნა სერვისებში..." : "Search services..."}
                className="w-full pl-12 pr-4 py-4 bg-white/5 border border-cyan-500/20 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
              />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-6">
              {language === "ka" ? "ყველა სერვისი" : "All Services"}
              <span className="ml-3 text-sm font-normal text-slate-400">
                ({filteredServices.length})
              </span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredServices.map((service) => {
                const Icon = service.icon;
                return (
                  <Link
                    key={service.id}
                    href={service.href}
                    className="group relative bg-white/5 border border-cyan-500/20 rounded-2xl p-6 hover:bg-white/10 hover:border-cyan-500/40 transition-all duration-300 hover:scale-105"
                  >
                    <div className={'absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity ' + service.color} />
                    
                    <div className="relative">
                      <div className="w-14 h-14 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cyan-500/30 transition-colors">
                        <Icon className="w-7 h-7 text-cyan-400" />
                      </div>

                      <h3 className="text-lg font-semibold mb-2">
                        {language === "ka" ? service.nameKa : service.nameEn}
                      </h3>

                      <p className="text-sm text-slate-400">
                        {language === "ka" ? service.descriptionKa : service.descriptionEn}
                      </p>

                      <div className="mt-4 flex items-center text-cyan-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>{language === "ka" ? "გახსნა" : "Open"}</span>
                        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {filteredServices.length === 0 && (
              <div className="text-center py-16">
                <p className="text-slate-500">
                  {language === "ka" ? "სერვისები ვერ მოიძებნა" : "No services found"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Chatbot Widget */}
      <AIChatbotWidget />
    </>
  );
}
