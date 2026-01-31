"use client";

import { Sparkles } from "lucide-react";
import { ServicePageShell } from "@/components/ServicePageShell";

export default function AIProductionPage() {
  return (
    <ServicePageShell
      title="AI Production"
      subtitle="Full AI production pipeline for your creative projects"
      icon={Sparkles}
    >
      <div className="glass rounded-2xl p-8 text-center">
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
