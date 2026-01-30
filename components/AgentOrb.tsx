"use client";

import React from "react";
import { motion } from "framer-motion";

interface AgentOrbProps {
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}

export function AgentOrb({ size = "md", pulse = true }: AgentOrbProps) {
  const sizes = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
  };

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer rings */}
      {pulse && (
        <>
          <motion.div
            animate={{ rotate: 360, opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute w-[140%] h-[140%] rounded-full border border-cyan-500/20"
          />
          <motion.div
            animate={{ rotate: -360, opacity: [0.05, 0.2, 0.05] }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute w-[180%] h-[180%] rounded-full border border-cyan-500/10"
          />
        </>
      )}
      
      {/* Main orb */}
      <motion.div
        animate={pulse ? {
          scale: [1, 1.05, 1],
          opacity: [0.9, 1, 0.9],
        } : {}}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className={`${sizes[size]} relative rounded-full bg-gradient-to-br from-cyan-400/30 via-blue-500/20 to-purple-600/30 backdrop-blur-sm`}
        style={{
          boxShadow: "0 0 60px rgba(34, 211, 238, 0.3), inset 0 0 40px rgba(34, 211, 238, 0.2)",
        }}
      >
        {/* Inner core */}
        <motion.div
          animate={{ scale: [0.8, 1, 0.8], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-[20%] rounded-full bg-gradient-to-tr from-cyan-300/80 to-white/40 blur-sm"
        />
        
        {/* Glass highlight */}
        <div className="absolute top-[15%] left-[20%] w-[30%] h-[20%] rounded-full bg-white/30 blur-md" />
      </motion.div>
    </div>
  );
}
