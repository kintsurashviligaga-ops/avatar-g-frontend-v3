"use client";

import ServicePageShell from "@/components/ServicePageShell";
import ServiceContent from "@/components/ServiceContent";
import { ToastProvider } from "@/components/Toast";
import { Film } from "lucide-react";
import { services } from "@/lib/services-config";

export default function VideoCineLabPage() {
  const service = services.find((s) => s.id === "video-cine-lab")!;

  return (
    <ToastProvider>
      <ServicePageShell
        serviceId={service.id}
        titleKa={service.nameKa}
        titleEn={service.nameEn}
        subtitleKa="კინემატოგრაფიული ლაბორატორია"
        subtitleEn="Cinematic Laboratory"
        descriptionKa={service.descriptionKa}
        descriptionEn={service.descriptionEn}
        icon={<Film className="w-12 h-12 text-cyan-400" />}
        primaryCtaKa={service.ctaPrimaryKa}
        primaryCtaEn={service.ctaPrimaryEn}
        secondaryCtaKa={service.ctaSecondaryKa}
        secondaryCtaEn={service.ctaSecondaryEn}
      >
        <ServiceContent />
      </ServicePageShell>
    </ToastProvider>
  );
}
