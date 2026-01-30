"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface AgentGOrbProps {
  state?: "idle" | "thinking" | "success" | "error";
  size?: "sm" | "md" | "lg";
}

export default function AgentGOrb({ state = "idle", size = "md" }: AgentGOrbProps) {
  const [currentState, setCurrentState] = useState(state);

  useEffect(() => {
    setCurrentState(state);
  }, [state]);

  // Size mapping: 96-140px responsive
  const sizeClasses = {
    sm: "w-24 h-24", // 96px
    md: "w-32 h-32", // 128px
    lg: "w-36 h-36", // 144px
  };

  const innerSizes = {
    sm: "inset-3",
    md: "inset-4",
    lg: "inset-5",
  };

  // EXACT: Motion specs from blueprint
  const getAnimationConfig = () => {
    switch (currentState) {
      case "thinking":
        return {
          scale: [1, 1.06, 1],
          transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
        };
      case "success":
        return {
          scale: [1, 1.08, 1],
          transition: { duration: 0.6, ease: "easeOut" },
        };
      case "error":
        return {
          scale: [1, 0.95, 1],
          opacity: [1, 0.7, 1],
          transition: { duration: 0.8, ease: "easeInOut" },
        };
      default: // idle
        return {
          scale: [1, 1.06, 1],
          transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
        };
    }
  };

  const getGlowOpacity = () => {
    const baseOpacity = currentState === "thinking" ? 0.37 : 0.25;
    const maxOpacity = currentState === "thinking" ? 0.57 : 0.45;
    
    return {
      opacity: [baseOpacity, maxOpacity, baseOpacity],
      transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" },
    };
  };

  return (
    <div className={`relative ${sizeClasses[size]} mx-auto`}>
      {/* 1) Outer glow - EXACT: opacity 0.25→0.45, blur static */}
      <motion.div
        animate={getGlowOpacity()}
        className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 blur-2xl"
        style={{ willChange: "opacity" }}
      />

      {/* 2) Float animation - EXACT: Y 0→-8→0, duration 4.0s */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4.0, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0"
      >
        {/* 3) Breathing pulse - EXACT: scale 1.00→1.06→1.00, duration 3.2s */}
        <motion.div
          animate={getAnimationConfig()}
          className={`absolute ${innerSizes[size]} rounded-full bg-gradient-to-br from-cyan-300 via-cyan-400 to-blue-600 shadow-2xl flex items-center justify-center`}
          style={{ 
            willChange: "transform",
            boxShadow: "0 0 60px rgba(34, 211, 238, 0.3)", // #22D3EE glow
          }}
        >
          {/* Glass highlight effect */}
          <div className="absolute top-2 left-2 w-1/3 h-1/3 rounded-full bg-white/20 blur-sm" />
          
          {/* Inner core */}
          <div className="relative w-1/2 h-1/2 rounded-full bg-gradient-to-br from-cyan-200 to-cyan-500 flex items-center justify-center">
            <svg 
              viewBox="0 0 24 24" 
              className="w-1/2 h-1/2 text-white opacity-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" 
              />
            </svg>
          </div>

          {/* 4) Ring A - EXACT: rotate 0→360 over 18s linear infinite */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-2 rounded-full border border-cyan-400/20"
            style={{ willChange: "transform" }}
          />

          {/* 4) Ring B - EXACT: rotate 0→-360 over 14s linear infinite */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-4 rounded-full border border-dashed border-cyan-400/15"
            style={{ willChange: "transform" }}
          />
        </motion.div>
      </motion.div>

      {/* 5) Thinking state: scan line sweep */}
      {currentState === "thinking" && (
        <motion.div
          initial={{ top: "0%", opacity: 0 }}
          animate={{ 
            top: ["0%", "100%", "0%"],
            opacity: [0, 0.6, 0],
          }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent"
        />
      )}

      {/* Micro particles (8-16 subtle dots) */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-cyan-400/30"
          animate={{
            x: [0, Math.sin(i * 0.5) * 20, 0],
            y: [0, Math.cos(i * 0.5) * 20, 0],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: 3 + i * 0.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.1,
          }}
          style={{
            top: `${20 + (i % 4) * 20}%`,
            left: `${20 + Math.floor(i / 4) * 20}%`,
          }}
        />
      ))}
    </div>
  );
}
