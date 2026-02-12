"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

// ============ PAGE LAYOUT COMPONENTS ============

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
}

const maxWidthMap = {
  sm: "max-w-sm",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  "2xl": "max-w-7xl",
  full: "w-full",
};

export function PageContainer({
  children,
  className = "",
  maxWidth = "2xl",
}: PageContainerProps) {
  return (
    <div className={`w-full mx-auto px-4 sm:px-6 lg:px-8 ${maxWidthMap[maxWidth]} ${className}`}>
      {children}
    </div>
  );
}

// ============ SECTION HEADER COMPONENT ============

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  gradient?: "cyan" | "green" | "red" | "purple" | "blue";
  align?: "left" | "center";
}

const gradients = {
  cyan: "from-cyan-400 to-blue-500",
  green: "from-green-400 to-emerald-500",
  red: "from-red-400 to-orange-500",
  purple: "from-purple-400 to-pink-500",
  blue: "from-blue-400 to-cyan-500",
};

export function SectionHeader({
  title,
  subtitle,
  icon,
  gradient = "cyan",
  align = "left",
}: SectionHeaderProps) {
  const alignClass = align === "center" ? "text-center" : "";

  return (
    <div className={`space-y-2 ${alignClass}`}>
      <div className={`flex items-center gap-3 ${align === "center" ? "justify-center" : ""}`}>
        {icon && <div className="text-2xl">{icon}</div>}
        <h2
          className={`text-3xl sm:text-4xl font-bold bg-gradient-to-r ${gradients[gradient]} bg-clip-text text-transparent`}
        >
          {title}
        </h2>
      </div>
      {subtitle && <p className="text-gray-300 text-base sm:text-lg">{subtitle}</p>}
      {align === "left" && <div className={`h-1 w-16 bg-gradient-to-r ${gradients[gradient]} rounded-full`} />}
      {align === "center" && (
        <div className={`h-1 w-16 bg-gradient-to-r ${gradients[gradient]} rounded-full mx-auto`} />
      )}
    </div>
  );
}

// ============ SERVICE LAYOUT COMPONENT ============

interface ServiceLayoutProps {
  children: ReactNode;
  columns?: 2 | 3;
  gap?: "sm" | "md" | "lg";
  className?: string;
}

const gapMap = {
  sm: "gap-4",
  md: "gap-6",
  lg: "gap-8",
};

export function ServiceLayout({
  children,
  columns = 2,
  gap = "md",
  className = "",
}: ServiceLayoutProps) {
  const gridClass = columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 ${gridClass} ${gapMap[gap]} ${className}`}
    >
      {children}
    </div>
  );
}

// ============ FEATURE CARD COMPONENT ============

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  gradient?: string;
  onClick?: () => void;
  badge?: string;
  status?: "ready" | "coming" | "beta";
}

const statusStyles = {
  ready: "bg-green-500/20 text-green-300 border-green-500/30",
  coming: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  beta: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

export function FeatureCard({
  icon,
  title,
  description,
  gradient = "from-cyan-500 to-blue-500",
  onClick,
  badge,
  status,
}: FeatureCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`group cursor-pointer ${onClick ? "cursor-pointer" : ""}`}
    >
      <Card className="relative overflow-hidden h-full border-gray-700 hover:border-cyan-500/50 transition-all duration-300">
        {/* Background gradient */}
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-r ${gradient} transition-opacity`} />

        {/* Content */}
        <div className="relative space-y-3 p-6">
          {/* Status badge */}
          {status && (
            <div className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${statusStyles[status]}`}>
              {status === "ready" && "✓ Ready"}
              {status === "coming" && "⏱ Coming Soon"}
              {status === "beta" && "⚡ Beta"}
            </div>
          )}

          {/* Icon */}
          <div className="text-4xl">{icon}</div>

          {/* Title & description */}
          <div>
            <h3 className="text-lg font-semibold text-white group-hover:text-cyan-300 transition-colors">
              {title}
            </h3>
            <p className="text-sm text-gray-400 mt-2">{description}</p>
          </div>

          {/* Badge */}
          {badge && (
            <div className="inline-flex items-center px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs font-medium text-cyan-300">
              {badge}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// ============ PROGRESS INDICATOR COMPONENT ============

interface ProgressStage {
  label: string;
  completed: boolean;
  current?: boolean;
}

interface ProgressIndicatorProps {
  stages: ProgressStage[];
  orientation?: "horizontal" | "vertical";
}

export function ProgressIndicator({
  stages,
  orientation = "horizontal",
}: ProgressIndicatorProps) {
  const isHorizontal = orientation === "horizontal";

  return (
    <div
      className={`flex ${
        isHorizontal ? "flex-row items-center" : "flex-col items-start"
      } gap-4`}
    >
      {stages.map((stage, index) => (
        <div
          key={index}
          className={`flex ${isHorizontal ? "flex-col items-center" : "flex-row items-center"} gap-2`}
        >
          {/* Circle */}
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition-all ${
              stage.current
                ? "bg-cyan-500 text-white scale-125"
                : stage.completed
                  ? "bg-green-500 text-white"
                  : "bg-gray-700 text-gray-400"
            }`}
          >
            {stage.completed ? "✓" : index + 1}
          </div>

          {/* Line connector (except last) */}
          {index < stages.length - 1 && (
            <div
              className={`${
                isHorizontal ? "w-12" : "h-12"
              } ${
                isHorizontal
                  ? stage.completed
                    ? "border-t-2 border-green-500"
                    : "border-t-2 border-gray-700"
                  : stage.completed
                    ? "border-l-2 border-green-500"
                    : "border-l-2 border-gray-700"
              }`}
            />
          )}

          {/* Label */}
          <span
            className={`text-sm font-medium ${
              stage.current
                ? "text-cyan-400"
                : stage.completed
                  ? "text-green-400"
                  : "text-gray-500"
            }`}
          >
            {stage.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============ GRADIENT BUTTON COMPONENT ============

interface GradientButtonProps {
  children: ReactNode;
  gradient?: string;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function GradientButton({
  children,
  gradient = "from-cyan-500 to-blue-500",
  size = "md",
  onClick,
  disabled = false,
  className = "",
}: GradientButtonProps) {
  const sizeClass = {
    sm: "px-3 py-1 text-sm",
    md: "px-6 py-2 text-base",
    lg: "px-8 py-3 text-lg",
  }[size];

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`
        relative inline-flex items-center justify-center
        font-semibold rounded-lg cursor-pointer transition-all
        ${sizeClass}
        ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : `bg-gradient-to-r ${gradient} text-white hover:shadow-lg hover:shadow-cyan-500/30`
        }
        ${className}
      `}
    >
      {children}
    </motion.button>
  );
}

// ============ ANIMATED BACKGROUND COMPONENT ============

export function AnimatedBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {/* Gradient orbs */}
      <motion.div
        animate={{
          x: [0, 50, 0],
          y: [0, 30, 0],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-r from-cyan-500/30 to-blue-500/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          x: [0, -50, 0],
          y: [0, -30, 0],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-40 -right-40 w-80 h-80 bg-gradient-to-l from-purple-500/30 to-pink-500/20 rounded-full blur-3xl"
      />
    </div>
  );
}

// ============ STATUS BADGE COMPONENT ============

interface StatusBadgeProps {
  status: "success" | "error" | "warning" | "info";
  text: string;
  icon?: ReactNode;
}

const badgeStyles = {
  success: "bg-green-500/20 text-green-300 border-green-500/30",
  error: "bg-red-500/20 text-red-300 border-red-500/30",
  warning: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

export function StatusBadge({ status, text, icon }: StatusBadgeProps) {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border ${badgeStyles[status]} text-sm font-medium`}>
      {icon && <span>{icon}</span>}
      {text}
    </div>
  );
}
