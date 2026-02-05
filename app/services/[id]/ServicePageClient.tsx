"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface ServicePageClientProps {
  id: string;
}

export default function ServicePageClient({ id }: ServicePageClientProps) {
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
            {id.replace(/-/g, " ")}
          </h1>
          <p className="text-gray-400 text-lg">
            Service ID: {id}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
