"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Sparkles, Zap, User, Shield, Rocket, X } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const SpaceBackground = dynamic(
  () => import("@/components/SpaceSingularityBackground"),
  { ssr: false, loading: () => <div className="fixed inset-0 bg-[#05070A]" /> }
);

// ONBOARDING STEPS - EXACT 5 STEPS
const steps = [
  {
    id: 1,
    titleKa: "კეთილი იყოს თქვენი მობრძანება",
    titleEn: "Welcome",
    subtitleKa: "Avatar G - თქვენი AI სამყარო",
    subtitleEn: "Avatar G - Your AI Universe",
    descriptionKa: "თქვენ შედიხართ ახალ თაობის AI სამუშაო სივრცეში, სადაც ყველა ინსტრუმენტი ერთ ადგილასაა.",
    descriptionEn: "You are entering a new generation AI workspace where all tools are in one place.",
    icon: Sparkles,
    visual: "space",
  },
  {
    id: 2,
    titleKa: "გაიცანით Agent G",
    titleEn: "Meet Agent G",
    subtitleKa: "თქვენი პერსონალური ასისტენტი",
    subtitleEn: "Your Personal Assistant",
    descriptionKa: "Agent G არის თქვენი AI კონსიერჟი. იგი გესაუბრებათ, გეხმარებათ და გახსენდებათ თქვენს სურვილებს.",
    descriptionEn: "Agent G is your AI concierge. It talks to you, helps you, and remembers your preferences.",
    icon: User,
    visual: "agent",
  },
  {
    id: 3,
    titleKa: "13 სერვისი - ერთ სივრცეში",
    titleEn: "13 Services - One Space",
    subtitleKa: "ყველაფერი რაც შექმნას სჭირდება",
    subtitleEn: "Everything creation needs",
    descriptionKa: "ტექსტიდან ვიდეომდე, კოდიდან მუსიკამდე - ყველა AI ინსტრუმენტი ერთ მთლიან სისტემაში.",
    descriptionEn: "From text to video, code to music - all AI tools in one unified system.",
    icon: Zap,
    visual: "services",
  },
  {
    id: 4,
    titleKa: "კონტროლი და უსაფრთხოება",
    titleEn: "Control & Security",
    subtitleKa: "თქვენი მონაცემები, თქვენი კონტროლი",
    subtitleEn: "Your data, your control",
    descriptionKa: "Local-first მეხსიერება. თქვენი პროექტები არასოდეს არ ქრება. Privacy by design.",
    descriptionEn: "Local-first memory. Your projects never disappear. Privacy by design.",
    icon: Shield,
    visual: "security",
  },
  {
    id: 5,
    titleKa: "მზად ხართ დასაწყობად?",
    titleEn: "Ready to Begin?",
    subtitleKa: "თქვენი შემოქმედებითი მოგზაურობა იწყება",
    subtitleEn: "Your creative journey begins",
    descriptionKa: "დაიწყეთ Agent G-თან ერთად. ყველა სერვისი თქვენს disposal-შია.",
    descriptionEn: "Start with Agent G. All services at your disposal.",
    icon: Rocket,
    visual: "launch",
  },
];

// Agent G Orb for Onboarding
function OnboardingOrb({ step }: { step: number }) {
  const getOrbStyle = () => {
    switch (step) {
      case 1: return "from-cyan-400 to-blue-600";
      case 2: return "from-cyan-300 to-cyan-500";
      case 3: return "from-violet-400 to-purple-600";
      case 4: return "from-emerald-400 to-teal-600";
      case 5: return "from-amber-400 to-yellow-600";
      default: return "from-cyan-400 to-blue-600";
    }
  };

  return (
    <div className="relative w-32 h-32 mx-auto mb-8">
      {/* Outer glow */}
      <motion.div
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3]
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className={`absolute inset-0 rounded-full bg-gradient-to-br ${getOrbStyle()} blur-2xl`}
      />
      
      {/* Core orb */}
      <motion.div
        animate={{ 
          scale: [1, 1.05, 1],
          rotate: [0, 5, -5, 0]
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className={`absolute inset-4 rounded-full bg-gradient-to-br ${getOrbStyle()} shadow-2xl flex items-center justify-center`}
      >
        <Sparkles className="w-12 h-12 text-white" strokeWidth={1.5} />
      </motion.div>
      
      {/* Ring */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute inset-2 rounded-full border border-dashed border-white/30"
      />
    </div>
  );
}

// Services Visual
function ServicesVisual() {
  const services = [
    { color: "bg-amber-500", icon: "👑" },
    { color: "bg-cyan-500", icon: "👤" },
    { color: "bg-emerald-500", icon: "🎵" },
    { color: "bg-violet-500", icon: "🎨" },
    { color: "bg-pink-500", icon: "🎬" },
  ];

  return (
    <div className="flex justify-center gap-3 mb-8">
      {services.map((service, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          whileHover={{ scale: 1.1, y: -5 }}
          className={`w-14 h-14 rounded-2xl ${service.color} flex items-center justify-center text-2xl shadow-lg`}
        >
          {service.icon}
        </motion.div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Check if already onboarded
  useEffect(() => {
    const hasOnboarded = localStorage.getItem("avatar-g-onboarded");
    if (hasOnboarded === "true") {
      setIsCompleted(true);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
    } else {
      completeOnboarding();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
    }
  };

  const completeOnboarding = () => {
    localStorage.setItem("avatar-g-onboarded", "true");
    setIsCompleted(true);
  };

  const skipOnboarding = () => {
    localStorage.setItem("avatar-g-onboarded", "true");
    setIsCompleted(true);
  };

  if (isCompleted) {
    return (
      <div className="relative min-h-screen bg-[#05070A] flex items-center justify-center">
        <SpaceBackground />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 text-center px-4"
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/50"
          >
            <Rocket className="w-12 h-12 text-white" />
          </motion.div>
          <h2 className="text-3xl font-bold text-white mb-2">მზად ხართ! / Ready!</h2>
          <p className="text-gray-400 mb-8">თქვენი AI სამყარო გელოდებათ / Your AI world awaits</p>
          <Link href="/workspace">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/30"
            >
              სამუშაო სივრცეში შესვლა / Enter Workspace
            </motion.button>
          </Link>
        </motion.div>
      </div>
    );
  }

  const step = steps[currentStep];
  if (!step) {
    return null;
  }
  const StepIcon = step.icon;

  return (
    <div className="relative min-h-screen bg-[#05070A] overflow-hidden">
      <SpaceBackground />

      {/* Skip Button - Top Right */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={skipOnboarding}
        className="fixed top-4 right-4 z-50 p-2 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
      >
        <X className="w-5 h-5" />
      </motion.button>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
        {/* Progress Dots */}
        <div className="fixed top-8 left-1/2 -translate-x-1/2 flex gap-2">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === currentStep ? "w-8 bg-cyan-400" : i < currentStep ? "bg-cyan-400/50" : "bg-white/20"
              }`}
            />
          ))}
        </div>

        {/* Step Counter */}
        <div className="fixed top-8 right-8 text-sm text-gray-500">
          {currentStep + 1} / {steps.length}
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="max-w-2xl w-full text-center"
          >
            {/* Visual */}
            {step.visual === "services" ? (
              <ServicesVisual />
            ) : (
              <OnboardingOrb step={step.id} />
            )}

            {/* Icon Badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm mb-6"
            >
              <StepIcon className="w-4 h-4" />
              <span>თავი {step.id} / Step {step.id}</span>
            </motion.div>

            {/* Title - BILINGUAL */}
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              {step.titleKa}
            </h1>
            <h2 className="text-xl text-gray-400 mb-4">
              {step.titleEn}
            </h2>

            {/* Subtitle */}
            <p className="text-lg text-cyan-400 mb-6">
              {step.subtitleKa}
            </p>
            <p className="text-sm text-gray-500 mb-8">
              {step.subtitleEn}
            </p>

            {/* Description */}
            <p className="text-gray-300 leading-relaxed mb-4 max-w-lg mx-auto">
              {step.descriptionKa}
            </p>
            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              {step.descriptionEn}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="fixed bottom-12 left-0 right-0 px-4">
          <div className="max-w-md mx-auto flex gap-4">
            {currentStep > 0 && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handlePrev}
                className="flex-1 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-medium flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                უკან / Back
              </motion.button>
            )}
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleNext}
              className="flex-1 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-2"
            >
              {currentStep === steps.length - 1 ? (
                <>დაწყება / Start <Rocket className="w-5 h-5" /></>
              ) : (
                <>შემდეგ / Next <ChevronRight className="w-5 h-5" /></>
              )}
            </motion.button>
          </div>

          {/* Skip Text */}
          <button
            onClick={skipOnboarding}
            className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            გამოტოვება / Skip onboarding
          </button>
        </div>
      </div>
    </div>
  );
}
