"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  Globe, 
  Brain, 
  Shield, 
  PlayCircle, 
  ChevronRight,
  Check,
  X
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const SpaceBackground = dynamic(
  () => import("@/components/SpaceSingularityBackground"),
  { ssr: false, loading: () => <div className="fixed inset-0 bg-[#05070A]" /> }
);

type Language = "ka" | "en";

interface SettingSection {
  id: string;
  titleKa: string;
  titleEn: string;
  icon: React.ElementType;
  items: SettingItem[];
}

interface SettingItem {
  id: string;
  labelKa: string;
  labelEn: string;
  descriptionKa?: string;
  descriptionEn?: string;
  type: "toggle" | "select" | "button";
  value?: boolean | string;
  options?: { value: string; labelKa: string; labelEn: string }[];
  action?: () => void;
}

export default function SettingsPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("ka");
  const [settings, setSettings] = useState({
    projectMemory: true,
    preferenceMemory: true,
    temporaryChats: false,
    localMemory: true,
    cloudSync: false,
    aiLearning: false,
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleReplayOnboarding = () => {
    localStorage.removeItem("avatar-g-onboarded");
    router.push("/onboarding");
  };

  const settingSections: SettingSection[] = [
    {
      id: "language",
      titleKa: "ენა",
      titleEn: "Language",
      icon: Globe,
      items: [
        {
          id: "lang-select",
          labelKa: "ინტერფეისის ენა",
          labelEn: "Interface Language",
          type: "select",
          value: language,
          options: [
            { value: "ka", labelKa: "ქართული", labelEn: "Georgian" },
            { value: "en", labelKa: "English", labelEn: "English" },
          ],
        },
      ],
    },
    {
      id: "memory",
      titleKa: "მეხსიერება",
      titleEn: "Memory",
      icon: Brain,
      items: [
        {
          id: "project-memory",
          labelKa: "პროექტების მეხსიერება",
          labelEn: "Project Memory",
          descriptionKa: "Agent G იმახსოვრებს თქვენს პროექტებს",
          descriptionEn: "Agent G remembers your projects",
          type: "toggle",
          value: settings.projectMemory,
        },
        {
          id: "preference-memory",
          labelKa: "პრეფერენციების მეხსიერება",
          labelEn: "Preference Memory",
          descriptionKa: "Agent G იმახსოვრებს თქვენს სტილს",
          descriptionEn: "Agent G remembers your style",
          type: "toggle",
          value: settings.preferenceMemory,
        },
        {
          id: "temporary-chats",
          labelKa: "დროებითი ჩათები",
          labelEn: "Temporary Chats",
          descriptionKa: "არ შეინახოს ისტორია",
          descriptionEn: "Don't save history",
          type: "toggle",
          value: settings.temporaryChats,
        },
        {
          id: "view-memory",
          labelKa: "მეხსიერების ნახვა",
          labelEn: "View Memory",
          type: "button",
          action: () => router.push("/memory"),
        },
      ],
    },
    {
      id: "privacy",
      titleKa: "კონფიდენციალურობა",
      titleEn: "Privacy",
      icon: Shield,
      items: [
        {
          id: "local-memory",
          labelKa: "ლოკალური მეხსიერება (Default ON)",
          labelEn: "Local Memory (Default ON)",
          type: "toggle",
          value: settings.localMemory,
        },
        {
          id: "cloud-sync",
          labelKa: "ღრუბლის სინქრონიზაცია (Optional OFF)",
          labelEn: "Cloud Sync (Optional OFF)",
          type: "toggle",
          value: settings.cloudSync,
        },
        {
          id: "ai-learning",
          labelKa: "AI სწავლა (OFF)",
          labelEn: "AI Learning (OFF)",
          descriptionKa: "თქვენი მონაცემები არ გამოიყენება სწავლისთვის",
          descriptionEn: "Your data is not used for training",
          type: "toggle",
          value: settings.aiLearning,
        },
      ],
    },
    {
      id: "onboarding",
      titleKa: "გაცნობა",
      titleEn: "Onboarding",
      icon: PlayCircle,
      items: [
        {
          id: "replay-tour",
          labelKa: "ტურის ხელახლა ჩვენება",
          labelEn: "Replay Tour",
          type: "button",
          action: handleReplayOnboarding,
        },
      ],
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#05070A] overflow-hidden">
      <SpaceBackground />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-[rgba(5,7,10,0.9)] backdrop-blur-xl border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 h-full flex items-center justify-between">
          <Link href="/workspace">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← უკან / Back
            </motion.button>
          </Link>
          <h1 className="text-lg font-bold text-white">პარამეტრები / Settings</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 pt-20 pb-8 px-4 max-w-3xl mx-auto">
        {settingSections.map((section, sectionIndex) => (
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sectionIndex * 0.1 }}
            className="mb-6"
          >
            {/* Section Header */}
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <section.icon className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{section.titleKa}</h2>
                <p className="text-sm text-gray-500">{section.titleEn}</p>
              </div>
            </div>

            {/* Section Items */}
            <div className="rounded-2xl bg-[rgba(10,20,35,0.5)] backdrop-blur-md border border-white/10 overflow-hidden">
              {section.items.map((item, itemIndex) => (
                <div
                  key={item.id}
                  className={`p-4 ${itemIndex !== section.items.length - 1 ? "border-b border-white/5" : ""}`}
                >
                  {item.type === "toggle" && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white mb-1">{item.labelKa}</p>
                        <p className="text-xs text-gray-500">{item.labelEn}</p>
                        {(item.descriptionKa || item.descriptionEn) && (
                          <p className="text-xs text-gray-600 mt-1">
                            {item.descriptionKa} / {item.descriptionEn}
                          </p>
                        )}
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleSetting(item.id as keyof typeof settings)}
                        className={`w-12 h-6 rounded-full p-1 transition-colors ${
                          item.value ? "bg-cyan-500" : "bg-white/20"
                        }`}
                      >
                        <motion.div
                          animate={{ x: item.value ? 24 : 0 }}
                          className="w-4 h-4 rounded-full bg-white"
                        />
                      </motion.button>
                    </div>
                  )}

                  {item.type === "select" && (
                    <div>
                      <p className="text-sm font-medium text-white mb-1">{item.labelKa}</p>
                      <p className="text-xs text-gray-500 mb-3">{item.labelEn}</p>
                      <div className="flex gap-2">
                        {item.options?.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setLanguage(opt.value as Language)}
                            className={`px-4 py-2 rounded-xl text-sm transition-colors ${
                              language === opt.value
                                ? "bg-cyan-500 text-white"
                                : "bg-white/5 text-gray-400 hover:bg-white/10"
                            }`}
                          >
                            {language === "ka" ? opt.labelKa : opt.labelEn}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.type === "button" && (
                    <button
                      onClick={item.action}
                      className="w-full flex items-center justify-between group"
                    >
                      <div>
                        <p className="text-sm font-medium text-white mb-1">{item.labelKa}</p>
                        <p className="text-xs text-gray-500">{item.labelEn}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-cyan-400 transition-colors" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Version Info */}
        <div className="text-center text-xs text-gray-600 mt-8">
          Avatar G v1.0.0 • Premium Ready
        </div>
      </main>
    </div>
  );
}
