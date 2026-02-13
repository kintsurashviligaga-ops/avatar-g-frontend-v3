"use client";

import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus, LucideIcon } from "lucide-react";

interface MetricWidgetProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  variant?: "default" | "success" | "danger" | "warning";
}

export function MetricWidget({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  variant = "default",
}: MetricWidgetProps) {
  const variantStyles = {
    default: "from-gray-900 to-gray-800/50 border-gray-700/50",
    success: "from-green-900/30 to-green-800/10 border-green-500/50",
    danger: "from-red-900/30 to-red-800/10 border-red-500/50",
    warning: "from-yellow-900/30 to-yellow-800/10 border-yellow-500/50",
  };

  const trendIcons = {
    up: TrendingUp,
    down: TrendingDown,
    neutral: Minus,
  };

  const trendColors = {
    up: "text-green-500",
    down: "text-red-500",
    neutral: "text-gray-500",
  };

  const TrendIcon = trend ? trendIcons[trend] : null;

  return (
    <div className={`bg-gradient-to-br rounded-2xl p-6 border-2 ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-gray-400 uppercase tracking-wide mb-1">{title}</p>
          <p className={`text-3xl font-bold ${
            variant === "success" ? "text-green-400" :
            variant === "danger" ? "text-red-400" :
            variant === "warning" ? "text-yellow-400" :
            "text-white"
          }`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            variant === "success" ? "bg-green-500/20" :
            variant === "danger" ? "bg-red-500/20" :
            variant === "warning" ? "bg-yellow-500/20" :
            "bg-blue-500/20"
          }`}>
            <Icon className={`w-6 h-6 ${
              variant === "success" ? "text-green-400" :
              variant === "danger" ? "text-red-400" :
              variant === "warning" ? "text-yellow-400" :
              "text-blue-400"
            }`} />
          </div>
        )}
      </div>

      {trend && TrendIcon && trendValue && (
        <div className="flex items-center gap-2 pt-4 border-t border-gray-700/50">
          <TrendIcon className={`w-4 h-4 ${trendColors[trend]}`} />
          <span className={`text-sm font-medium ${trendColors[trend]}`}>
            {trendValue}
          </span>
        </div>
      )}
    </div>
  );
}

interface AlertBannerProps {
  variant: "success" | "danger" | "warning" | "info";
  title: string;
  message: string;
  icon?: LucideIcon;
}

export function AlertBanner({ variant, title, message, icon: Icon }: AlertBannerProps) {
  const variantStyles = {
    success: "bg-green-500/10 border-green-500/50 text-green-400",
    danger: "bg-red-500/10 border-red-500/50 text-red-400",
    warning: "bg-yellow-500/10 border-yellow-500/50 text-yellow-400",
    info: "bg-blue-500/10 border-blue-500/50 text-blue-400",
  };

  return (
    <div className={`p-4 rounded-xl border-2 ${variantStyles[variant]}`}>
      <div className="flex items-start gap-3">
        {Icon && <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />}
        <div>
          <p className="font-bold text-sm mb-1">{title}</p>
          <p className="text-sm opacity-90">{message}</p>
        </div>
      </div>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
