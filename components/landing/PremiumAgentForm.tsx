'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Sparkles, Zap, Brain, Shield } from 'lucide-react';

interface PremiumAgentFormProps {
  isOpen: boolean;
  onClose: () => void;
}

const premiumFeatures = [
  {
    icon: Brain,
    title: 'Advanced AI Models',
    description: 'Access to latest GPT-4 Turbo, Claude 3.5 Sonnet, and proprietary models'
  },
  {
    icon: Zap,
    title: 'Priority Processing',
    description: '60% faster generation with guaranteed GPU allocation'
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Private cloud storage with SOC 2 Type II compliance'
  },
  {
    icon: Sparkles,
    title: 'Unlimited Credits',
    description: 'Unlimited generation across all studios and models'
  }
];

export default function PremiumAgentForm({ isOpen, onClose }: PremiumAgentFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Simulate submission
      await new Promise(resolve => setTimeout(resolve, 2000));
      alert('Premium Plan Activated! Welcome to Avatar G Premium.');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <Card className="w-full max-w-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-cyan-500/20 shadow-2xl">
              {/* Header with Premium Agent branding */}
              <div className="relative p-6 border-b border-cyan-500/10 flex items-start justify-between bg-gradient-to-r from-cyan-500/5 to-orange-500/5">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-transparent to-orange-500/10 opacity-50 rounded-t-lg pointer-events-none" />
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2 relative z-10">
                    <Sparkles className="w-6 h-6 text-cyan-400 drop-shadow-lg" />
                    Premium Agent
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">Enterprise-level AI superpowers</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {premiumFeatures.map((feature, idx) => {
                    const Icon = feature.icon;
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="p-4 rounded-lg bg-white/5 border border-cyan-500/10 hover:border-cyan-500/30 transition-all"
                      >
                        <Icon className="w-5 h-5 text-cyan-400 mb-2" />
                        <h3 className="font-semibold text-sm">{feature.title}</h3>
                        <p className="text-xs text-gray-400 mt-1">{feature.description}</p>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Pricing */}
                <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-lg p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">$99</span>
                    <span className="text-gray-400">/month or $999/year</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">Billed monthly. Cancel anytime.</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Name</label>
                      <input
                        type="text"
                        placeholder="Full name"
                        className="w-full px-3 py-2 bg-white/5 border border-cyan-500/20 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Email</label>
                      <input
                        type="email"
                        placeholder="your@email.com"
                        className="w-full px-3 py-2 bg-white/5 border border-cyan-500/20 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4" defaultChecked />
                      <span className="text-sm text-gray-300">
                        I agree to the Premium Terms and will receive product updates
                      </span>
                    </label>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      className="flex-1"
                    >
                      Not Now
                    </Button>
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold"
                    >
                      {isLoading ? 'Processing...' : 'Upgrade to Premium'}
                    </Button>
                  </div>
                </form>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
