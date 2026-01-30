"use client";

import React, { useEffect, useRef, useCallback } from "react";

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
  opacity: number;
}

export default function SpaceSingularityBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const starsRef = useRef<Star[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const frameCountRef = useRef(0);
  const isActiveRef = useRef(true);

  const initStars = useCallback((width: number, height: number) => {
    const starCount = 60; // Reduced for calmness - blueprint spec
    starsRef.current = [];
    for (let i = 0; i < starCount; i++) {
      starsRef.current.push({
        x: (Math.random() - 0.5) * width * 2,
        y: (Math.random() - 0.5) * height * 2,
        z: Math.random() * 1500 + 500,
        size: Math.random() * 0.6 + 0.2, // Small, subtle
        speed: Math.random() * 0.2 + 0.05, // Very slow
        opacity: Math.random() * 0.3 + 0.1, // Subtle
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    isActiveRef.current = true;
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };
    window.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      if (!isActiveRef.current || !canvas || !ctx) return;

      // 30fps for performance - render every 2nd frame
      frameCountRef.current = (frameCountRef.current + 1) % 1000;
      if (frameCountRef.current % 2 !== 0) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const centerX = canvas.width / 2 + mouseRef.current.x * 8; // Subtle parallax
      const centerY = canvas.height / 2 + mouseRef.current.y * 8;

      // EXACT: Background Black #05070A
      ctx.fillStyle = "#05070A";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle vignette - doesn't fight text
      const vignette = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, Math.max(canvas.width, canvas.height) * 0.8
      );
      vignette.addColorStop(0, "rgba(5, 7, 10, 0)");
      vignette.addColorStop(0.6, "rgba(5, 7, 10, 0.2)");
      vignette.addColorStop(1, "rgba(5, 7, 10, 0.5)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Stars - slow fly-into-singularity (calm, not dizzying)
      starsRef.current.forEach((star) => {
        star.z -= star.speed;
        
        if (star.z <= 10) {
          star.z = 1500;
          star.x = (Math.random() - 0.5) * canvas.width * 2;
          star.y = (Math.random() - 0.5) * canvas.height * 2;
        }

        const scale = 300 / star.z;
        const x = centerX + star.x * scale;
        const y = centerY + star.y * scale;
        const size = star.size * scale * 0.5;
        const alpha = Math.min(1, (1000 - star.z) / 800) * star.opacity;

        // Draw star - soft, not harsh
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 230, 255, ${alpha})`;
        ctx.fill();
      });

      // Subtle singularity glow - cyan #22D3EE at very low opacity
      const singularity = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, 120
      );
      singularity.addColorStop(0, "rgba(34, 211, 238, 0.02)"); // #22D3EE
      singularity.addColorStop(0.5, "rgba(56, 189, 248, 0.01)"); // #38BDF8
      singularity.addColorStop(1, "rgba(5, 7, 10, 0)");
      ctx.fillStyle = singularity;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      isActiveRef.current = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [initStars]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ background: "#05070A", zIndex: 0 }}
    />
  );
}
