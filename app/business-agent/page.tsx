"use client";

import ServicePageShell from "@/components/ServicePageShell";
import ServiceContent from "@/components/ServiceContent";
import { ToastProvider } from "@/components/Toast";
import { Briefcase } from "lucide-react";
import { services } from "@/lib/services-config";

export default function BusinessAgentPage() {
  const service = services.find((s) => s.id === "business-agent")!;

  return (
    <ToastProvider>
      <ServicePageShell
        serviceId={service.id}
        titleKa={service.nameKa}
        titleEn={service.nameEn}
        subtitleKa="ბიზნეს ავტომატიზაცია"
        subtitleEn="Business Automation"
        descriptionKa={service.descriptionKa}
        descriptionEn={service.descriptionEn}
        icon={<Briefcase className="w-12 h-12 text-cyan-400" />}
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
