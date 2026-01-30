"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

export function WarpBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let stars: Array<{
      x: number;
      y: number;
      z: number;
      size: number;
    }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    const initStars = () => {
      stars = [];
      const count = window.innerWidth < 768 ? 80 : 150;
      for (let i = 0; i < count; i++) {
        stars.push({
          x: (Math.random() - 0.5) * canvas.width,
          y: (Math.random() - 0.5) * canvas.height,
          z: Math.random() * 1000,
          size: Math.random() * 1.5 + 0.5,
        });
      }
    };

    const animate = () => {
      ctx.fillStyle = "#05070A";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      stars.forEach((star) => {
        star.z -= 0.5;
        if (star.z <= 0) {
          star.z = 1000;
          star.x = (Math.random() - 0.5) * canvas.width;
          star.y = (Math.random() - 0.5) * canvas.height;
        }

        const scale = 1000 / star.z;
        const x = centerX + star.x * scale;
        const y = centerY + star.y * scale;
        const size = star.size * scale * 0.15;

        const alpha = Math.min(1, (1000 - star.z) / 500);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 211, 238, ${alpha * 0.6})`;
        ctx.fill();

        // Warp trail
        if (scale > 2) {
          const trailLength = size * 3;
          const angle = Math.atan2(y - centerY, x - centerX);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x - Math.cos(angle) * trailLength,
            y - Math.sin(angle) * trailLength
          );
          ctx.strokeStyle = `rgba(34, 211, 238, ${alpha * 0.2})`;
          ctx.lineWidth = size * 0.5;
          ctx.stroke();
        }
      });

      animationId = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.8 }}
      />
      
      {/* Subtle planet glows */}
      <motion.div
        animate={{ opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gradient-to-br from-cyan-900/20 to-transparent blur-3xl"
      />
      <motion.div
        animate={{ opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-1/3 right-1/4 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-blue-900/15 to-transparent blur-3xl"
      />
      
      {/* Center singularity */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-radial from-cyan-900/20 via-transparent to-transparent blur-3xl" />
    </div>
  );
}
