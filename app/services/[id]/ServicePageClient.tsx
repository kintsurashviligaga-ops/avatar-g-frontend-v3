"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { useState, useEffect } from "react";
import { 
  Sparkles, 
  Wand2, 
  Video, 
  Image as ImageIcon, 
  Mic, 
  Code, 
  BarChart3, 
  MessageSquare,
  Upload,
  Download,
  Share2,
  Play,
  Pause,
  Settings,
  User,
  Volume2,
  Check,
  AlertTriangle,
  Loader2,
  Music
} from "lucide-react";

interface ServicePageClientProps {
  id: string;
}

interface GenerationResult {
  type: string;
  url?: string;
  text?: string;
  previewUrl?: string;
  stems?: Record<string, string | null>;
  identity: {
    avatarId: string;
    voiceId: string;
    injected: boolean;
  };
  timestamp: string;
  processing?: {
    renderTime?: string;
    steps?: number;
  };
}

const services = {
  "video-lab": {
    icon: Video,
    title: "Video Cine-Lab",
    description: "პროფესიონალური AI ვიდეო გენერაცია",
    features: ["15 წამიანი კლიპები", "Cinematic ხარისხი", "Avatar Acting", "4K რეზოლუცია", "Lip Sync"],
    placeholder: "აღწერეთ თქვენი ვიდეო... (მაგ: 'ქართული ფეხბურთის მატჩი, საღამოს სანათი, დინამიკური კადრები')",
    color: "from-purple-500 to-pink-600",
    requiresIdentity: true,
    apiType: "video"
  },
  "image-generator": {
    icon: ImageIcon,
    title: "Image Forge",
    description: "AI სურათების გენერაცია",
    features: ["4K ხარისხი", "სტილის კონტროლი", "Avatar Appearance", "Inpainting", "Outpainting"],
    placeholder: "აღწერეთ სურათი... (მაგ: 'ფუტურისტული ქალაქი, ნეონური განათება, cyberpunk სტილი')",
    color: "from-cyan-500 to-blue-600",
    requiresIdentity: true,
    apiType: "image"
  },
  "text-intelligence": {
    icon: MessageSquare,
    title: "Text Intelligence",
    description: "AI ტექსტის გენერაცია და ანალიზი",
    features: ["GPT-4 ინტეგრაცია", "მრავალენოვანი", "კონტექსტური გაგება", "Code generation"],
    placeholder: "დაწერეთ რაიმე... (მაგ: 'დამიწერე პოემა თბილისზე')",
    color: "from-emerald-500 to-teal-600",
    requiresIdentity: false,
    apiType: "text"
  },
  "voice-studio": {
    icon: Mic,
    title: "Voice Studio",
    description: "ხმოვანი AI ასისტენტი",
    features: ["TTS/STT", "Voice Cloning", "Emotion Control", "Real-time"],
    placeholder: "ჩაწერეთ ტექსტი... (მაგ: 'გამარჯობა, მე ვარ თქვენი AI ასისტენტი')",
    color: "from-orange-500 to-red-600",
    requiresIdentity: true,
    apiType: "voice"
  },
  "code-assistant": {
    icon: Code,
    title: "Code Forge",
    description: "AI კოდის ასისტენტი",
    features: ["ავტომატური კოდი", "Debug", "რეფაქტორინგი", "Documentation"],
    placeholder: "ჩაწერეთ კოდი ან აღწერეთ რა გინდათ...",
    color: "from-indigo-500 to-purple-600",
    requiresIdentity: false,
    apiType: "text"
  },
  "data-analyst": {
    icon: BarChart3,
    title: "Data Intelligence",
    description: "AI მონაცემთა ანალიზი",
    features: ["ვიზუალიზაცია", "პროგნოზირება", "ავტომატური report-ები", "CSV/Excel"],
    placeholder: "ატვირთეთ მონაცემები ან აღწერეთ ანალიზი...",
    color: "from-rose-500 to-pink-600",
    requiresIdentity: false,
    apiType: "text"
  },
  "music-generator": {
    icon: Music,
    title: "Music Studio",
    description: "AI მუსიკის გენერაცია",
    features: ["Original compositions", "Voice Integration", "Multi-genre", "Stem separation"],
    placeholder: "აღწერეთ მუსიკა... (მაგ: 'Epic orchestral, cinematic, heroic theme')",
    color: "from-amber-500 to-orange-600",
    requiresIdentity: true,
    apiType: "music"
  }
};

export default function ServicePageClient({ id }: ServicePageClientProps) {
  const { t } = useLanguage();
  const { globalAvatarId, globalVoiceId, injectIdentity, verifyIdentity } = useIdentity();
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  
  const service = services[id as keyof typeof services] || {
    icon: Sparkles,
    title: id.replace(/-/g, " "),
    description: "AI სერვისი",
    features: [],
    placeholder: "შეიყვანეთ ტექსტი...",
    color: "from-cyan-500 to-blue-600",
    requiresIdentity: false,
    apiType: "text"
  };
  
  const Icon = service.icon;
  const hasIdentity = verifyIdentity();

  // Check identity requirement
  useEffect(() => {
    if (service.requiresIdentity && !hasIdentity) {
      setError("Identity required");
    }
  }, [service.requiresIdentity, hasIdentity]);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    
    if (service.requiresIdentity && !hasIdentity) {
      setError("Identity verification required");
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setResult(null);
    setError(null);
    
    try {
      // Prepare request with identity
      const requestData = {
        prompt: input,
        content: input,
        type: id === "code-assistant" ? "code" : id === "data-analyst" ? "executive" : "general",
        style: "photorealistic",
        emotion: "neutral",
        duration: 15,
        avatarAppearance: true,
        vocals: true,
        genre: "electronic"
      };
      
      const requestWithIdentity = service.requiresIdentity 
        ? injectIdentity(requestData)
        : requestData;

      // Progress simulation
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return 90;
          return prev + Math.random() * 15;
        });
      }, 500);

      // API call
      const response = await fetch(`/api/generate/${service.apiType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestWithIdentity)
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Generation failed");
      }

      const data = await response.json();
      setResult(data);
      
    } catch (err: any) {
      setError(err.message || "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadResult = () => {
    if (result?.url) {
      window.open(result.url, '_blank');
    }
  };

  // Render identity error
  if (error === "Identity required" || error === "Identity verification required") {
    return (
      <div className="min-h-screen bg-[#05070A] text-white pt-20 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full bg-[#1A1A1A] border border-red-500/30 rounded-3xl p-8 text-center"
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center"
          >
            <AlertTriangle className="w-12 h-12 text-red-500" />
          </motion.div>

          <h2 className="text-3xl font-bold text-red-400 mb-4">
            Identity Verification Required
          </h2>
          <p className="text-gray-400 mb-6">
            სერვისი <span className="text-[#D4AF37]">{service.title}</span> საჭიროებს Digital Twin იდენტიფიკატორს.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className={`p-6 rounded-2xl border ${globalAvatarId ? 'border-[#00FFFF] bg-[#00FFFF]/10' : 'border-[#D4AF37]/30 bg-[#0A0A0A]'}`}>
              <User className={`w-8 h-8 mx-auto mb-3 ${globalAvatarId ? 'text-[#00FFFF]' : 'text-gray-600'}`} />
              <p className="font-semibold mb-1">{globalAvatarId ? 'Avatar Ready' : 'Avatar Required'}</p>
            </div>
            <div className={`p-6 rounded-2xl border ${globalVoiceId ? 'border-[#00FFFF] bg-[#00FFFF]/10' : 'border-[#D4AF37]/30 bg-[#0A0A0A]'}`}>
              <Volume2 className={`w-8 h-8 mx-auto mb-3 ${globalVoiceId ? 'text-[#00FFFF]' : 'text-gray-600'}`} />
              <p className="font-semibold mb-1">{globalVoiceId ? 'Voice Ready' : 'Voice Required'}</p>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            {!globalAvatarId && (
              <a href="/services/avatar-builder" className="px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl text-black font-bold">
                Create Avatar
              </a>
            )}
            {globalAvatarId && !globalVoiceId && (
              <a href="/services/voice-cloning" className="px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl text-black font-bold">
                Clone Voice
              </a>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-20">
      {/* Identity Badge */}
      {hasIdentity && (
        <div className="fixed top-24 right-6 z-40 bg-[#1A1A1A]/90 backdrop-blur-md border border-[#00FFFF]/30 rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] flex items-center justify-center">
            <Check className="w-4 h-4 text-black" />
          </div>
          <div className="text-xs">
            <p className="text-gray-400">Identity Active</p>
            <p className="text-[#00FFFF] font-mono">{globalAvatarId?.slice(0, 8)}...</p>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className={`bg-gradient-to-r ${service.color} py-16 relative overflow-hidden`}>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 mb-4"
          >
            <div className="p-3 bg-white/20 rounded-2xl">
              <Icon className="w-12 h-12" />
            </div>
            <div>
              <h1 className="text-4xl font-bold capitalize">{service.title}</h1>
              <p className="text-xl opacity-90">{service.description}</p>
            </div>
          </motion.div>
          
          {service.requiresIdentity && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-black/30 rounded-full text-sm"
            >
              <User className="w-4 h-4" />
              <span>Identity-bound generation enabled</span>
            </motion.div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Input */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
            >
              <h3 className="text-lg font-semibold mb-4">🎯 შეყვანა</h3>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={service.placeholder}
                disabled={isGenerating}
                className="w-full h-40 bg-black/30 border border-white/20 rounded-xl p-4 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none resize-none disabled:opacity-50"
              />
              
              {isGenerating && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      გენერაცია...
                    </span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full bg-gradient-to-r ${service.color}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {error && !error.includes("Identity") && (
                <div className="mt-4 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400">
                  {error}
                </div>
              )}

              <div className="flex justify-between items-center mt-4">
                <div className="flex gap-2">
                  <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10">
                    <Mic className="w-5 h-5" />
                  </button>
                  <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10">
                    <Upload className="w-5 h-5" />
                  </button>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleGenerate}
                  disabled={isGenerating || !input.trim()}
                  className={`px-8 py-3 bg-gradient-to-r ${service.color} rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50 shadow-lg`}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      გენერაცია...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5" />
                      გენერაცია
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>

            {/* Result */}
            {result && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    <Check className="w-5 h-5 text-[#00FFFF]" />
                    შედეგი
                  </h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={downloadResult}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Share">
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Media Preview */}
                {result.url && service.apiType === "image" && (
                  <div className="aspect-video bg-black/30 rounded-xl mb-4 flex items-center justify-center overflow-hidden">
                    <div className={`w-32 h-32 rounded-full bg-gradient-to-r ${service.color} flex items-center justify-center`}>
                      <ImageIcon className="w-16 h-16 text-white" />
                    </div>
                  </div>
                )}

                {result.url && (service.apiType === "video" || service.apiType === "music" || service.apiType === "voice") && (
                  <div className="bg-black/30 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setPreviewPlaying(!previewPlaying)}
                        className={`w-14 h-14 rounded-full bg-gradient-to-r ${service.color} flex items-center justify-center`}
                      >
                        {previewPlaying ? (
                          <Pause className="w-6 h-6 text-white" />
                        ) : (
                          <Play className="w-6 h-6 text-white ml-1" />
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="h-12 bg-black/50 rounded-lg flex items-center px-4 gap-1">
                          {Array.from({length: 30}).map((_, i) => (
                            <motion.div
                              key={i}
                              animate={{ 
                                height: previewPlaying ? [4, 20 + Math.random() * 20, 4] : 4 
                              }}
                              transition={{ 
                                duration: 0.3, 
                                repeat: previewPlaying ? Infinity : 0,
                                delay: i * 0.02 
                              }}
                              className={`w-1 bg-gradient-to-t ${service.color} rounded-full`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Text Result */}
                {result.text && (
                  <div className="bg-black/30 rounded-xl p-4 mb-4">
                    <pre className="whitespace-pre-wrap font-mono text-sm text-gray-300">
                      {result.text}
                    </pre>
                  </div>
                )}

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-black/30 rounded-lg p-3">
                    <p className="text-gray-500 mb-1">Identity</p>
                    <p className="text-[#00FFFF] font-mono">{result.identity?.avatarId?.slice(0, 16)}...</p>
                  </div>
                  <div className="bg-black/30 rounded-lg p-3">
                    <p className="text-gray-500 mb-1">Timestamp</p>
                    <p className="text-gray-300">{new Date(result.timestamp).toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button 
                    onClick={downloadResult}
                    className={`flex-1 py-3 bg-gradient-to-r ${service.color} rounded-xl font-semibold hover:opacity-90 transition-opacity`}
                  >
                    ჩამოტვირთვა
                  </button>
                  <button className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                    გაზიარება
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Features */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
            >
              <h3 className="text-xl font-semibold mb-4">✨ მახასიათებლები</h3>
              <ul className="space-y-3">
                {service.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${service.color}`} />
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Identity Status */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className={`rounded-2xl p-6 border ${
                hasIdentity ? 'bg-[#00FFFF]/5 border-[#00FFFF]/30' : 'bg-white/5 border-white/10'
              }`}
            >
              <h3 className="text-xl font-semibold mb-4">Identity Status</h3>
              
              {hasIdentity ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-black/30 rounded-xl">
                    <User className="w-5 h-5 text-[#D4AF37]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400">Avatar ID</p>
                      <p className="text-sm text-[#00FFFF] font-mono truncate">{globalAvatarId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-black/30 rounded-xl">
                    <Volume2 className="w-5 h-5 text-[#D4AF37]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400">Voice ID</p>
                      <p className="text-sm text-[#00FFFF] font-mono truncate">{globalVoiceId}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-400 mb-4">Identity not established</p>
                  <a href="/services/avatar-builder" className="inline-block px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-lg text-black text-sm font-semibold">
                    Create Identity
                  </a>
                </div>
              )}
            </motion.div>

            {/* AI Assistant */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-2xl p-6"
            >
              <h3 className="text-xl font-semibold mb-2">💬 AI ჩათბოტი</h3>
              <p className="text-gray-400 text-sm mb-4">დაგეხმარებათ სერვისის გამოყენებაში</p>
              <button className="w-full py-3 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-xl transition-colors">
                ჩათის დაწყება
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
