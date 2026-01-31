"use client";

import ServicePageShell from "@/components/ServicePageShell";
import ServiceContent from "@/components/ServiceContent";
import { ToastProvider } from "@/components/Toast";
import { Palette } from "lucide-react";
import { services } from "@/lib/services-config";

export default function ImageArchitectPage() {
  const service = services.find((s) => s.id === "image-architect")!;

  return (
    <ToastProvider>
      <ServicePageShell
        serviceId={service.id}
        titleKa={service.nameKa}
        titleEn={service.nameEn}
        subtitleKa="პროფესიონალური სურათები"
        subtitleEn="Professional Images"
        descriptionKa={service.descriptionKa}
        descriptionEn={service.descriptionEn}
        icon={<Palette className="w-12 h-12 text-cyan-400" />}
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
