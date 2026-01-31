"use client";

import { useRouter, usePathname } from "next/navigation";
import { services } from "@/lib/services-config";
import { useLanguage } from "./LanguageProvider";

export default function ServicesSlider() {
  const router = useRouter();
  const pathname = usePathname();
  const { language } = useLanguage();

  return (
    <div className="w-full overflow-x-auto hide-scrollbar">
      <div className="flex gap-3 pb-2 min-w-max">
        {services.map((service) => {
          const isActive = pathname === service.route;

          return (
            <button
              key={service.id}
              onClick={() => router.push(service.route)}
              className={`group relative px-4 py-3 rounded-lg transition-all duration-300 flex-shrink-0 ${
                isActive
                  ? "bg-white/10 border border-cyan-500/40"
                  : "bg-white/5 hover:bg-white/10 border border-cyan-500/20 hover:border-cyan-500/40"
              }`}
            >
              {/* Glow Effect */}
              <div
                className={`absolute inset-0 rounded-lg transition-all duration-300 ${
                  isActive
                    ? "bg-cyan-500/10"
                    : "bg-cyan-500/0 group-hover:bg-cyan-500/10"
                }`}
              />

              {/* Content */}
              <div className="relative flex items-center gap-2">
                <span className="text-xl">{service.icon}</span>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-200 whitespace-nowrap">
                    {language === "ka" ? service.nameKa : service.nameEn}
                  </p>
                  {service.id === "agent-g" && (
                    <p className="text-xs text-cyan-400">Luxury</p>
                  )}
                </div>
              </div>

              {/* Active Indicator */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
