"use client";
import { motion } from 'framer-motion';
import { Construction, Sparkles, ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import SpaceBackground from '@/components/SpaceBackground';

export default function Page() {
  return (
    <div className="min-h-screen bg-[#000208] text-white relative overflow-hidden">
      <SpaceBackground />
      <div className="relative z-10 flex items-center justify-center min-h-screen p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-md">
          <Link href="/">
            <Button variant="outline" size="icon" className="absolute top-6 left-6 border-cyan-500/30 hover:bg-cyan-500/10">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center cyan-glow">
            <Construction className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-glow mb-4">Meeting Assistant</h1>
          <p className="text-cyan-400/70 mb-6">Advanced AI service with identity injection capabilities.</p>
          <Card className="glass-panel p-6 mb-6">
            <div className="flex items-center gap-3 mb-4"><Sparkles className="w-5 h-5 text-cyan-400" /><span className="font-medium">Features:</span></div>
            <ul className="text-sm text-cyan-400/70 space-y-2 text-left">
              <li>✅ AI-powered generation</li>
              <li>✅ Identity injection</li>
              <li>✅ Professional templates</li>
              <li>✅ Export & sharing</li>
            </ul>
          </Card>
          <Link href="/"><Button className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 cyan-glow">Return to Dashboard</Button></Link>
        </motion.div>
      </div>
    </div>
  );
}
