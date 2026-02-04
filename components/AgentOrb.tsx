"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

type OrbState = "idle" | "thinking" | "processing" | "success" | "error";

interface AgentOrbProps {
  state?: OrbState;
  labelKa?: string;
  labelEn?: string;
  size?: "sm" | "md" | "lg";
}

const stateLabels = {
  idle: { ka: "მზად", en: "Ready" },
  thinking: { ka: "ვფიქრობ…", en: "Thinking…" },
  processing: { ka: "მუშავდება…", en: "Processing…" },
  success: { ka: "მზადაა ✓", en: "Ready ✓" },
  error: { ka: "ვერ შესრულდა", en: "Failed" },
};

const sizeClasses = {
  sm: "w-16 h-16",
  md: "w-32 h-32",
  lg: "w-48 h-48",
};

export default function AgentOrb({
  state = "idle",
  labelKa,
  labelEn,
  size = "lg",
}: AgentOrbProps) {
  const { language } = useLanguage();
  const displayLabel =
    labelKa && labelEn
      ? language === "ka"
        ? labelKa
        : labelEn
      : language === "ka"
      ? stateLabels[state].ka
      : stateLabels[state].en;

  // Animation variants based on state
  const getOrbVariants = () => {
    switch (state) {
      case "idle":
        return {
          scale: [1, 1.05, 1],
          opacity: [0.35, 0.55, 0.35],
          transition: {
            duration: 3.2,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "thinking":
        return {
          scale: [1, 1.03, 1],
          opacity: [0.4, 0.6, 0.4],
          transition: {
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "processing":
        return {
          scale: [1, 1.08, 1],
          opacity: [0.5, 0.8, 0.5],
          transition: {
            duration: 1.4,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "success":
        return {
          scale: [1, 1.15, 1],
          opacity: [0.6, 1, 0.6],
          transition: {
            duration: 0.18,
            repeat: 1,
          },
        };
      case "error":
        return {
          x: [-2, 2, -2, 2, 0],
          transition: {
            duration: 0.28,
            repeat: 1,
          },
        };
      default:
        return {};
    }
  };

  const getRingVariants = (direction: "forward" | "reverse") => {
    const duration = state === "thinking" ? 12 : 18;
    return {
      rotate: direction === "forward" ? [0, 360] : [0, -360],
      transition: {
        duration: direction === "forward" ? duration : duration + 6,
        repeat: Infinity,
        ease: "linear",
      },
    };
  };

  return (
    <div className="relative flex flex-col items-center gap-4">
      {/* Orb Container */}
      <div className={`relative ${sizeClasses[size]}`}>
        {/* Outer Ring 1 */}
        <motion.div
          className="absolute inset-0 rounded-full border border-cyan-500/20"
          animate={getRingVariants("forward")}
        />

        {/* Outer Ring 2 */}
        <motion.div
          className="absolute inset-2 rounded-full border border-cyan-400/15"
          animate={getRingVariants("reverse")}
        />

        {/* Core Orb */}
        <motion.div
          className={`absolute inset-4 rounded-full bg-gradient-to-br from-cyan-500/40 to-blue-500/40 backdrop-blur-xl border ${
            state === "error" ? "border-red-500/40" : "border-cyan-500/40"
          } shadow-2xl ${
            state === "error" ? "shadow-red-500/30" : "shadow-cyan-500/50"
          }`}
          animate={getOrbVariants()}
        />

        {/* Inner Glow */}
        <motion.div
          className={`absolute inset-6 rounded-full ${
            state === "error" ? "bg-red-400/20" : "bg-cyan-400/30"
          } blur-xl`}
          animate={{
            scale: state === "processing" ? [1, 1.2, 1] : [1, 1.1, 1],
            opacity: [0.3, 0.6, 0.3],
            transition: {
              duration: state === "processing" ? 0.9 : 1.8,
              repeat: Infinity,
            },
          }}
        />

        {/* Processing Pulse Ring */}
        {state === "processing" && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-cyan-400/60"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{
              scale: 1.5,
              opacity: 0,
            }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        )}

        {/* Thinking Shimmer */}
        {state === "thinking" && (
          <motion.div
            className="absolute inset-0 rounded-full overflow-hidden"
            style={{ clipPath: "circle(50%)" }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent"
              animate={{
                x: ["-100%", "100%"],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </motion.div>
        )}

        {/* Success Checkmark */}
        {state === "success" && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Check className="w-8 h-8 text-green-400" strokeWidth={3} />
          </motion.div>
        )}

        {/* Error Icon */}
        {state === "error" && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <X className="w-8 h-8 text-red-400" strokeWidth={3} />
          </motion.div>
        )}

        {/* Particle Flicker (thinking state) */}
        {state === "thinking" &&
          [1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-cyan-400 rounded-full"
              style={{
                top: `${20 + i * 15}%`,
                left: `${15 + i * 20}%`,
              }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
      </div>

      {/* Label */}
      <motion.p
        className={`text-sm font-medium ${
          state === "error" ? "text-red-400" : "text-cyan-400"
        }`}
        animate={{
          opacity: [0.6, 1, 0.6],
          transition: { duration: 2, repeat: Infinity },
        }}
      >
        {displayLabel}
      </motion.p>
    </div>
  );
        }
