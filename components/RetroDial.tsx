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
  const radius = 280;

  return (
    <div className="relative w-full h-[700px] flex items-center justify-center">
      {/* Outer Ring */}
      <div className="absolute w-[650px] h-[650px] rounded-full border-2 border-cyan-500/20" style={{
        background: 'conic-gradient(from 0deg, #1a1a2e, #16213e, #0f3460, #1a1a2e)',
        boxShadow: '0 0 0 2px rgba(0, 212, 255, 0.3), 0 0 30px rgba(0, 212, 255, 0.2), inset 0 0 60px rgba(0, 0, 0, 0.5)'
      }} />
      
      {/* Tick Marks */}
      <div className="absolute w-[580px] h-[580px] rounded-full">
        {Array.from({ length: 60 }).map((_, i) => (
          <div key={i} className="absolute w-1 bg-cyan-500/30" style={{
            left: '50%', top: '0', height: i % 5 === 0 ? '12px' : '6px',
            transform: `rotate(${i * 6}deg) translateY(-290px)`, transformOrigin: '50% 300px',
            opacity: i % 5 === 0 ? 1 : 0.3,
          }} />
        ))}
      </div>

      {/* Service Buttons */}
      {SERVICES.map((service, index) => {
        const Icon = service.icon;
        const isHovered = hoveredService === service.id;
        const angleRad = (service.angle * Math.PI) / 180;
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;

        return (
          <motion.div key={service.id} className="absolute" style={{ left: '50%', top: '50%', x, y }}
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: index * 0.05 }}>
            <Link href={`/services/${service.id}`}>
              <motion.button className="relative -translate-x-1/2 -translate-y-1/2 group"
                onMouseEnter={() => setHoveredService(service.id)} onMouseLeave={() => setHoveredService(null)}
                whileHover={{ scale: 1.15 }}>
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300" style={{
                  background: isHovered ? `linear-gradient(135deg, ${service.color}, ${service.color}80)` : 'linear-gradient(135deg, rgba(10, 22, 40, 0.9), rgba(5, 10, 20, 0.9))',
                  border: `2px solid ${isHovered ? service.color : 'rgba(0, 212, 255, 0.3)'}`,
                  boxShadow: isHovered ? `0 0 30px ${service.color}80` : '0 4px 20px rgba(0, 0, 0, 0.5)',
                }}>
                  <Icon className="w-8 h-8" style={{ color: isHovered ? '#ffffff' : service.color }} />
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-mono" style={{ color: service.color }}>
                  {service.name}
                </div>
              </motion.button>
            </Link>
          </motion.div>
        );
      })}

      {/* Center Avatar */}
      <motion.div className="absolute z-20 w-48 h-48 rounded-full flex items-center justify-center"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #1a1a3e, #0a0a1e)',
          border: '3px solid rgba(0, 212, 255, 0.5)',
          boxShadow: '0 0 60px rgba(0, 212, 255, 0.4)',
        }}>
        <div className="text-center">
          <div className="text-4xl mb-1">👤</div>
          <div className="text-[10px] text-cyan-400/70 font-mono">NO AVATAR</div>
        </div>
        <motion.div className="absolute inset-0 rounded-full overflow-hidden">
          <motion.div className="w-full h-1 bg-cyan-400" animate={{ top: ['0%', '100%'] }} transition={{ duration: 2, repeat: Infinity }} />
        </motion.div>
      </motion.div>
    </div>
  );
}
