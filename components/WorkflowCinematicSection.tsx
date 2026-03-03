'use client'

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// simplified performance safe fallback for WebGL per 90+ lighthouse spec
export function WorkflowCinematicSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <section id="workflow-cinematic" className="relative w-full py-24 bg-[#030308] border-t border-white/[0.05] overflow-hidden min-h-[600px] flex flex-col items-center">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.05)_0%,transparent_70%)] pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 w-full relative z-10 text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
          როგორ მუშაობს შენი AI ქარხანა
        </h2>
        <p className="text-cyan-400/80 tracking-wide text-sm md:text-base uppercase">
          ინპუტიდან შედეგამდე — კინემატიკური 3D ვორკფლოუ, რომელიც აჩვენებს პროცესს.
        </p>
      </div>

      <div className="relative w-full max-w-5xl mx-auto px-4 mt-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4 select-none relative">
          
          {/* Connecting Line Desktop */}
          <div className="hidden md:block absolute top-[60px] left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent z-0">
            <div className="absolute top-0 bottom-0 left-0 w-1/4 bg-cyan-400 blur-[2px] opacity-50 animate-[slide-right_3s_ease-in-out_infinite]" />
          </div>

          {/* Connected Line Mobile */}
          <div className="md:hidden absolute top-[10%] bottom-[10%] left-1/2 -ml-[1px] w-[2px] bg-gradient-to-b from-transparent via-cyan-500/30 to-transparent z-0">
             <div className="absolute left-0 right-0 top-0 h-1/4 bg-cyan-400 blur-[2px] opacity-50 animate-[slide-down_3s_ease-in-out_infinite]" />
          </div>

          {/* Node 1: Input */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="relative z-10 flex flex-col items-center max-w-[180px] text-center"
          >
            <div className="w-20 h-20 rounded-full bg-[#0a0a1a] border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.2)] flex items-center justify-center mb-4">
               <div className="w-10 h-10 rounded-full bg-cyan-400/20 blur-sm absolute" />
               <span className="text-cyan-400 font-bold z-10 block">INPUT</span>
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">მომხმარებლის ინპუტი</h3>
            <p className="text-white/50 text-xs">ფოტო • ვიდეო • ტექსტი • მიზანი</p>
          </motion.div>

          {/* Node 2: Core */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
            className="relative z-10 flex flex-col items-center max-w-[180px] text-center md:-mt-8"
          >
            <div className="w-28 h-28 rounded-full bg-[#00000a] border border-blue-500/40 shadow-[0_0_50px_rgba(59,130,246,0.3)] flex items-center justify-center mb-4 relative">
               <div className="absolute inset-0 rounded-full border border-blue-400/20 animate-spin-slow rotate-180" style={{ animationDuration: '8s' }} />
               <div className="absolute inset-[-10px] rounded-full border border-dashed border-blue-400/20 animate-spin-slow" style={{ animationDuration: '15s' }} />
               <span className="text-blue-400 font-bold z-10 text-lg drop-shadow-md">CORE<br/>AGENT G</span>
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">Agent G — AI ორკესტრაცია</h3>
            <p className="text-white/50 text-xs text-balance">ვორკფლოუს აწყობა და მოდულების შერჩევა</p>
          </motion.div>

          {/* Node 3: Modules */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.4 }}
            className="relative z-10 flex flex-col items-center max-w-[180px] text-center"
          >
            <div className="w-24 h-24 rounded-full bg-[#0a0a1a] border border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.2)] flex items-center justify-center mb-4 relative">
               <div className="w-3 h-3 rounded-full bg-purple-400 absolute top-2 right-4 animate-bounce" />
               <div className="w-2 h-2 rounded-full bg-pink-400 absolute bottom-4 left-3 animate-pulse" />
               <div className="w-4 h-4 rounded-full bg-indigo-400 absolute bottom-3 right-3 animate-pulse" />
               <span className="text-purple-400 font-bold z-10 block">MODULES</span>
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">16 AI მოდული</h3>
            <p className="text-white/50 text-xs">ვიდეო • მუსიკა • ტექსტი • დიზაინი • ავტომაცია</p>
          </motion.div>

          {/* Node 4: Output */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.6 }}
            className="relative z-10 flex flex-col items-center max-w-[180px] text-center"
          >
            <div className="w-20 h-20 rounded-lg bg-[#0a0a1a] border border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.2)] flex items-center justify-center mb-4 rotate-3 transform-gpu">
               <span className="text-orange-400 font-bold z-10 block">OUTPUT</span>
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">საბოლოო შედეგი</h3>
            <p className="text-white/50 text-xs">მზად კონტენტი ან ბიზნეს ფაილი</p>
          </motion.div>

        </div>
      </div>

      <style jsx>{`
        @keyframes slide-right {
          0% { transform: translateX(-100%); opacity: 0; }
          40%, 60% { opacity: 1; }
          100% { transform: translateX(400%); opacity: 0; }
        }
        @keyframes slide-down {
          0% { transform: translateY(-100%); opacity: 0; }
          40%, 60% { opacity: 1; }
          100% { transform: translateY(400%); opacity: 0; }
        }
      `}</style>
    </section>
  );
}