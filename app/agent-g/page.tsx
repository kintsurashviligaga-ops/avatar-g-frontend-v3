"use client";

import { useRouter } from "next/navigation";
import ServicePageShell from "@/components/ServicePageShell";
import ServiceContent from "@/components/ServiceContent";
import { ToastProvider } from "@/components/Toast";
import { Bot } from "lucide-react";
import { services } from "@/lib/services-config";

export default function AgentGPage() {
  const router = useRouter();
  const service = services.find((s) => s.id === "agent-g")!;

  return (
    <ToastProvider>
      <ServicePageShell
        serviceId={service.id}
        titleKa={service.nameKa}
        titleEn={service.nameEn}
        subtitleKa="Luxury AI Agent"
        subtitleEn="Luxury AI Agent"
        descriptionKa={service.descriptionKa}
        descriptionEn={service.descriptionEn}
        icon={<Bot className="w-12 h-12 text-cyan-400" />}
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
