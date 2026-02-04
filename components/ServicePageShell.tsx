"use client";

import { ArrowLeft } from "lucide-react";
import { useSafeBack } from "@/lib/navigation";
import { useLanguage } from "./LanguageProvider";
import { useToast } from "./Toast";
import { t } from "@/lib/i18n";

interface ServicePageShellProps {
  serviceId: string;
  titleKa: string;
  titleEn: string;
  subtitleKa: string;
  subtitleEn: string;
  descriptionKa: string;
  descriptionEn: string;
  icon: React.ReactNode;
  primaryCtaKa: string;
  primaryCtaEn: string;
  secondaryCtaKa?: string;
  secondaryCtaEn?: string;
  onPrimaryAction?: () => void;
  children?: React.ReactNode;
}

export default function ServicePageShell({
  serviceId,
  titleKa,
  titleEn,
  subtitleKa,
  subtitleEn,
  descriptionKa,
  descriptionEn,
  icon,
  primaryCtaKa,
  primaryCtaEn,
  secondaryCtaKa,
  secondaryCtaEn,
  onPrimaryAction,
  children,
}: ServicePageShellProps) {
  const safeBack = useSafeBack();
  const { language } = useLanguage();
  const { showToast } = useToast();

  const title = language === "ka" ? titleKa : titleEn;
  const subtitle = language === "ka" ? subtitleKa : subtitleEn;
  const description = language === "ka" ? descriptionKa : descriptionEn;
  const primaryCta = language === "ka" ? primaryCtaKa : primaryCtaEn;
  const secondaryCta =
    secondaryCtaKa && secondaryCtaEn
      ? language === "ka"
        ? secondaryCtaKa
        : secondaryCtaEn
      : null;

  const handlePrimaryClick = () => {
    if (onPrimaryAction) {
      onPrimaryAction();
    } else {
      showToast(
        language === "ka"
          ? `${title} - იწყება...`
          : `${title} - Starting...`,
        "info"
      );
    }
  };

  const handleSecondaryClick = () => {
    safeBack();
  };

  return (
    <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
      {/* Header */}
      <header className="border-b border-cyan-500/20 bg-white/5 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Back Button */}
          <button
            onClick={safeBack}
            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline text-sm">{t("common.back")}</span>
          </button>

          {/* Title */}
          <h1 className="text-base sm:text-lg font-semibold">{title}</h1>

          {/* Active Badge */}
          <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-green-400">
              {t("common.active")}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-6">
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-24 h-24 bg-white/5 border border-cyan-500/20 rounded-2xl">
              {icon}
            </div>

            {/* Subtitle */}
            <p className="text-cyan-400 text-sm font-medium uppercase tracking-wider">
              {subtitle}
            </p>

            {/* Description */}
            <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
              {description}
            </p>
          </div>

          {/* Custom Content Area */}
          {children && (
            <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-8 backdrop-blur-xl">
              {children}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handlePrimaryClick}
              className="px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 text-base"
            >
              {primaryCta}
            </button>
            {secondaryCta && (
              <button
                onClick={handleSecondaryClick}
                className="px-8 py-4 bg-white/10 hover:bg-white/20 text-slate-200 rounded-lg font-medium transition-colors border border-cyan-500/30 text-base"
              >
                {secondaryCta}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
              }
