"use client";

import { motion } from 'framer-motion';
import SpaceBackground from '@/components/SpaceBackground';
import RetroDial from '@/components/RetroDial';
import { useIdentityStore } from '@/store/identity-store';
import { Badge } from '@/components/ui/badge';
import { Activity, Shield, Zap } from 'lucide-react';

export default function Home() {
  const { avatar, voice } = useIdentityStore();

  return (
    <div className="min-h-screen bg-[#000208] text-white overflow-hidden relative">
      <SpaceBackground />
      
      <motion.header 
        className="relative z-10 flex items-center justify-between px-8 py-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center cyan-glow">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-glow tracking-wider">AVATAR G</h1>
            <p className="text-cyan-400/70 text-xs font-mono tracking-[0.2em]">SINGULARITY PROTOCOL</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge className={avatar ? "bg-green-500/20 text-green-400 border-green-500/30 font-mono" : "border-cyan-500/30 text-cyan-400/70 font-mono"}>
            {avatar ? '● AVATAR LINKED' : '○ AVATAR REQUIRED'}
          </Badge>
          <Badge className={voice ? "bg-purple-500/20 text-purple-400 border-purple-500/30 font-mono" : "border-cyan-500/30 text-cyan-400/70 font-mono"}>
            {voice ? '● VOICE CLONED' : '○ VOICE REQUIRED'}
          </Badge>
          <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-mono">
            <Activity className="w-3 h-3 mr-1 animate-pulse" /> ONLINE
          </Badge>
        </div>
      </motion.header>

      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-100px)] px-4">
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-5xl md:text-7xl font-bold text-glow mb-4 tracking-tight">
            DIGITAL <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">TWIN</span>
          </h2>
          <p className="text-cyan-400/60 text-lg font-mono tracking-widest">
            INTERSTELLAR IDENTITY PROTOCOL v3.0
          </p>
        </motion.div>

        <RetroDial />

        <motion.div 
          className="absolute bottom-8 left-8 text-xs font-mono text-cyan-400/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3 h-3" />
            <span>QUANTUM ENCRYPTION: ACTIVE</span>
          </div>
          <div>COORDINATES: 42.3601° N, 71.0589° W</div>
          <div>SINGULARITY PROXIMITY: 0.0042 AU</div>
        </motion.div>

        <motion.div 
          className="absolute bottom-8 right-8 text-xs font-mono text-cyan-400/40 text-right"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <div className="mb-1">SYSTEM INTEGRITY: 100%</div>
          <div>NEURAL UPLINK: STABLE</div>
          <div>REALITY ANCHOR: LOCKED</div>
        </motion.div>
      </main>
    </div>
  );
}
