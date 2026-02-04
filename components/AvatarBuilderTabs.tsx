"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { User, Image, Mic, Globe, Sliders, Briefcase, Play, Save, Download, RefreshCw, Sparkles, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AvatarConfig {
  id?: string;
  name: string;
  appearance: {
    style: "realistic" | "anime" | "cartoon" | "3d";
    gender: "male" | "female" | "neutral";
    age: "young" | "adult" | "mature";
    hairColor: string;
    eyeColor: string;
    clothing: string;
  };
  face: {
    usePhoto: boolean;
    photoUrl?: string;
    description: string;
  };
  voice: {
    provider: "elevenlabs" | "azure" | "google";
    voiceId: string;
    pitch: number;
    speed: number;
    previewText: string;
  };
  language: {
    primary: "ka" | "en" | "ru";
    secondary?: string;
    accent: "neutral" | "formal" | "casual";
  };
  personality: {
    formality: number; // 0-100
    energy: number; // 0-100
    humor: number; // 0-100
    empathy: number; // 0-100
    description: string;
  };
  useCases: string[];
  createdAt?: string;
}

const DEFAULT_AVATAR: AvatarConfig = {
  name: "My Avatar",
  appearance: {
    style: "realistic",
    gender: "neutral",
    age: "adult",
    hairColor: "#2D3748",
    eyeColor: "#3182CE",
    clothing: "Business casual"
  },
  face: {
    usePhoto: false,
    description: "Professional appearance"
  },
  voice: {
    provider: "elevenlabs",
    voiceId: "default",
    pitch: 50,
    speed: 50,
    previewText: "გამარჯობა, მე ვარ თქვენი ახალი ავატარი."
  },
  language: {
    primary: "ka",
    accent: "neutral"
  },
  personality: {
    formality: 50,
    energy: 70,
    humor: 40,
    empathy: 80,
    description: "Professional yet friendly assistant"
  },
  useCases: ["support"]
};

const TABS = [
  { id: "identity", icon: User, labelKa: "იდენტიტეტი", labelEn: "Identity" },
  { id: "face", icon: Image, labelKa: "სახე", labelEn: "Face" },
  { id: "voice", icon: Mic, labelKa: "ხმა", labelEn: "Voice" },
  { id: "language", icon: Globe, labelKa: "ენა", labelEn: "Language" },
  { id: "personality", icon: Sliders, labelKa: "პერსონალობა", labelEn: "Personality" },
  { id: "usecases", icon: Briefcase, labelKa: "გამოყენება", labelEn: "Use Cases" },
  { id: "preview", icon: Play, labelKa: "გადახედვა", labelEn: "Preview" },
  { id: "export", icon: Download, labelKa: "ექსპორტი", labelEn: "Export" }
];

export default function AvatarBuilderTabs() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState("identity");
  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [savedAvatars, setSavedAvatars] = useState<AvatarConfig[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");

  // Load saved avatars
  useEffect(() => {
    const saved = localStorage.getItem("ag.avatars");
    if (saved) setSavedAvatars(JSON.parse(saved));
  }, []);

  const updateAvatar = (path: string, value: any) => {
    setAvatar(prev => {
      const keys = path.split(".");
      const next = { ...prev };
      let current: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const saveAvatar = () => {
    const newAvatar = { ...avatar, id: Date.now().toString(), createdAt: new Date().toISOString() };
    const updated = [newAvatar, ...savedAvatars].slice(0, 10);
    setSavedAvatars(updated);
    localStorage.setItem("ag.avatars", JSON.stringify(updated));
    alert(language === "ka" ? "ავატარი შენახულია!" : "Avatar saved!");
  };

  const loadAvatar = (saved: AvatarConfig) => {
    setAvatar(saved);
    setActiveTab("identity");
  };

  const generateAvatar = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/avatar-builder/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Generate avatar: ${avatar.name}. Style: ${avatar.appearance.style}. ${avatar.face.description}`,
          params: avatar,
          language
        })
      });
      const data = await res.json();
      if (data.success) {
        updateAvatar("face.photoUrl", data.output.metadata?.avatarImage || "/api/placeholder/400/400");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const exportAvatar = (format: "json" | "png" | "link") => {
    if (format === "json") {
      const blob = new Blob([JSON.stringify(avatar, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${avatar.name.replace(/\s+/g, "_")}.json`;
      a.click();
    } else if (format === "link") {
      const encoded = btoa(JSON.stringify(avatar));
      navigator.clipboard.writeText(`${window.location.origin}/avatar-builder?load=${encoded}`);
      alert(language === "ka" ? "ლინკი დაკოპირებულია!" : "Link copied!");
    }
  };

  const playVoicePreview = () => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(avatar.voice.previewText);
      utterance.lang = avatar.language.primary === "ka" ? "ka-GE" : "en-US";
      utterance.pitch = avatar.voice.pitch / 50;
      utterance.rate = 0.5 + (avatar.voice.speed / 100);
      window.speechSynthesis.speak(utterance);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "identity":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {language === "ka" ? "სახელი" : "Name"}
              </label>
              <input
                type="text"
                value={avatar.name}
                onChange={(e) => updateAvatar("name", e.target.value)}
                className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  {language === "ka" ? "სტილი" : "Style"}
                </label>
                <select
                  value={avatar.appearance.style}
                  onChange={(e) => updateAvatar("appearance.style", e.target.value)}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
                >
                  <option value="realistic">{language === "ka" ? "რეალისტური" : "Realistic"}</option>
                  <option value="anime">Anime</option>
                  <option value="cartoon">{language === "ka" ? "მულტფილმი" : "Cartoon"}</option>
                  <option value="3d">3D</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  {language === "ka" ? "სქესი" : "Gender"}
                </label>
                <select
                  value={avatar.appearance.gender}
                  onChange={(e) => updateAvatar("appearance.gender", e.target.value)}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
                >
                  <option value="male">{language === "ka" ? "მამრობითი" : "Male"}</option>
                  <option value="female">{language === "ka" ? "მდედრობითი" : "Female"}</option>
                  <option value="neutral">{language === "ka" ? "ნეიტრალური" : "Neutral"}</option>
                </select>
              </div>
            </div>
          </div>
        );

      case "face":
        return (
          <div className="space-y-4">
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => updateAvatar("face.usePhoto", false)}
                className={`flex-1 py-2 rounded-lg border ${!avatar.face.usePhoto ? "bg-cyan-500/20 border-cyan-500" : "border-slate-700"}`}
              >
                {language === "ka" ? "AI გენერაცია" : "AI Generate"}
              </button>
              <button
                onClick={() => updateAvatar("face.usePhoto", true)}
                className={`flex-1 py-2 rounded-lg border ${avatar.face.usePhoto ? "bg-cyan-500/20 border-cyan-500" : "border-slate-700"}`}
              >
                {language === "ka" ? "ფოტოს ატვირთვა" : "Upload Photo"}
              </button>
            </div>
            
            {!avatar.face.usePhoto ? (
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  {language === "ka" ? "აღწერა" : "Description"}
                </label>
                <textarea
                  value={avatar.face.description}
                  onChange={(e) => updateAvatar("face.description", e.target.value)}
                  rows={3}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
                  placeholder={language === "ka" ? "აღწერეთ სახის მახასიათებლები..." : "Describe facial features..."}
                />
                <button
                  onClick={generateAvatar}
                  disabled={isGenerating}
                  className="mt-2 w-full py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 rounded-lg flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {isGenerating 
                    ? (language === "ka" ? "იგენერირება..." : "Generating...") 
                    : (language === "ka" ? "გენერაცია" : "Generate")}
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-cyan-500/30 rounded-lg p-8 text-center">
                <p className="text-slate-400">{language === "ka" ? "ფოტოს ატვირთვა მალე ხელმისაწვდომი იქნება" : "Photo upload coming soon"}</p>
              </div>
            )}
            
            {avatar.face.photoUrl && (
              <div className="mt-4">
                <img src={avatar.face.photoUrl} alt="Avatar" className="w-32 h-32 rounded-lg object-cover mx-auto" />
              </div>
            )}
          </div>
        );

      case "voice":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {language === "ka" ? "პროვაიდერი" : "Provider"}
              </label>
              <select
                value={avatar.voice.provider}
                onChange={(e) => updateAvatar("voice.provider", e.target.value)}
                className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
              >
                <option value="elevenlabs">ElevenLabs</option>
                <option value="azure">Azure Speech</option>
                <option value="google">Google Cloud</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {language === "ka" ? "ტონი" : "Pitch"}: {avatar.voice.pitch}
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={avatar.voice.pitch}
                onChange={(e) => updateAvatar("voice.pitch", parseInt(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {language === "ka" ? "სიჩქარე" : "Speed"}: {avatar.voice.speed}
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={avatar.voice.speed}
                onChange={(e) => updateAvatar("voice.speed", parseInt(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {language === "ka" ? "შესამოწმებელი ტექსტი" : "Preview Text"}
              </label>
              <textarea
                value={avatar.voice.previewText}
                onChange={(e) => updateAvatar("voice.previewText", e.target.value)}
                rows={2}
                className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
              />
            </div>
            
            <button
              onClick={playVoicePreview}
              className="w-full py-2 bg-cyan-500/20 border border-cyan-500/50 hover:bg-cyan-500/30 rounded-lg flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {language === "ka" ? "მოსმენა" : "Play Preview"}
            </button>
          </div>
        );

      case "language":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {language === "ka" ? "ძირითადი ენა" : "Primary Language"}
              </label>
              <select
                value={avatar.language.primary}
                onChange={(e) => updateAvatar("language.primary", e.target.value)}
                className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
              >
                <option value="ka">ქართული</option>
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {language === "ka" ? "აქცენტი" : "Accent"}
              </label>
              <select
                value={avatar.language.accent}
                onChange={(e) => updateAvatar("language.accent", e.target.value)}
                className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
              >
                <option value="neutral">{language === "ka" ? "ნეიტრალური" : "Neutral"}</option>
                <option value="formal">{language === "ka" ? "ფორმალური" : "Formal"}</option>
                <option value="casual">{language === "ka" ? "არაფორმალური" : "Casual"}</option>
              </select>
            </div>
          </div>
        );

      case "personality":
        return (
          <div className="space-y-4">
            {[
              { key: "formality", labelKa: "ფორმალურობა", labelEn: "Formality" },
              { key: "energy", labelKa: "ენერგია", labelEn: "Energy" },
              { key: "humor", labelKa: "იუმორი", labelEn: "Humor" },
              { key: "empathy", labelKa: "ემპათია", labelEn: "Empathy" }
            ].map((trait) => (
              <div key={trait.key}>
                <label className="block text-sm text-slate-400 mb-1">
                  {language === "ka" ? trait.labelKa : trait.labelEn}: 
                  {(avatar.personality as any)[trait.key]}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={(avatar.personality as any)[trait.key]}
                  onChange={(e) => updateAvatar(`personality.${trait.key}`, parseInt(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>
            ))}
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {language === "ka" ? "აღწერა" : "Description"}
              </label>
              <textarea
                value={avatar.personality.description}
                onChange={(e) => updateAvatar("personality.description", e.target.value)}
                rows={3}
                className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
              />
            </div>
          </div>
        );

      case "usecases":
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-400 mb-4">
              {language === "ka" ? "აირჩიეთ გამოყენების სცენარები:" : "Select use case scenarios:"}
            </p>
            {[
              { id: "sales", labelKa: "გაყიდვები", labelEn: "Sales" },
              { id: "support", labelKa: "მხარდაჭერა", labelEn: "Support" },
              { id: "content", labelKa: "კონტენტი", labelEn: "Content" },
              { id: "tutor", labelKa: "მასწავლებელი", labelEn: "Tutor" },
              { id: "companion", labelKa: "თანამგზავრი", labelEn: "Companion" },
              { id: "presenter", labelKa: "წამყვანი", labelEn: "Presenter" }
            ].map((useCase) => (
              <label key={useCase.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={avatar.useCases.includes(useCase.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateAvatar("useCases", [...avatar.useCases, useCase.id]);
                    } else {
                      updateAvatar("useCases", avatar.useCases.filter(u => u !== useCase.id));
                    }
                  }}
                  className="w-4 h-4 accent-cyan-500"
                />
                <span className="text-slate-200">{language === "ka" ? useCase.labelKa : useCase.labelEn}</span>
              </label>
            ))}
          </div>
        );

      case "preview":
        return (
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-lg p-4 h-64 overflow-y-auto">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-400 mb-1">{avatar.name}</p>
                  <p className="text-slate-200">
                    {language === "ka" 
                      ? `გამარჯობა! მე ვარ ${avatar.name}. ${avatar.personality.description}`
                      : `Hello! I'm ${avatar.name}. ${avatar.personality.description}`}
                  </p>
                </div>
              </div>
              
              {previewMessage && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex-1 bg-cyan-500/10 rounded-lg p-3">
                    <p className="text-slate-200">{previewMessage}</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={previewMessage}
                onChange={(e) => setPreviewMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && setPreviewMessage("")}
                placeholder={language === "ka" ? "ჩაწერეთ შეტყობინება..." : "Type a message..."}
                className="flex-1 bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-slate-200"
              />
              <button
                onClick={() => setPreviewMessage("")}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        );

      case "export":
        return (
          <div className="space-y-4">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <h4 className="font-medium text-slate-200 mb-2">{avatar.name}</h4>
              <p className="text-sm text-slate-400 mb-4">
                {language === "ka" ? "შექმნილია:" : "Created:"} {new Date(avatar.createdAt || Date.now()).toLocaleDateString()}
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {avatar.useCases.map(u => (
                  <span key={u} className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">
                    {u}
                  </span>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => exportAvatar("json")}
                className="py-2 bg-cyan-500/20 border border-cyan-500/50 hover:bg-cyan-500/30 rounded-lg text-sm"
              >
                JSON
              </button>
              <button
                onClick={() => exportAvatar("png")}
                className="py-2 bg-cyan-500/20 border border-cyan-500/50 hover:bg-cyan-500/30 rounded-lg text-sm"
              >
                PNG
              </button>
              <button
                onClick={() => exportAvatar("link")}
                className="py-2 bg-cyan-500/20 border border-cyan-500/50 hover:bg-cyan-500/30 rounded-lg text-sm"
              >
                {language === "ka" ? "ლინკი" : "Link"}
              </button>
            </div>
            
            <button
              onClick={saveAvatar}
              className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Save className="w-4 h-4" />
              {language === "ka" ? "შენახვა ბიბლიოთეკაში" : "Save to Library"}
            </button>
            
            {savedAvatars.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm text-slate-400 mb-2">
                  {language === "ka" ? "შენახული ავატარები:" : "Saved Avatars:"}
                </h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {savedAvatars.map((saved) => (
                    <button
                      key={saved.id}
                      onClick={() => loadAvatar(saved)}
                      className="w-full text-left p-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-slate-300 flex items-center justify-between"
                    >
                      <span>{saved.name}</span>
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-cyan-500/20 mb-4 scrollbar-hide">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-slate-400 hover:text-slate-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {language === "ka" ? tab.labelKa : tab.labelEn}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
