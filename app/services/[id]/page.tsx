"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Static params for export
export function generateStaticParams() {
  return [
    { id: "text-intelligence" },
    { id: "image-generator" },
    { id: "video-lab" },
    { id: "voice-studio" },
    { id: "code-assistant" },
    { id: "data-analyst" },
  ];
}

export default function ServicePage() {
  const params = useParams();
  const { id } = params;
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <h1 className="text-4xl font-bold mb-8 capitalize">
            {typeof id === "string" ? id.replace(/-/g, " ") : "Service"}
          </h1>
          <p className="text-gray-400 text-lg">
            Service ID: {id}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
