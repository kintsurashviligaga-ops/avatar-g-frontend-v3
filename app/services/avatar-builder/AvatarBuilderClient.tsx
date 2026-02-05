"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Camera, 
  Upload, 
  Sparkles, 
  Check, 
  RotateCw,
  User,
  Palette,
  Scan,
  Save
} from "lucide-react";

// 1980s Executive Luxury Color Palette
const colors = {
  obsidian: "#0A0A0A",
  gold: "#D4AF37",
  glass: "rgba(255, 255, 255, 0.85)",
  cyan: "#00FFFF",
  obsidianLight: "#1A1A1A"
};

type AvatarStyle = "business" | "formal" | "casual" | "creative";

interface AvatarConfig {
  facialGeometry: number[];
  style: AvatarStyle;
  skinTone: string;
  hairStyle: string;
  eyeColor: string;
}

export default function AvatarBuilderClient() {
  const [step, setStep] = useState<"capture" | "process" | "customize" | "finalize">("capture");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({
    facialGeometry: [],
    style: "business",
    skinTone: "#F5D0C5",
    hairStyle: "short",
    eyeColor: "#4A90E2"
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simulate photogrammetry capture
  const handleCapture = () => {
    setIsProcessing(true);
    setStep("process");
    
    // Simulate 32-point mesh generation
    let prog = 0;
    const interval = setInterval(() => {
      prog += 5;
      setProgress(prog);
      if (prog >= 100) {
        clearInterval(interval);
        setIsProcessing(false);
        setStep("customize");
        // Generate mock facial geometry
        setAvatarConfig(prev => ({
          ...prev,
          facialGeometry: Array.from({length: 32}, () => Math.random())
        }));
      }
    }, 100);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target?.result as string);
        handleCapture();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStyleChange = (style: AvatarStyle) => {
    setAvatarConfig(prev => ({ ...prev, style }));
  };

  const generateAvatarHash = () => {
    // Simulate GLOBAL_AVATAR_ID generation
    const hash = btoa(JSON.stringify(avatarConfig.facialGeometry)).slice(0, 16);
    return `AV-${hash.toUpperCase()}`;
  };

  const renderCaptureStep = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold" style={{ color: colors.gold }}>
          Digital Twin Capture
        </h2>
        <p className="text-gray-400">
          Photogrammetry-grade 32-point facial mesh generation
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Camera Capture */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="aspect-square rounded-2xl border-2 border-dashed border-[#D4AF37]/30 bg-[#0A0A0A]/50 flex flex-col items-center justify-center cursor-pointer hover:border-[#D4AF37]/60 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#00FFFF]/20 flex items-center justify-center mb-4">
            <Camera className="w-12 h-12 text-[#D4AF37]" />
          </div>
          <p className="text-[#D4AF37] font-semibold">Live Capture</p>
          <p className="text-sm text-gray-500 mt-2">Use camera for real-time scan</p>
        </motion.div>

        {/* Upload */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="aspect-square rounded-2xl border-2 border-dashed border-[#D4AF37]/30 bg-[#0A0A0A]/50 flex flex-col items-center justify-center cursor-pointer hover:border-[#D4AF37]/60 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#00FFFF]/20 to-[#D4AF37]/20 flex items-center justify-center mb-4">
            <Upload className="w-12 h-12 text-[#00FFFF]" />
          </div>
          <p className="text-[#00FFFF] font-semibold">Upload Photo</p>
          <p className="text-sm text-gray-500 mt-2">High-resolution frontal image</p>
        </motion.div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      <div className="flex justify-center gap-4 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Scan className="w-4 h-4 text-[#D4AF37]" />
          <span>32-point mesh</span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-[#00FFFF]" />
          <span>4K resolution</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#D4AF37]" />
          <span>AI-enhanced</span>
        </div>
      </div>
    </motion.div>
  );

  const renderProcessStep = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center min-h-[400px] space-y-8"
    >
      <div className="relative w-48 h-48">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-4 border-[#D4AF37]/20 border-t-[#D4AF37]"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-4 rounded-full border-4 border-[#00FFFF]/20 border-t-[#00FFFF]"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Scan className="w-16 h-16 text-[#D4AF37]" />
        </div>
      </div>

      <div className="text-center space-y-4">
        <h3 className="text-2xl font-bold text-[#D4AF37]">Processing Facial Geometry</h3>
        <p className="text-gray-400">Generating 32-point mesh...</p>
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Mesh Generation</span>
          <span className="text-[#00FFFF]">{progress}%</span>
        </div>
        <div className="h-2 bg-[#0A0A0A] rounded-full overflow-hidden border border-[#D4AF37]/30">
          <motion.div
            className="h-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 text-center">
        {["Landmarks", "Texture", "Depth", "Geometry"].map((stage, idx) => (
          <div key={stage} className={`space-y-2 ${progress > (idx + 1) * 25 ? 'opacity-100' : 'opacity-30'}`}>
            <div className={`w-3 h-3 rounded-full mx-auto ${progress > (idx + 1) * 25 ? 'bg-[#00FFFF]' : 'bg-gray-600'}`} />
            <p className="text-xs text-gray-400">{stage}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );

  const renderCustomizeStep = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="grid lg:grid-cols-2 gap-8"
    >
      {/* Avatar Preview */}
      <div className="space-y-6">
        <div className="aspect-square rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-[#D4AF37]/30 flex items-center justify-center relative overflow-hidden">
          {/* Skeuomorphic brushed metal effect */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] opacity-10" />
          
          {/* Avatar representation */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative z-10 text-center"
          >
            <div 
              className="w-48 h-48 rounded-full mx-auto mb-4 border-4 border-[#D4AF37]/50 shadow-2xl shadow-[#D4AF37]/20"
              style={{ 
                background: `linear-gradient(135deg, ${avatarConfig.skinTone} 0%, ${avatarConfig.skinTone}dd 100%)`,
                boxShadow: `0 0 60px ${avatarConfig.skinTone}40`
              }}
            >
              {/* Eyes */}
              <div className="flex justify-center gap-8 pt-16">
                <div 
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: avatarConfig.eyeColor, boxShadow: `0 0 20px ${avatarConfig.eyeColor}` }}
                />
                <div 
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: avatarConfig.eyeColor, boxShadow: `0 0 20px ${avatarConfig.eyeColor}` }}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <p className="text-[#D4AF37] font-mono text-sm">GLOBAL_AVATAR_ID</p>
              <p className="text-[#00FFFF] font-mono text-xs">{generateAvatarHash()}</p>
            </div>
          </motion.div>

          {/* Analog VU meter decoration */}
          <div className="absolute bottom-4 left-4 right-4 h-8 bg-[#0A0A0A] rounded-lg border border-[#D4AF37]/30 flex items-center px-4">
            <div className="flex gap-1">
              {Array.from({length: 20}).map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ height: [4, 16, 4] }}
                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.05 }}
                  className="w-1 bg-gradient-to-t from-[#D4AF37] to-[#00FFFF] rounded-full"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-[#D4AF37]">Style Configuration</h3>
        
        {/* Style Modes */}
        <div className="space-y-3">
          <label className="text-sm text-gray-400 uppercase tracking-wider">Mode</label>
          <div className="grid grid-cols-2 gap-3">
            {(["business", "formal", "casual", "creative"] as AvatarStyle[]).map((style) => (
              <motion.button
                key={style}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleStyleChange(style)}
                className={`p-4 rounded-xl border transition-all ${
                  avatarConfig.style === style 
                    ? 'border-[#D4AF37] bg-[#D4AF37]/10' 
                    : 'border-[#D4AF37]/30 hover:border-[#D4AF37]/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${avatarConfig.style === style ? 'bg-[#00FFFF]' : 'bg-gray-600'}`} />
                  <span className="capitalize text-gray-200">{style}</span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Skin Tone */}
        <div className="space-y-3">
          <label className="text-sm text-gray-400 uppercase tracking-wider">Skin Tone</label>
          <div className="flex gap-3">
            {["#F5D0C5", "#E8B4A0", "#D4A574", "#8D5524", "#3C2E28"].map((tone) => (
              <motion.button
                key={tone}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setAvatarConfig(prev => ({ ...prev, skinTone: tone }))}
                className={`w-12 h-12 rounded-full border-2 transition-all ${
                  avatarConfig.skinTone === tone ? 'border-[#00FFFF] scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: tone }}
              />
            ))}
          </div>
        </div>

        {/* Eye Color */}
        <div className="space-y-3">
          <label className="text-sm text-gray-400 uppercase tracking-wider">Eye Color</label>
          <div className="flex gap-3">
            {["#4A90E2", "#5D4E37", "#7A9E7E", "#8B4513", "#4B0082"].map((color) => (
              <motion.button
                key={color}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setAvatarConfig(prev => ({ ...prev, eyeColor: color }))}
                className={`w-12 h-12 rounded-full border-2 transition-all ${
                  avatarConfig.eyeColor === color ? 'border-[#00FFFF] scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Physical toggle switch */}
        <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-xl border border-[#D4AF37]/30">
          <span className="text-gray-300">Enhanced Detail</span>
          <div className="w-14 h-7 bg-[#0A0A0A] rounded-full border border-[#D4AF37]/50 relative cursor-pointer">
            <motion.div 
              className="absolute top-1 left-1 w-5 h-5 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-full"
              animate={{ x: 24 }}
            />
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setStep("finalize")}
          className="w-full py-4 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl font-bold text-black flex items-center justify-center gap-3"
        >
          <Save className="w-5 h-5" />
          Finalize Avatar
        </motion.button>
      </div>
    </motion.div>
  );

  const renderFinalizeStep = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-8"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className="w-32 h-32 mx-auto rounded-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] flex items-center justify-center"
      >
        <Check className="w-16 h-16 text-black" />
      </motion.div>

      <div className="space-y-4">
        <h2 className="text-3xl font-bold text-[#D4AF37]">Digital Twin Established</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          Your avatar identity has been encrypted and distributed across our multi-redundant vault.
        </p>
      </div>

      <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-[#D4AF37]/30 max-w-md mx-auto">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">GLOBAL_AVATAR_ID</span>
            <span className="text-[#00FFFF] font-mono">{generateAvatarHash()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Mesh Points</span>
            <span className="text-[#D4AF37]">32/32</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Style Mode</span>
            <span className="text-[#00FFFF] capitalize">{avatarConfig.style}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Encryption</span>
            <span className="text-[#D4AF37]">AES-256</span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-3 bg-[#1A1A1A] border border-[#D4AF37]/50 rounded-xl text-[#D4AF37] flex items-center gap-2"
        >
          <RotateCw className="w-5 h-5" />
          Recreate
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl text-black font-bold flex items-center gap-2"
        >
          <Sparkles className="w-5 h-5" />
          Proceed to Voice
        </motion.button>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0A0A0A] via-[#1A1A1A] to-[#0A0A0A] border-b border-[#D4AF37]/20 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] flex items-center justify-center">
              <User className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#D4AF37]">Professional Avatar Builder</h1>
              <p className="text-gray-400">Establish your primary visual identity source</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Step Indicator */}
        <div className="flex justify-between mb-12 relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[#1A1A1A] -z-10" />
          {["capture", "process", "customize", "finalize"].map((s, idx) => (
            <div key={s} className="flex flex-col items-center gap-2 bg-[#0A0A0A] px-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                step === s 
                  ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]' 
                  : idx < ["capture", "process", "customize", "finalize"].indexOf(step)
                    ? 'border-[#00FFFF] bg-[#00FFFF]/20 text-[#00FFFF]'
                    : 'border-gray-700 bg-[#0A0A0A] text-gray-600'
              }`}>
                {idx < ["capture", "process", "customize", "finalize"].indexOf(step) ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span className="font-bold">{idx + 1}</span>
                )}
              </div>
              <span className={`text-xs uppercase tracking-wider ${
                step === s ? 'text-[#D4AF37]' : 'text-gray-600'
              }`}>
                {s}
              </span>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-[#1A1A1A]/50 backdrop-blur-sm rounded-3xl border border-[#D4AF37]/20 p-8">
          <AnimatePresence mode="wait">
            {step === "capture" && renderCaptureStep()}
            {step === "process" && renderProcessStep()}
            {step === "customize" && renderCustomizeStep()}
            {step === "finalize" && renderFinalizeStep()}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
