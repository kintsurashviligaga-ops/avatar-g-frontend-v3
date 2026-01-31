// ... ServicePageShell with Gamepad2 icon, indigo gradient
// Input: Game concept"use client";

import { Gamepad2 } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

export default function GameForgePage() {
  return (
    <ServicePageShell
      serviceId="game-forge"
      serviceNameKa="Game Forge"
      serviceNameEn="Game Forge"
      serviceDescriptionKa="AI თამაშების დეველოპმენტის პლატფორმა"
      serviceDescriptionEn="AI game development platform"
      icon={<Gamepad2 className="w-8 h-8 text-white" />}
      gradient="from-indigo-400 to-blue-600"
    >
      <div className="p-8 text-center">
        <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-indigo-400" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Game Forge
        </h3>
        <p className="text-gray-400">
          Create games with AI-powered tools and assets.
        </p>
      </div>
    </ServicePageShell>
  );
}

// Output: Game assets / code
