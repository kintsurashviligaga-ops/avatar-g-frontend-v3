"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Home, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ServicePageShellProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient?: string;
  children: React.ReactNode;
}

export function ServicePageShell({ 
  title, 
  description, 
  icon, 
  gradient = "from-cyan-400 to-blue-500",
  children 
}: ServicePageShellProps) {
  return (
    <div className="min-h-screen bg-[#0A0F1C] text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0A0F1C]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/">
                <motion.div 
                  whileHover={{ scale: 1.05 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center cursor-pointer"
                >
                  <Sparkles size={20} className="text-white" />
                </motion.div>
              </Link>
              <div>
                <h1 className="font-bold text-lg">Avatar G</h1>
                <p className="text-xs text-gray-500">{title}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/services">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  <ChevronLeft size={16} className="mr-1" /> Services
                </Button>
              </Link>
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  <Home size={16} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="pt-24 pb-8 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-2xl`}
          >
            {icon}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-r from-white via-cyan-200 to-blue-200 bg-clip-text text-transparent"
          >
            {title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 text-lg"
          >
            {description}
          </motion.p>
        </div>
      </div>

      {/* Main Content */}
      <main className="pb-12 px-4">
        {children}
      </main>
    </div>
  );
}
