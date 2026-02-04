"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { LucideIcon, Loader2 } from "lucide-react";

interface ServiceCardProps { id: string; title: string; description: string; icon: LucideIcon; color: string; index: number; }

export default function ServiceCard({ id, title, description, icon: Icon, color, index }: ServiceCardProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 200));
    router.push(`/services/${id}`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onClick={handleClick} className="group relative cursor-pointer">
      <motion.div animate={{ scale: isHovered ? 1.03 : 1, y: isHovered ? -5 : 0 }} transition={{ duration: 0.3 }} className={`relative p-6 rounded-2xl border backdrop-blur-xl transition-all duration-300 h-full ${isHovered ? 'bg-white/10 border-cyan-500/50 shadow-2xl shadow-cyan-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
        <motion.div animate={{ opacity: isHovered ? 1 : 0 }} transition={{ duration: 0.3 }} className={`absolute inset-0 rounded-2xl blur-xl -z-10 bg-gradient-to-br ${color} opacity-30`} />
        <motion.div animate={{ scale: isHovered ? 1.1 : 1, rotate: isHovered ? 5 : 0 }} transition={{ duration: 0.3 }} className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${color} shadow-lg`}>
          {isLoading ? <Loader2 className="w-7 h-7 text-white animate-spin" /> : <Icon className="w-7 h-7 text-white" />}
        </motion.div>
        <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-cyan-400 transition-colors">{title}</h3>
        <p className="text-sm text-gray-400 mb-4 line-clamp-2">{description}</p>
        <div className="flex items-center justify-between mt-auto">
          <motion.div animate={{ x: isHovered ? 5 : 0 }} transition={{ duration: 0.3 }} className="flex items-center text-cyan-400 text-sm font-medium">
            <span>გახსნა</span>
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </motion.div>
          <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />მზადაა</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
