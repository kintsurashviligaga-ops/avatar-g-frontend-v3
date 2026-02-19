'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Gamepad2 } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';

export default function GameCreatorPage() {
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
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/30 rounded-full mb-4">
              <Gamepad2 className="w-4 h-4 text-violet-400" />
              <span className="text-violet-300 text-sm font-medium">თამაშების შემქმნელი</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              შექმენი{' '}
              <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
                ინტერაქტიული თამაშები
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              AI-ით თამაშის დიზაინი, ასეტების გენერაცია და პროტოტიპირება
            </p>
          </motion.div>

          <Card className="max-w-2xl mx-auto p-12 bg-white/5 border-white/10 backdrop-blur-sm text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-purple500/20 border border-violet-500/30 mb-6">
              <Gamepad2 className="w-10 h-10 text-violet-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">მალე</h2>
            <p className="text-gray-400 mb-6">
              ვქმნით თამაშების შექმნის პლატფორმას AI-ით გაძლიერებული დიზაინის ინსტრუმენტებით,
              ასეტების გენერაციით და პროტოტიპირებით.
            </p>
            <Button variant="outline" className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10">
              მოლოდინის სიაში შესვლა
            </Button>
          </Card>
        </div>
      </div>
    </main>
  );
}
