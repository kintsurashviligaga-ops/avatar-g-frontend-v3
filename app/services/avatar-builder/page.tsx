"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Camera, Shield, Sparkles, Mic, Palette, Shirt, Eye, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ServicePageShell } from '@/components/ServicePageShell';

type CreationStep = 'welcome' | 'face-input' | 'liveness' | 'processing' | 'voice-clone' | 'style-adjust' | 'fashion' | 'preview';

export default function AvatarBuilderPage() {
  const [currentStep, setCurrentStep] = useState<CreationStep>('welcome');

  const nextStep = () => {
    const steps: CreationStep[] = ['welcome', 'face-input', 'liveness', 'processing', 'voice-clone', 'style-adjust', 'fashion', 'preview'];
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) setCurrentStep(steps[idx + 1]);
  };

  const prevStep = () => {
    const steps: CreationStep[] = ['welcome', 'face-input', 'liveness', 'processing', 'voice-clone', 'style-adjust', 'fashion', 'preview'];
    const idx = steps.indexOf(currentStep);
    if (idx > 0) setCurrentStep(steps[idx - 1]);
  };

  const stepData = [
    { id: 'welcome', icon: User, title: 'Welcome' },
    { id: 'face-input', icon: Camera, title: 'Face Input' },
    { id: 'liveness', icon: Shield, title: 'Verify' },
    { id: 'processing', icon: Sparkles, title: 'Processing' },
    { id: 'voice-clone', icon: Mic, title: 'Voice' },
    { id: 'style-adjust', icon: Palette, title: 'Style' },
    { id: 'fashion', icon: Shirt, title: 'Fashion' },
    { id: 'preview', icon: Eye, title: 'Preview' },
  ] as const;

  const currentStepData = stepData.find(s => s.id === currentStep) || stepData[0];
  const CurrentIcon = currentStepData.icon;
  const currentIdx = stepData.findIndex(s => s.id === currentStep);

  return (
    <ServicePageShell
      title="Avatar Builder"
      description="Create your digital twin with AI"
      icon={<User size={24} />}
      gradient="from-cyan-400 to-blue-500"
    >
      <div className="min-h-screen bg-[#0A0F1C] text-white">
        {currentStep !== 'welcome' && (
          <div className="py-4 px-4 bg-black/20 border-b border-white/5">
            <div className="max-w-4xl mx-auto flex justify-between items-center">
              {stepData.map((step, idx) => {
                const isActive = idx === currentIdx;
                const isCompleted = idx < currentIdx;
                return (
                  <div key={step.id} className={`w-2 h-2 rounded-full ${isActive ? 'bg-cyan-400' : isCompleted ? 'bg-green-400' : 'bg-gray-700'}`} />
                );
              })}
            </div>
          </div>
        )}

        <main className="pt-8 pb-12 px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="text-center py-12"
            >
              <CurrentIcon size={64} className="mx-auto mb-6 text-cyan-400" />
              <h2 className="text-3xl font-bold mb-4">{currentStepData.title}</h2>
              <p className="text-gray-400 mb-8">Step {currentIdx + 1} of {stepData.length}</p>
              
              <div className="flex gap-4 justify-center">
                {currentStep !== 'welcome' && (
                  <Button variant="outline" onClick={prevStep}>Back</Button>
                )}
                <Button onClick={nextStep} className="bg-gradient-to-r from-cyan-400 to-blue-500">
                  {currentStep === 'preview' ? 'Finish' : 'Continue'}
                  <ChevronRight size={18} className="ml-1" />
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </ServicePageShell>
  );
}
