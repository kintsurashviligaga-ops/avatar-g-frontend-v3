"use client";

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  color: string;
}

export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    const initStars = () => {
      starsRef.current = [];
      const starCount = Math.floor((canvas.width * canvas.height) / 3000);
      
      for (let i = 0; i < starCount; i++) {
        starsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 0.5,
          opacity: Math.random() * 0.8 + 0.2,
          speed: Math.random() * 0.5 + 0.1,
          color: ['#ffffff', '#00D4FF', '#9D4EDD', '#FFD700'][Math.floor(Math.random() * 4)]
        });
      }
    };

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 2, 8, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      starsRef.current.forEach((star) => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = star.opacity;
        ctx.fill();
        ctx.globalAlpha = 1;

        star.y += star.speed;
        if (star.y > canvas.height) {
          star.y = 0;
          star.x = Math.random() * canvas.width;
        }

        star.opacity += (Math.random() - 0.5) * 0.1;
        star.opacity = Math.max(0.2, Math.min(1, star.opacity));
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const planets = [
    { id: 1, x: 15, y: 20, size: 60, color: '#FF6B35', glowColor: '#FF8C42', name: 'Mars' },
    { id: 2, x: 85, y: 30, size: 80, color: '#9D4EDD', glowColor: '#C77DFF', name: 'Nebula' },
    { id: 3, x: 75, y: 75, size: 100, color: '#00D4FF', glowColor: '#00FFFF', name: 'Aqua' },
    { id: 4, x: 20, y: 80, size: 50, color: '#FFD700', glowColor: '#FFA500', name: 'Sol' },
    { id: 5, x: 50, y: 10, size: 40, color: '#FF006E', glowColor: '#FF4D9E', name: 'Crimson' },
  ];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[100px] animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[120px]" />
      </div>

      {planets.map((planet) => (
        <motion.div
          key={planet.id}
          className="absolute rounded-full pointer-events-auto cursor-pointer group"
          style={{
            left: `${planet.x}%`,
            top: `${planet.y}%`,
            width: planet.size,
            height: planet.size,
            background: `radial-gradient(circle at 30% 30%, ${planet.glowColor}, ${planet.color})`,
            boxShadow: `0 0 ${planet.size}px ${planet.glowColor}40, 0 0 ${planet.size * 2}px ${planet.color}20`,
          }}
          animate={{
            x: [0, 10, -10, 0],
            y: [0, -10, 10, 0],
          }}
          transition={{
            duration: 20 + planet.id * 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          whileHover={{ scale: 1.2 }}
        >
          <div 
            className="absolute inset-[-20%] rounded-full border border-white/10 opacity-50"
            style={{
              background: `conic-gradient(from 0deg, transparent, ${planet.glowColor}20, transparent)`,
            }}
          />
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-white font-mono bg-black/50 px-2 py-1 rounded">
            {planet.name}
          </div>
        </motion.div>
      ))}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none">
        <motion.div
          className="absolute inset-0 rounded-full border border-cyan-500/20"
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
          style={{
            background: 'conic-gradient(from 0deg, transparent, rgba(0, 212, 255, 0.1), transparent, rgba(157, 78, 221, 0.1), transparent)',
          }}
        />
        <motion.div
          className="absolute inset-[10%] rounded-full border border-purple-500/20"
          animate={{ rotate: -360 }}
          transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-[20%] rounded-full border border-cyan-500/10"
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        />
      </div>
    </div>
  );
}
