"use client";

import React, { useEffect, useRef } from "react";

export default function SpaceSingularityBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: Array<{ x: number; y: number; size: number; speedX: number; speedY: number; opacity: number; twinkle: number }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const createParticles = () => {
      particles = [];
      const count = Math.floor((canvas.width * canvas.height) / 10000);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 0.5,
          speedX: (Math.random() - 0.5) * 0.2,
          speedY: (Math.random() - 0.5) * 0.2,
          opacity: Math.random() * 0.5 + 0.2,
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    };

    const draw = () => {
      ctx.fillStyle = "#05070A";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.8);
      gradient.addColorStop(0, "rgba(6, 182, 212, 0.08)");
      gradient.addColorStop(0.4, "rgba(59, 130, 246, 0.03)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle) => {
        particle.twinkle += 0.02;
        const twinkleOpacity = particle.opacity * (0.7 + 0.3 * Math.sin(particle.twinkle));
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(6, 182, 212, ${twinkleOpacity})`;
        ctx.fill();

        particle.x += particle.speedX;
        particle.y += particle.speedY;

        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;
      });

      animationId = requestAnimationFrame(draw);
    };

    resize();
    createParticles();
    draw();

    const handleResize = () => { resize(); createParticles(); };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" style={{ background: "#05070A" }} />;
}
