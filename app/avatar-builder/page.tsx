"use client";

import ServicePageShell from "@/components/ServicePageShell";
import ServiceContent from "@/components/ServiceContent";
import { ToastProvider } from "@/components/Toast";
import { User } from "lucide-react";
import { services } from "@/lib/services-config";

export default function AvatarBuilderPage() {
  const service = services.find((s) => s.id === "avatar-builder")!;

  return (
    <ToastProvider>
      <ServicePageShell
        serviceId={service.id}
        titleKa={service.nameKa}
        titleEn={service.nameEn}
        subtitleKa="AI ავატარების შექმნა"
        subtitleEn="AI Avatar Creation"
        descriptionKa={service.descriptionKa}
        descriptionEn={service.descriptionEn}
        icon={<User className="w-12 h-12 text-cyan-400" />}
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
