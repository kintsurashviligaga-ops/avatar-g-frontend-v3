"use client";

import { motion } from "framer-motion";

interface RocketLogoProps {
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  glow?: boolean;
}

const sizeMap = {
  sm: { container: "w-6 h-6", icon: 16 },
  md: { container: "w-10 h-10", icon: 24 },
  lg: { container: "w-14 h-14", icon: 32 },
};

export function RocketLogo({ size = "md", animated = true, glow = true }: RocketLogoProps) {
  const dimensions = sizeMap[size];

  return (
    <div className="relative">
      <motion.div
        className={`${dimensions.container} rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25`}
        animate={animated ? { y: [0, -2, 0] } : {}}
        transition={animated ? { duration: 2, repeat: Infinity } : {}}
      >
        <svg
          width={dimensions.icon}
          height={dimensions.icon}
          viewBox="0 0 24 24"
          fill="none"
          className="text-white"
        >
          {/* Rocket body */}
          <path
            d="M12 2C12 2 8 6 8 10C8 12 9 14 12 14C15 14 16 12 16 10C16 6 12 2 12 2Z"
            fill="currentColor"
          />
          {/* Rocket tail */}
          <path
            d="M12 14V22"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Rocket fins */}
          <path
            d="M9 18L12 14L15 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Left engine flame */}
          <path
            d="M7 10C4 10 2 12 2 14C2 16 4 17 7 17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Right engine flame */}
          <path
            d="M17 10C20 10 22 12 22 14C22 16 20 17 17 17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </motion.div>

      {/* Glow effect */}
      {glow && (
        <motion.div
          className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 blur-lg opacity-50 -z-10"
          animate={animated ? { scale: [1, 1.2, 1], opacity: [0.5, 0.7, 0.5] } : {}}
          transition={animated ? { duration: 3, repeat: Infinity } : {}}
        />
      )}
    </div>
  );
}
