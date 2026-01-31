"use client";

import ServicePageShell from "@/components/ServicePageShell";
import ServiceContent from "@/components/ServiceContent";
import { ToastProvider } from "@/components/Toast";
import { Gamepad2 } from "lucide-react";
import { services } from "@/lib/services-config";

export default function GameForgePage() {
  const service = services.find((s) => s.id === "game-forge")!;

  return (
    <ToastProvider>
      <ServicePageShell
        serviceId={service.id}
        titleKa={service.nameKa}
        titleEn={service.nameEn}
        subtitleKa="თამაშების შემქმნელი"
        subtitleEn="Game Creator"
        descriptionKa={service.descriptionKa}
        descriptionEn={service.descriptionEn}
        icon={<Gamepad2 className="w-12 h-12 text-cyan-400" />}
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
