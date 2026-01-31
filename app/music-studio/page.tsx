// ... ServicePageShell with Music icon, pink gradient
// Input: Text pr"use client";

import { Music } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

export default function MusicStudioPage() {
  return (
    <ServicePageShell
      serviceId="music-studio"
      serviceNameKa="მუსიკის სტუდია"
      serviceNameEn="Music Studio"
      serviceDescriptionKa="AI მუსიკის შექმნა და რედაქტირება"
      serviceDescriptionEn="AI music generation and editing"
      icon={<Music className="w-8 h-8 text-white" />}
      gradient="from-pink-400 to-rose-600"
    >
      <div className="p-8 text-center">
        <Music className="w-16 h-16 mx-auto mb-4 text-pink-400" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Music Studio
        </h3>
        <p className="text-gray-400">
          Create original music with AI-powered tools.
        </p>
      </div>
    </ServicePageShell>
  );
}
ompt or humming
// Output: Generated music track
