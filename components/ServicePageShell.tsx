"use client";

import { Sparkles } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

export default function AIProductionPage() {
  return (
    <ServicePageShell
      serviceId="ai-production"
      serviceNameKa="AI პროდაქშენი"
      serviceNameEn="AI Production"
      serviceDescriptionKa="AI ტექნოლოგიებით შექმნილი პროფესიული კონტენტის წარმოება"
      serviceDescriptionEn="Professional content production using AI technologies"
      icon={<Sparkles className="w-8 h-8 text-white" />}
      gradient="from-cyan-500 to-blue-600"
    >
      <div className="p-8 text-center">
        <Sparkles className="w-16 h-16 mx-auto mb-4 text-cyan-400" />
        <h3 className="text-xl font-semibold text-white mb-2">
          AI Production Pipeline
        </h3>
        <p className="text-gray-400">
          Transform your production brief into complete AI-generated content.
        </p>
      </div>
    </ServicePageShell>
  );
}
