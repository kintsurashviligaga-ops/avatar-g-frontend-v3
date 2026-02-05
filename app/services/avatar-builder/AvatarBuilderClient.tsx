"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback } from "react";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { useRouter } from "next/navigation";
import { 
  Camera, 
  RefreshCw, 
  CheckCircle, 
  User, 
  Palette, 
  Sparkles,
  ArrowRight,
  Loader2,
  Upload,
  Scan,
  Grid3X3
} from "lucide-react";

interface AvatarConfig {
  style: "business" | "formal" | "casual" | "creative";
  skinTone: "light" | "medium" | "tan" | "dark";
  eyeColor: "brown" | "blue" | "green" | "hazel" | "gray";
  hairStyle: "short" | "medium" | "long" | "bald";
  hairColor: "black" | "brown" | "blonde" | "red" | "gray" | "white";
  facialFeatures: "soft" | "defined" | "angular" | "round";
  ageRange: "young" | "adult" | "mature";
}

const defaultConfig: AvatarConfig = {
  style: "business",
  skinTone: "medium",
  eyeColor: "brown",
  hairStyle: "short",
  hairColor: "black",
  facialFeatures: "defined",
  ageRange: "adult"
};

const styleOptions = {
  style: [
    { value: "business", label: "Business", icon: "💼" },
    { value: "formal", label: "Formal", icon: "🎩" },
    { value: "casual", label: "Casual", icon: "👕" },
    { value: "creative", label: "Creative", icon: "🎨" }
  ],
  skinTone: [
    { value: "light", label: "Light", color: "#F5D0C5" },
    { value: "medium", label: "Medium", color: "#E0AC69" },
    { value: "tan", label: "Tan", color: "#C68642" },
    { value: "dark", label: "Dark", color: "#8D5524" }
  ],
  eyeColor: [
    { value: "brown", label: "Brown", color: "#5D4037" },
    { value: "blue", label: "Blue", color: "#1976D2" },
    { value: "green", label: "Green", color: "#388E3C" },
    { value: "hazel", label: "Hazel", color: "#8D6E63" },
    { value: "gray", label: "Gray", color: "#616161" }
  ],
  hairStyle: [
    { value: "short", label: "Short", icon: "✂️" },
    { value: "medium", label: "Medium", icon: "💇" },
    { value: "long", label: "Long", icon: "💇‍♀️" },
    { value: "bald", label: "Bald", icon: "👨‍🦲" }
  ],
  hairColor: [
    { value: "black", label: "Black", color: "#212121" },
    { value: "brown", label: "Brown", color: "#5D4037" },
    { value: "blonde", label: "Blonde", color: "#FBC02D" },
    { value: "red", label: "Red", color: "#C62828" },
    { value: "gray", label: "Gray", color: "#9E9E9E" },
    { value: "white", label: "White", color: "#F5F5F5" }
  ],
  facialFeatures: [
    { value: "soft", label: "Soft", desc: "Gentle features" },
    { value: "defined", label: "Defined", desc: "Balanced structure" },
    { value: "angular", label: "Angular", desc: "Sharp features" },
    { value: "round", label: "Round", desc: "Fuller face" }
  ],
  ageRange: [
    { value: "young", label: "Young", range: "18-25" },
    { value: "adult", label: "Adult", range: "26-45" },
    { value: "mature", label: "Mature", range: "46+" }
  ]
};

export default function AvatarBuilderClient() {
  const router = useRouter();
  const { setGlobalAvatarId } = useIdentity();
  const [config, setConfig] = useState<AvatarConfig>(defaultConfig);
  const [step, setStep] = useState<"capture" | "customize" | "generate">("capture");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAvatarId, setGeneratedAvatarId] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof AvatarConfig>("style");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateConfig = (key: keyof AvatarConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target?.result as string);
        setStep("customize");
      };
      reader.readAsDataURL(file);
    }
  };

  const generateAvatar = async () => {
    setIsGenerating(true);
    
    try {
      // Simulate AI generation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const avatarId = `AV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      setGeneratedAvatarId(avatarId);
      setGlobalAvatarId(avatarId);
      localStorage.setItem('GLOBAL_AVATAR_ID', avatarId);
      
      setStep("generate");
      
      setTimeout(() => {
        router.push('/services/voice-cloning');
      }, 3000);
      
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const render3DPreview = () => {
    // Simulated 3D avatar preview
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Background gradient based on style */}
        <div className={`absolute inset-0 rounded-2xl opacity-20 ${
          config.style === "business" ? "bg-blue-500" :
          config.style === "formal" ? "bg-purple-500" :
          config.style === "creative" ? "bg-pink-500" :
          "bg-green-500"
        }`} />
        
        {/* Avatar representation */}
        <div className="relative z-10 text-center">
          <motion.div
            animate={{ 
              rotateY: [0, 10, -10, 0],
              scale: [1, 1.02, 1]
            }}
            transition={{ duration: 6, repeat: Infinity }}
            className="w-48 h-48 mx-auto mb-4 relative"
          >
            {/* Head */}
            <div 
              className="w-32 h-40 mx-auto rounded-3xl relative overflow-hidden shadow-2xl"
              style={{ 
                backgroundColor: styleOptions.skinTone.find(s => s.value === config.skinTone)?.color,
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)"
              }}
            >
              {/* Eyes */}
              <div className="absolute top-16 left-6 w-8 h-4 rounded-full bg-white overflow-hidden">
                <div 
                  className="w-4 h-4 rounded-full mx-auto"
                  style={{ backgroundColor: styleOptions.eyeColor.find(e => e.value === config.eyeColor)?.color }}
                />
              </div>
              <div className="absolute top-16 right-6 w-8 h-4 rounded-full bg-white overflow-hidden">
                <div 
                  className="w-4 h-4 rounded-full mx-auto"
                  style={{ backgroundColor: styleOptions.eyeColor.find(e => e.value === config.eyeColor)?.color }}
                />
              </div>
              
              {/* Hair */}
              {config.hairStyle !== "bald" && (
                <div 
                  className="absolute top-0 left-0 right-0 h-16 rounded-t-3xl"
                  style={{ 
                    backgroundColor: styleOptions.hairColor.find(h => h.value === config.hairColor)?.color,
                    height: config.hairStyle === "long" ? "60%" : config.hairStyle === "medium" ? "40%" : "25%"
                  }}
                />
              )}
            </div>
            
            {/* Body/Clothing indicator */}
            <div className={`w-40 h-24 mx-auto -mt-4 rounded-t-3xl ${
              config.style === "business" ? "bg-blue-900" :
              config.style === "formal" ? "bg-gray-900" :
              config.style === "creative" ? "bg-purple-700" :
              "bg-green-700"
            }`}>
              <div className="h-full flex items-center justify-center">
                <span className="text-2xl opacity-50">
                  {config.style === "business" ? "👔" :
                   config.style === "formal" ? "🤵" :
                   config.style === "creative" ? "🎨" :
                   "👕"}
                </span>
              </div>
            </div>
          </motion.div>
          
          <p className="text-sm text-gray-400">3D Preview (Simulated)</p>
        </div>
        
        {/* Grid overlay */}
        <div className="absolute inset-0 rounded-2xl opacity-10 pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(0,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "20px 20px"
          }}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] bg-clip-text text-transparent mb-4">
            Avatar Builder
          </h1>
          <p className="text-gray-400">
            Create your digital twin with AI-powered photogrammetry
          </p>
        </motion.div>

        {/* Step Indicator */}
        <div className="flex justify-center mb-8">
          {["capture", "customize", "generate"].map((s, idx) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                step === s ? "bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black" :
                idx < ["capture", "customize", "generate"].indexOf(step) ? "bg-green-500 text-white" :
                "bg-white/10 text-gray-500"
              }`}>
                {idx + 1}
              </div>
              {idx < 2 && <div className="w-16 h-1 mx-2 bg-white/10" />}
            </div>
          ))}
        </div>

        {/* Capture Step */}
        {step === "capture" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto"
          >
            <div className="grid md:grid-cols-2 gap-6">
              {/* Upload Option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square bg-white/5 border-2 border-dashed border-white/20 rounded-3xl flex flex-col items-center justify-center gap-4 hover:border-[#D4AF37] transition-colors"
              >
                <Upload className="w-16 h-16 text-gray-400" />
                <div className="text-center">
                  <p className="font-semibold text-lg">Upload Photo</p>
                  <p className="text-sm text-gray-500">High resolution preferred</p>
                </div>
              </motion.button>
              
              {/* Camera Option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStep("customize")}
                className="aspect-square bg-white/5 border-2 border-dashed border-white/20 rounded-3xl flex flex-col items-center justify-center gap-4 hover:border-[#00FFFF] transition-colors"
              >
                <Camera className="w-16 h-16 text-gray-400" />
                <div className="text-center">
                  <p className="font-semibold text-lg">Use Camera</p>
                  <p className="text-sm text-gray-500">32-point mesh capture</p>
                </div>
              </motion.button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            
            <p className="text-center text-gray-500 mt-6 text-sm">
              Or skip to manual customization →
              <button 
                onClick={() => setStep("customize")}
                className="ml-2 text-[#00FFFF] hover:underline"
              >
                Continue
              </button>
            </p>
          </motion.div>
        )}

        {/* Customize Step */}
        {step === "customize" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid lg:grid-cols-2 gap-8"
          >
            {/* 3D Preview */}
            <div className="aspect-square bg-black/30 rounded-3xl overflow-hidden border border-white/10">
              {render3DPreview()}
            </div>
            
            {/* Controls */}
            <div className="space-y-6">
              {/* Category Tabs */}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(styleOptions) as Array<keyof AvatarConfig>).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === key 
                        ? "bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black" 
                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </button>
                ))}
              </div>
              
              {/* Options Grid */}
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-semibold mb-4 capitalize flex items-center gap-2">
                  {activeTab === "style" && <Sparkles className="w-5 h-5 text-[#D4AF37]" />}
                  {activeTab === "skinTone" && <User className="w-5 h-5 text-[#D4AF37]" />}
                  {activeTab === "eyeColor" && <Scan className="w-5 h-5 text-[#00FFFF]" />}
                  {activeTab}
                </h3>
                
                <div className="grid grid-cols-2 gap-3">
                  {styleOptions[activeTab].map((option: any) => (
                    <motion.button
                      key={option.value}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => updateConfig(activeTab, option.value)}
                      className={`p-4 rounded-xl border transition-all ${
                        config[activeTab] === option.value
                          ? "border-[#00FFFF] bg-[#00FFFF]/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      {option.color && (
                        <div 
                          className="w-8 h-8 rounded-full mx-auto mb-2 border-2 border-white/20"
                          style={{ backgroundColor: option.color }}
                        />
                      )}
                      {option.icon && <div className="text-2xl mb-1">{option.icon}</div>}
                      <p className="font-medium text-sm">{option.label}</p>
                      {option.desc && <p className="text-xs text-gray-500">{option.desc}</p>}
                      {option.range && <p className="text-xs text-gray-500">{option.range}</p>}
                    </motion.button>
                  ))}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-4">
                <button
                  onClick={() => setStep("capture")}
                  className="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-xl font-semibold"
                >
                  Back
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={generateAvatar}
                  disabled={isGenerating}
                  className="flex-1 py-4 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating 32-Point Mesh...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate Avatar
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Generate Step */}
        {step === "generate" && generatedAvatarId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto text-center"
          >
            <div className="bg-white/5 backdrop-blur-sm border border-green-500/30 rounded-3xl p-12">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] p-1"
              >
                <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center">
                  <CheckCircle className="w-16 h-16 text-green-500" />
                </div>
              </motion.div>
              
              <h2 className="text-3xl font-bold text-green-400 mb-4">
                Avatar Generated!
              </h2>
              
              <p className="text-gray-400 mb-6">
                Your 32-point facial mesh has been created and is ready for voice cloning.
              </p>
              
              <div className="bg-black/30 rounded-xl p-4 mb-8 inline-block">
                <p className="text-xs text-gray-500 mb-1">Avatar ID</p>
                <p className="text-[#00FFFF] font-mono text-xl">{generatedAvatarId}</p>
              </div>
              
              <div className="flex justify-center gap-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  onClick={() => router.push('/services/voice-cloning')}
                  className="px-8 py-4 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-xl font-semibold flex items-center gap-2"
                >
                  Continue to Voice Cloning
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              </div>
              
              <p className="text-sm text-gray-500 mt-6">
                Next step: Clone your voice to complete your Digital Twin
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
