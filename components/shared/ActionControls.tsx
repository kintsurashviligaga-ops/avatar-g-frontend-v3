"use client";

import { Wand2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

interface ActionControlsProps {
  onPrimary: () => void;
  isPrimaryDisabled?: boolean;
  isPrimaryLoading?: boolean;
}

export default function ActionControls({
  onPrimary,
  isPrimaryDisabled = false,
  isPrimaryLoading = false,
}: ActionControlsProps) {
  const { language } = useLanguage();

  return (
    <button
      onClick={onPrimary}
      disabled={isPrimaryDisabled || isPrimaryLoading}
      className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
    >
      <Wand2 className="w-5 h-5" />
      {isPrimaryLoading
        ? language === "ka"
          ? "მუშავდება..."
          : "Processing..."
        : language === "ka"
        ? "გენერაცია"
        : "Generate"}
    </button>
  );
}
