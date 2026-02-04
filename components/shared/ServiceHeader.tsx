"use client";

import { ArrowLeft, Settings } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useSafeBack } from "@/lib/navigation";
import LanguageToggle from "@/components/LanguageToggle";
import BrandLogo from "@/components/brand/BrandLogo";
import Link from "next/link";

interface ServiceHeaderProps {
  titleKa: string;
  titleEn: string;
  subtitleKa?: string;
  subtitleEn?: string;
}

export default function ServiceHeader({
  titleKa,
  titleEn,
  subtitleKa,
  subtitleEn,
}: ServiceHeaderProps) {
  const { language } = useLanguage();
  const safeBack = useSafeBack();

  return (
    <header className="border-b border-cyan-500/20 bg-white/5 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={safeBack}
            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {language === "ka" ? "უკან" : "Back"}
          </button>
          
          <Link href="/workspace" className="flex items-center gap-2">
            <BrandLogo variant="header" />
          </Link>
        </div>

        <div className="flex-1 text-center">
          <h1 className="text-lg font-semibold">
            {language === "ka" ? titleKa : titleEn}
          </h1>

          {subtitleKa && subtitleEn && (
            <p className="text-xs text-slate-400">
              {language === "ka" ? subtitleKa : subtitleEn}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-green-400">
              {language === "ka" ? "აქტიური" : "Active"}
            </span>
          </div>

          <LanguageToggle />

          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <Settings className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </div>
    </header>
  );
}
