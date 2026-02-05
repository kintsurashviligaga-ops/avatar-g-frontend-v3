"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
  Rocket, Mic, Film, Music, Image as ImageIcon, Briefcase, 
  TrendingUp, Code, PenTool, Presentation, Languages, Users, Glasses 
} from 'lucide-react';

const SERVICES = [
  { id: 'avatar-builder', name: 'Avatar', icon: Rocket, color: '#00D4FF', angle: 0 },
  { id: 'voice-cloner', name: 'Voice', icon: Mic, color: '#9D4EDD', angle: 27.7 },
  { id: 'media-production', name: 'Media', icon: Film, color: '#FF6B35', angle: 55.4 },
  { id: 'music-generator', name: 'Music', icon: Music, color: '#06FFA5', angle: 83.1 },
  { id: 'photo-studio', name: 'Photo', icon: ImageIcon, color: '#FFD700', angle: 110.8 },
  { id: 'executive-agent', name: 'Exec', icon: Briefcase, color: '#FF006E', angle: 138.5 },
  { id: 'finance-assistant', name: 'Finance', icon: TrendingUp, color: '#00D4FF', angle: 166.2 },
  { id: 'code-assistant', name: 'Code', icon: Code, color: '#9D4EDD', angle: 193.9 },
  { id: 'creative-writer', name: 'Write', icon: PenTool, color: '#FF6B35', angle: 221.6 },
  { id: 'presentation-builder', name: 'Slides', icon: Presentation, color: '#06FFA5', angle: 249.3 },
  { id: 'language-tutor', name: 'Lang', icon: Languages, color: '#FFD700', angle: 277 },
  { id: 'meeting-assistant', name: 'Meet', icon: Users, color: '#FF006E', angle: 304.7 },
  { id: 'ar-vr-experiences', name: 'AR/VR', icon: Glasses, color: '#00D4FF', angle: 332.4 },
];

export default function RetroDial() {
  const [hoveredService, setHoveredService] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const radius = 280;

  return (
    <div className="relative w-full h-[700px] flex items-center justify-center">
      <div className="absolute w-[650px] h-[650px] rounded-full border-2 border-cyan-500/20" style={{
        background: 'conic-gradient(from 0deg, #1a1a2e, #16213e, #0f3460, #1a1a2e)',
        boxShadow: '0 0 0 2px rgba(0, 212, 255, 0.3), 0 0 0 4px rgba(0, 212, 255, 0.1), 0 0 30px rgba(0, 212, 255, 0.2), inset 0 0 60px rgba(0, 0, 0, 0.5)'
      }} />
      <div className="absolute w-[600px] h-[600px] rounded-full border border-dashed border-cyan-500/10 animate-spin" style={{ animationDuration: '60s' }} />
      
      <div className="absolute w-[580px] h-[580px] rounded-full">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 bg-cyan-500/30"
            style={{
              left: '50%',
              top: '0',
              height: i % 5 === 0 ? '12px' : '6px',
              transform: `rotate(${i * 6}deg) translateY(-290px)`,
              transformOrigin: '50% 300px',
              opacity: i % 5 === 0 ? 1 : 0.3,
            }}
          />
        ))}
      </div>

      {SERVICES.map((service, index) => {
        const Icon = service.icon;
        const isHovered = hoveredService === service.id;
        const isSelected = selectedService === service.id;
        const angleRad = (service.angle * Math.PI) / 180;
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;

        return (
          <motion.div
            key={service.id}
            className="absolute"
            style={{ left: '50%', top: '50%', x, y }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.05, type: 'spring' }}
          >
            <Link href={`/services/${service.id}`}>
              <motion.button
                className="relative -translate-x-1/2 -translate-y-1/2 group"
                onMouseEnter={() => setHoveredService(service.id)}
                onMouseLeave={() => setHoveredService(null)}
                onClick={() => setSelectedService(service.id)}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.95 }}
              >
                <div 
                  className="w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300"
                  style={{
                    background: isHovered || isSelected 
                      ? `linear-gradient(135deg, ${service.color}, ${service.color}80)` 
                      : 'linear-gradient(135deg, rgba(10, 22, 40, 0.9), rgba(5, 10, 20, 0.9))',
                    border: `2px solid ${isHovered || isSelected ? service.color : 'rgba(0, 212, 255, 0.3)'}`,
                    boxShadow: isHovered || isSelected 
                      ? `0 0 30px ${service.color}80, 0 0 60px ${service.color}40, inset 0 0 20px ${service.color}20` 
                      : '0 4px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <Icon 
                    className="w-8 h-8 transition-all duration-300" 
                    style={{ color: isHovered || isSelected ? '#ffffff' : service.color }}
                  />
                </div>

                <motion.div 
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-mono tracking-wider"
                  style={{ color: service.color }}
                  animate={{ opacity: isHovered ? 1 : 0.7 }}
                >
                  {service.name}
                </motion.div>

                <svg 
                  className="absolute top-1/2 left-1/2 w-[300px] h-[2px] pointer-events-none"
                  style={{ 
                    transform: `rotate(${service.angle + 180}deg)`, 
                    transformOrigin: '0 50%',
                    opacity: isHovered ? 0.5 : 0,
                  }}
                >
                  <line x1="0" y1="1" x2="300" y2="1" stroke={service.color} strokeWidth="1" strokeDasharray="4 4" />
                </svg>
              </motion.button>
            </Link>
          </motion.div>
        );
      })}

      <motion.div 
        className="absolute z-20 w-48 h-48 rounded-full flex items-center justify-center"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #1a1a3e, #0a0a1e)',
          border: '3px solid rgba(0, 212, 255, 0.5)',
          boxShadow: '0 0 60px rgba(0, 212, 255, 0.4), inset 0 0 40px rgba(0, 212, 255, 0.1)',
        }}
        animate={{ 
          boxShadow: [
            '0 0 60px rgba(0, 212, 255, 0.4), inset 0 0 40px rgba(0, 212, 255, 0.1)',
            '0 0 80px rgba(0, 212, 255, 0.6), inset 0 0 60px rgba(0, 212, 255, 0.2)',
            '0 0 60px rgba(0, 212, 255, 0.4), inset 0 0 40px rgba(0, 212, 255, 0.1)',
          ]
        }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <div className="absolute inset-2 rounded-full border border-cyan-500/30 animate-spin" style={{ animationDuration: '10s' }} />
        <div className="absolute inset-4 rounded-full border border-dashed border-purple-500/30 animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }} />
        
        <div className="text-center">
          <div className="text-4xl mb-1">👤</div>
          <div className="text-[10px] text-cyan-400/70 font-mono">NO AVATAR</div>
          <div className="text-[8px] text-cyan-400/40 font-mono mt-1">SINGULARITY v3.0</div>
        </div>

        <div className="absolute inset-0 rounded-full overflow-hidden">
          <motion.div 
            className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </motion.div>

      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center">
        <div className="text-cyan-400/50 text-xs font-mono tracking-[0.3em] mb-2">SYSTEM STATUS</div>
        <div className="text-cyan-400 text-sm font-mono">
          {hoveredService ? `SELECTED: ${hoveredService.toUpperCase().replace('-', ' ')}` : 'AWAITING INPUT...'}
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-green-400/70 text-xs font-mono">ONLINE</span>
        </div>
      </div>
    </div>
  );
}
