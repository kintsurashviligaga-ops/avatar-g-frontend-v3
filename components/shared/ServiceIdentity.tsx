"use client";

import { LucideIcon } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

interface ServiceIdentityProps {
  icon: LucideIcon;
  nameKa: string;
  nameEn: string;
  descriptionKa: string;
  descriptionEn: string;
  purposeKa: string;
  purposeEn: string;
}

export default function ServiceIdentity({
  icon: Icon,
  nameKa,
  nameEn,
  descriptionKa,
  descriptionEn,
  purposeKa,
  purposeEn,
}: ServiceIdentityProps) {
  const { language } = useLanguage();

  return (
    <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 bg-cyan-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon className="w-8 h-8 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-cyan-400 mb-2">
            {language === "ka" ? nameKa : nameEn}
          </h2>
          <p className="text-sm text-slate-300 mb-3">
            {language === "ka" ? descriptionKa : descriptionEn}
          </p>
          <div className="flex items-start gap-2">
            <div className="w-1 h-1 bg-cyan-400 rounded-full mt-2" />
            <p className="text-xs text-slate-400 italic">
              {language === "ka" ? purposeKa : purposeEn}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
