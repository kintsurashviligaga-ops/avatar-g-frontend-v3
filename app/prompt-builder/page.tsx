// .."use client";

import { Wand2 } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

export default function PromptBuilderPage() {
  return (
    <ServicePageShell
      serviceId="prompt-builder"
      serviceNameKa="პრომპტის შექმნა"
      serviceNameEn="Prompt Builder"
      serviceDescriptionKa="პროფესიული AI პრომპტების აწყობა"
      serviceDescriptionEn="Build professional AI prompts"
      icon={<Wand2 className="w-8 h-8 text-white" />}
      gradient="from-teal-400 to-cyan-600"
    >
      <div className="p-8 text-center">
        <Wand2 className="w-16 h-16 mx-auto mb-4 text-teal-400" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Prompt Builder
        </h3>
        <p className="text-gray-400">
          Craft perfect prompts for any AI model.
        </p>
      </div>
    </ServicePageShell>
  );
}
. ServicePageShell with Wand2 icon, teal gradient
// Input: Rough idea
// Output: Optimized prompts
