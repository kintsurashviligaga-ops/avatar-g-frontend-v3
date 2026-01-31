"use client";

import ServicePageShell from "@/components/ServicePageShell";
import ServiceContent from "@/components/ServiceContent";
import { Image } from "lucide-react";
import { services } from "@/lib/services-config";

export default function ImageGeneratorPage() {
  const service = services.find((s) => s.id === "image-generator");

  if (!service) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-400">
        Service config not found
      </div>
    );
  }

  return (
    <ServicePageShell
      serviceId={service.id}
      titleKa={service.nameKa}
      titleEn={service.nameEn}
      subtitleKa="სწრაფი გენერაცია"
      subtitleEn="Quick Generation"
      descriptionKa={service.descriptionKa}
      descriptionEn={service.descriptionEn}
      icon={<Image className="w-12 h-12 text-cyan-400" />}
      primaryCtaKa={service.ctaPrimaryKa}
      primaryCtaEn={service.ctaPrimaryEn}
      secondaryCtaKa={service.ctaSecondaryKa}
      secondaryCtaEn={service.ctaSecondaryEn}
    >
      <ServiceContent />
    </ServicePageShell>
  );
}
