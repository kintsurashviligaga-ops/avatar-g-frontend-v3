"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface AgentPresence3DProps {
  isActive?: boolean;
  size?: number;
}

export default function AgentPresence3D({ 
  isActive = true,
  size = 140 
}: AgentPresence3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High DPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr * 2;
    canvas.height = size * dpr * 2;
    ctx.scale(dpr, dpr);

    let rotation = 0;
    let breathePhase = 0;
    let pulsePhase = 0;

    const animate = () => {
      rotation += 0.003;
      breathePhase += 0.02;
      pulsePhase += 0.03;

      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      
      const centerX = (canvas.width / dpr) / 2;
      const centerY = (canvas.height / dpr) / 2;
      const baseRadius = size * 0.4;
      const breatheScale = 1 + Math.sin(breathePhase) * 0.03;
      const pulseIntensity = 0.5 + Math.sin(pulsePhase) * 0.2;

      // Outer aura rings (breathing)
      for (let i = 4; i >= 0; i--) {
        const ringRadius = baseRadius * (1.3 + i * 0.12) * breatheScale;
        const alpha = (0.08 - i * 0.015) * pulseIntensity;
        
        const gradient = ctx.createRadialGradient(
          centerX, centerY, 0,
          centerX, centerY, ringRadius
        );
        gradient.addColorStop(0, `rgba(34, 211, 238, 0)`);
        gradient.addColorStop(0.4, `rgba(34, 211, 238, ${alpha})`);
        gradient.addColorStop(1, `rgba(34, 211, 238, 0)`);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Main orb - glassy metallic sphere
      const orbRadius = baseRadius * breatheScale;
      
      // Shadow/depth layer
      ctx.beginPath();
      ctx.arc(centerX + 2, centerY + 3, orbRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fill();

      // Primary sphere gradient
      const sphereGrad = ctx.createRadialGradient(
        centerX - orbRadius * 0.35,
        centerY - orbRadius * 0.35,
        0,
        centerX,
        centerY,
        orbRadius
      );
      sphereGrad.addColorStop(0, "#67E8F9");  // Light cyan
      sphereGrad.addColorStop(0.25, "#22D3EE"); // Cyan
      sphereGrad.addColorStop(0.6, "#0891B2"); // Dark cyan
      sphereGrad.addColorStop(1, "#164E63"); // Deep teal

      ctx.beginPath();
      ctx.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
      ctx.fillStyle = sphereGrad;
      ctx.fill();

      // Glass reflection overlay
      const reflectionGrad = ctx.createLinearGradient(
        centerX - orbRadius, centerY - orbRadius,
        centerX + orbRadius, centerY + orbRadius
      );
      reflectionGrad.addColorStop(0, "rgba(255, 255, 255, 0.3)");
      reflectionGrad.addColorStop(0.3, "rgba(255, 255, 255, 0.1)");
      reflectionGrad.addColorStop(0.5, "rgba(255, 255, 255, 0)");
      reflectionGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.beginPath();
      ctx.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
      ctx.fillStyle = reflectionGrad;
      ctx.fill();

      // Rotating ring (holographic interface)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);
      
      // Outer ring
      ctx.beginPath();
      ctx.ellipse(0, 0, orbRadius * 1.4, orbRadius * 0.35, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.3 * pulseIntensity})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Ring accents
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((Math.PI / 2) * i);
        ctx.beginPath();
        ctx.arc(orbRadius * 1.4, 0, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 211, 238, ${0.6 * pulseIntensity})`;
        ctx.fill();
        ctx.restore();
      }
      
      ctx.restore();

      // Inner core glow
      const coreGrad = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, orbRadius * 0.6
      );
      coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.4 * pulseIntensity})`);
      coreGrad.addColorStop(0.4, `rgba(34, 211, 238, ${0.2 * pulseIntensity})`);
      coreGrad.addColorStop(1, "rgba(34, 211, 238, 0)");

      ctx.beginPath();
      ctx.arc(centerX, centerY, orbRadius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Specular highlight (glass feel)
      ctx.beginPath();
      ctx.ellipse(
        centerX - orbRadius * 0.35,
        centerY - orbRadius * 0.4,
        orbRadius * 0.15,
        orbRadius * 0.08,
        -Math.PI / 4,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fill();

      // Status indicator ring when active
      if (isActive) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, orbRadius * 1.6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 211, 238, ${0.15 * pulseIntensity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [size, isActive]);

  return (
    <div className="relative flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        className="w-32 h-32 sm:w-36 sm:h-36"
        style={{ imageRendering: "crisp-edges" }}
      />
      
      {/* Ambient glow */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        animate={{
          boxShadow: [
            "0 0 30px rgba(34, 211, 238, 0.2)",
            "0 0 50px rgba(34, 211, 238, 0.35)",
            "0 0 30px rgba(34, 211, 238, 0.2)",
          ],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      {/* Pulse rings */}
      <motion.div
        className="absolute inset-0 rounded-full border border-cyan-400/20"
        animate={{
          scale: [1, 1.3, 1.5],
          opacity: [0.3, 0.1, 0],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />
    </div>
  );
}
