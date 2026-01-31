"use client";

import { Briefcase } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

export default function BusinessAgentPage() {
  return (
    <ServicePageShell
      serviceId="business-agent"
      serviceNameKa="ბიზნეს აგენტი"
      serviceNameEn="Business Agent"
      serviceDescriptionKa="AI ბიზნეს ასისტენტი თქვენი ბიზნესის განვითარებისთვის"
      serviceDescriptionEn="AI business assistant for your business growth"
      icon={<Briefcase className="w-8 h-8 text-white" />}
      gradient="from-slate-400 to-gray-600"
    >
      <div className="p-8 text-center">
        <Briefcase className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Business Agent
        </h3>
        <p className="text-gray-400">
          AI-powered business assistance and automation.
        </p>
      </div>
    </ServicePageShell>
  );
}
