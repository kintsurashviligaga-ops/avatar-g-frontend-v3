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

interface Planet {
  x: number;
  y: number;
  size: number;
  color: string;
  driftX: number;
  driftY: number;
  phase: number;
  opacity: number;
}

export default function SpaceSingularityBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const starsRef = useRef<Star[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const frameCountRef = useRef(0);
  const isActiveRef = useRef(true);

  const initStars = useCallback((width: number, height: number) => {
    const starCount = 120;
    starsRef.current = [];
    for (let i = 0; i < starCount; i++) {
      starsRef.current.push({
        x: (Math.random() - 0.5) * width * 3,
        y: (Math.random() - 0.5) * height * 3,
        z: Math.random() * 2000 + 500,
        size: Math.random() * 1.2 + 0.3,
        speed: Math.random() * 0.8 + 0.2,
        opacity: Math.random() * 0.5 + 0.3,
      });
    }
  }, []);

  const initPlanets = useCallback((width: number, height: number) => {
    planetsRef.current = [
      { x: width * 0.15, y: height * 0.25, size: 80, color: "rgba(100, 149, 237, 0.15)", driftX: 0.05, driftY: 0.03, phase: 0, opacity: 0.4 },
      { x: width * 0.85, y: height * 0.7, size: 120, color: "rgba(147, 112, 219, 0.12)", driftX: -0.04, driftY: 0.06, phase: Math.PI, opacity: 0.35 },
      { x: width * 0.7, y: height * 0.15, size: 60, color: "rgba(34, 211, 238, 0.1)", driftX: 0.03, driftY: -0.02, phase: Math.PI / 2, opacity: 0.3 },
    ];
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
      initPlanets(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 };
    };
    window.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      if (!isActiveRef.current || !canvas || !ctx) return;
      frameCountRef.current = (frameCountRef.current + 1) % 1000;
      if (frameCountRef.current % 2 !== 0) { animationRef.current = requestAnimationFrame(animate); return; }

      const centerX = canvas.width / 2 + mouseRef.current.x * 20;
      const centerY = canvas.height / 2 + mouseRef.current.y * 20;

      ctx.fillStyle = "#05070A";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const vignette = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(canvas.width, canvas.height) * 0.7);
      vignette.addColorStop(0, "rgba(5, 7, 10, 0)");
      vignette.addColorStop(0.6, "rgba(5, 7, 10, 0.2)");
      vignette.addColorStop(1, "rgba(5, 7, 10, 0.6)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      planetsRef.current.forEach((planet) => {
        planet.phase += 0.002;
        planet.x += planet.driftX + Math.sin(planet.phase) * 0.05;
        planet.y += planet.driftY + Math.cos(planet.phase * 0.7) * 0.05;
        if (planet.x < -planet.size) planet.x = canvas.width + planet.size;
        if (planet.x > canvas.width + planet.size) planet.x = -planet.size;
        if (planet.y < -planet.size) planet.y = canvas.height + planet.size;
        if (planet.y > canvas.height + planet.size) planet.y = -planet.size;

        const gradient = ctx.createRadialGradient(planet.x - planet.size * 0.3, planet.y - planet.size * 0.3, 0, planet.x, planet.y, planet.size);
        if (planet.color.includes("100, 149, 237")) {
          gradient.addColorStop(0, `rgba(100, 149, 237, ${planet.opacity})`);
          gradient.addColorStop(0.5, `rgba(25, 25, 112, ${planet.opacity * 0.5})`);
          gradient.addColorStop(1, "rgba(5, 7, 10, 0)");
        } else if (planet.color.includes("147, 112, 219")) {
          gradient.addColorStop(0, `rgba(147, 112, 219, ${planet.opacity})`);
          gradient.addColorStop(0.5, `rgba(75, 0, 130, ${planet.opacity * 0.5})`);
          gradient.addColorStop(1, "rgba(5, 7, 10, 0)");
        } else {
          gradient.addColorStop(0, `rgba(34, 211, 238, ${planet.opacity})`);
          gradient.addColorStop(0.5, `rgba(8, 145, 178, ${planet.opacity * 0.5})`);
          gradient.addColorStop(1, "rgba(5, 7, 10, 0)");
        }
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.size, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      starsRef.current.forEach((star) => {
        star.z -= star.speed * 1.5;
        if (star.z <= 10) { star.z = 2500; star.x = (Math.random() - 0.5) * canvas.width * 3; star.y = (Math.random() - 0.5) * canvas.height * 3; }
        const scale = 400 / star.z;
        const x = centerX + star.x * scale;
        const y = centerY + star.y * scale;
        const size = star.size * scale * 0.8;
        const prevScale = 400 / (star.z + star.speed * 15);
        const prevX = centerX + star.x * prevScale;
        const prevY = centerY + star.y * prevScale;
        const alpha = Math.min(1, (2000 - star.z) / 1500) * star.opacity;

        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = `rgba(200, 230, 255, ${alpha * 0.4})`;
        ctx.lineWidth = size * 0.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      });

      const singularity = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 150);
      singularity.addColorStop(0, "rgba(34, 211, 238, 0.06)");
      singularity.addColorStop(0.5, "rgba(8, 145, 178, 0.02)");
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
      if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    };
  }, [initStars, initPlanets]);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ background: "#05070A", zIndex: 0 }} />;
}
