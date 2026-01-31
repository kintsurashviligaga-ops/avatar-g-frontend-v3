// "use client";

import { ImageIcon } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

export default function ImageGeneratorPage() {
  return (
    <ServicePageShell
      serviceId="image-generator"
      serviceNameKa="გამოსახულების გენერატორი"
      serviceNameEn="Image Generator"
      serviceDescriptionKa="ტექსტიდან სურათების AI გენერაცია"
      serviceDescriptionEn="AI image generation from text prompts"
      icon={<ImageIcon className="w-8 h-8 text-white" />}
      gradient="from-fuchsia-400 to-pink-600"
    >
      <div className="p-8 text-center">
        <ImageIcon className="w-16 h-16 mx-auto mb-4 text-fuchsia-400" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Image Generator
        </h3>
        <p className="text-gray-400">
          Create stunning images from text descriptions.
        </p>
      </div>
    </ServicePageShell>
  );
}
... ServicePageShell with ImageIcon icon, fuchsia gradient
// Input: Text prompt
// Output: Generated image
