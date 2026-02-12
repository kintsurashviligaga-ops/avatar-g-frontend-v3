'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Bot, Sparkles, Zap, Crown, Workflow } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import Link from 'next/link';

export default function AvatarGAgentPage() {
  return (
    <main className="relative min-h-screen bg-[#05070A]">
      <SpaceBackground />
      
      <div className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500/20 to-cyan-500/20 border border-amber-500/30 rounded-full mb-4">
              <Crown className="w-4 h-4 text-amber-400" />
              <span className="bg-gradient-to-r from-amber-300 to-cyan-300 bg-clip-text text-transparent text-sm font-medium">Premium Agent</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              Meet <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-cyan-400 bg-clip-text text-transparent">Avatar G Agent</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Your personal AI superhero with advanced orchestration and autonomous capabilities
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {[
              { icon: Workflow, title: 'Multi-Agent Orchestration', description: 'Coordinate multiple AI agents for complex workflows' },
              { icon: Zap, title: 'Autonomous Operation', description: 'Execute tasks independently with minimal guidance' },
              { icon: Bot, title: 'Custom Tools', description: 'Integrate with external APIs and services' },
              { icon: Sparkles, title: 'Learning & Adaptation', description: 'Improves performance based on your patterns' },
              { icon: Crown, title: 'Premium Priority', description: 'Fastest processing and highest quality outputs' },
              { icon: Workflow, title: 'Complex Workflows', description: 'Handle multi-step creative and business tasks' },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm hover:border-amber-500/30 transition-colors h-full">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/20 to-cyan-500/20 border border-amber-500/30 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-400">{feature.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card className="max-w-2xl mx-auto p-12 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-cyan-500/10 border-amber-500/30 backdrop-blur-sm text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/30 to-cyan-500/30 border-2 border-amber-500/40 mb-6">
              <Crown className="w-12 h-12 text-amber-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">Premium Feature</h2>
            <p className="text-gray-300 mb-2 text-lg">Requires Premium Plan ($150/month)</p>
            <p className="text-gray-400 mb-8">
              Unlock the Avatar G Agent with 5,000 monthly credits and access to all 13 services with advanced orchestration capabilities.
            </p>
            <Link href="/pricing">
              <Button className="bg-gradient-to-r from-amber-500 via-orange-500 to-cyan-500 hover:from-amber-600 hover:via-orange-600 hover:to-cyan-600 text-white font-semibold px-8 py-6 text-lg">
                <Crown className="w-5 h-5 mr-2" />
                Upgrade to Premium
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </main>
  );
}
