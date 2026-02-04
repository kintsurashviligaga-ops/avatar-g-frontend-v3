"use client";

import { useRouter } from "next/navigation";
import { services } from "@/lib/services-config";

export default function ServicesSlider() {
  const router = useRouter();

  return (
    <div className="w-full overflow-x-auto hide-scrollbar">
      <div className="flex gap-3 pb-2">
        {services.map((service) => (
          <button
            key={service.id}
            onClick={() => router.push(service.route)}
            className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 hover:border-cyan-500/40 rounded-lg transition-all flex-shrink-0"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">{service.icon}</span>
              <p className="text-sm font-medium text-slate-200 whitespace-nowrap">
                {service.nameKa}
              </p>
            </div>
          </button>
        ))}
      </div>
      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
