"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { useState } from "react";
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
  AlertTriangle
} from "lucide-react";

interface ServicePageClientProps {
  id: string;
}

const services = {
  "video-lab": {
    icon: Video,
    title: "Video Cine-Lab",
    description: "პროფესიონალური AI ვიდეო გენერაცია",
    features: ["15 წამიანი კლიპები", "Cinematic ხარისხი", "მულტიმოდალური AI", "4K რეზოლუცია", "Avatar Integration"],
    placeholder: "აღწერეთ თქვენი ვიდეო... (მაგ: 'ქართული ფეხბურთის მატჩი, საღამოს სანათი, დინამიკური კადრები')",
    color: "from-purple-500 to-pink-600",
    requiresIdentity: true
  },
  "image-generator": {
    icon: ImageIcon,
    title: "Image Forge",
    description: "AI სურათების გენერაცია",
    features: ["4K ხარისხი", "სტილის კონტროლი", "Inpainting", "Outpainting", "Avatar Appearance"],
    placeholder: "აღწერეთ სურათი... (მაგ: 'ფუტურისტული ქალაქი, ნეონური განათება, cyberpunk სტილი')",
    color: "from-cyan-500 to-blue-600",
    requiresIdentity: true
  },
  "text-intelligence": {
    icon: MessageSquare,
    title: "Text Intelligence",
    description: "AI ტექსტის გენერაცია და ანალიზი",
    features: ["GPT-4 ინტეგრაცია", "მრავალენოვანი", "კონტექსტური გაგება", "Code generation"],
    placeholder: "დაწერეთ რაიმე... (მაგ: 'დამიწერე პოემა თბილისზე')",
    color: "from-emerald-500 to-teal-600",
    requiresIdentity: false
  },
  "voice-studio": {
    icon: Mic,
    title: "Voice Studio",
    description: "ხმოვანი AI ასისტენტი",
    features: ["TTS/STT", "ხმის კლონირება", "მრავალენოვანი", "Real-time"],
    placeholder: "ჩაწერეთ ან ჩაწერეთ ტექსტი...",
    color: "from-orange-500 to-red-600",
    requiresIdentity: true
  },
  "code-assistant": {
    icon: Code,
    title: "Code Forge",
    description: "AI კოდის ასისტენტი",
    features: ["ავტომატური კოდი", "Debug", "რეფაქტორინგი", "Documentation"],
    placeholder: "ჩაწერეთ კოდი ან აღწერეთ რა გინდათ...",
    color: "from-indigo-500 to-purple-600",
    requiresIdentity: false
  },
  "data-analyst": {
    icon: BarChart3,
    title: "Data Intelligence",
    description: "AI მონაცემთა ანალიზი",
    features: ["ვიზუალიზაცია", "პროგნოზირება", "ავტომატური report-ები", "CSV/Excel"],
    placeholder: "ატვირთეთ მონაცემები ან აღწერეთ ანალიზი...",
    color: "from-rose-500 to-pink-600",
    requiresIdentity: false
  },
  "music-generator": {
    icon: Mic,
    title: "Music Studio",
    description: "AI მუსიკის გენერაცია",
    features: ["Original compositions", "Voice integration", "Multi-genre", "Stem separation"],
    placeholder: "აღწერეთ მუსიკა... (მაგ: 'Epic orchestral, cinematic, heroic theme')",
    color: "from-amber-500 to-orange-600",
    requiresIdentity: true
  }
};

export default function ServicePageClient({ id }: ServicePageClientProps) {
  const { t } = useLanguage();
  const { globalAvatarId, globalVoiceId, injectIdentity, verifyIdentity } = useIdentity();
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [identityError, setIdentityError] = useState(false);
  
  const service = services[id as keyof typeof services] || {
    icon: Sparkles,
    title: id.replace(/-/g, " "),
    description: "AI სერვისი",
    features: [],
    placeholder: "შეიყვანეთ ტექსტი...",
    color: "from-cyan-500 to-blue-600",
    requiresIdentity: false
  };
  
  const Icon = service.icon;
  const hasIdentity = verifyIdentity();

  // Check identity requirement
  useEffect(() => {
    if (service.requiresIdentity && !hasIdentity) {
      setIdentityError(true);
    }
  }, [service.requiresIdentity, hasIdentity]);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    
    // Identity verification for required services
    if (service.requiresIdentity && !hasIdentity) {
      setIdentityError(true);
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setResult(null);
    
    try {
      // Inject identity into request
      const requestData = {
        content: input,
        service: id,
        timestamp: new Date().toISOString()
      };
      
      const requestWithIdentity = service.requiresIdentity 
        ? injectIdentity(requestData)
        : requestData;

      console.log("Request with identity:", requestWithIdentity);

      // Simulate progress
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 300);

      // Simulate AI generation with identity
      setTimeout(() => {
        clearInterval(interval);
        setProgress(100);
        
        let resultText = `✨ AI გენერაციის შედეგი:\n\n"${input}"\n\n🎯 სერვისი: ${service.title}\n⏱️ დრო: 2.3 წამი\n📊 ხარისხი: 98.5%\n\n`;
        
        // Add identity-specific output
        if (service.requiresIdentity && hasIdentity) {
          resultText += `\n🎭 იდენტიფიკატორის ინტეგრაცია:\n`;
          resultText += `   Avatar ID: ${globalAvatarId?.slice(0, 16)}...\n`;
          resultText += `   Voice ID: ${globalVoiceId?.slice(0, 16)}...\n`;
          resultText += `   Style: ${service.title} with personal avatar\n\n`;
          
          if (id === "video-lab") {
            resultText += `🎬 თქვენი ავატარი გამოჩნდება ვიდეოში\n`;
            resultText += `🎙️ ხმოვანი კომენტარი თქვენი კლონირებული ხმით\n`;
          } else if (id === "image-generator") {
            resultText += `🎨 თქვენი ავატარი გამოსახულია სურათში\n`;
            resultText += `✨ სტილი: ${service.title}\n`;
          } else if (id === "music-generator") {
            resultText += `🎵 მუსიკა შექმნილია თქვენი ხმის პროფილით\n`;
            resultText += `🎤 შესაძლებელია ვოკალის დამატება\n`;
          } else if (id === "voice-studio") {
            resultText += `🎙️ ხმის კლონი წარმატებით გამოყენებულია\n`;
            resultText += `🗣️ ინტონაცია: ბუნებრივი\n`;
          }
        }
        
        resultText += `\n✅ მზადაა ჩამოტვირთვისთვის!`;
        
        setResult(resultText);
        setIsGenerating(false);
      }, 3000);
      
    } catch (error) {
      console.error("Generation error:", error);
      setIdentityError(true);
      setIsGenerating(false);
    }
  };

  // Render identity error state
  if (identityError) {
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
              <p className="text-xs text-gray-500">{globalAvatarId ? 'Established' : 'Not created'}</p>
            </div>
            <div className={`p-6 rounded-2xl border ${globalVoiceId ? 'border-[#00FFFF] bg-[#00FFFF]/10' : 'border-[#D4AF37]/30 bg-[#0A0A0A]'}`}>
              <Volume2 className={`w-8 h-8 mx-auto mb-3 ${globalVoiceId ? 'text-[#00FFFF]' : 'text-gray-600'}`} />
              <p className="font-semibold mb-1">{globalVoiceId ? 'Voice Ready' : 'Voice Required'}</p>
              <p className="text-xs text-gray-500">{globalVoiceId ? 'Cloned' : 'Not created'}</p>
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

      {/* Hero Section */}
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
            {/* Input Area */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">🎯 შეყვანა</h3>
                <div className="flex gap-2">
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Upload">
                    <Upload className="w-5 h-5" />
                  </button>
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Settings">
                    <Settings className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={service.placeholder}
                className="w-full h-40 bg-black/30 border border-white/20 rounded-xl p-4 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none resize-none"
              />
              
              {/* Progress Bar */}
              {isGenerating && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span>გენერაცია...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full bg-gradient-to-r ${service.color}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center mt-4">
                <div className="flex gap-2">
                  <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10">
                    <Mic className="w-5 h-5" />
                  </button>
                  <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10">
                    <ImageIcon className="w-5 h-5" />
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
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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

            {/* Result Area */}
            {result && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold">✨ შედეგი</h3>
                  <div className="flex gap-2">
                    <button className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Download">
                      <Download className="w-5 h-5" />
                    </button>
                    <button className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Share">
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="bg-black/30 rounded-xl p-4 whitespace-pre-wrap font-mono text-sm">
                  {result}
                </div>
                <div className="flex gap-3 mt-4">
                  <button className={`flex-1 py-3 bg-gradient-to-r ${service.color} rounded-xl font-semibold hover:opacity-90 transition-opacity`}>
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
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                {hasIdentity ? <Check className="w-5 h-5 text-[#00FFFF]" /> : <User className="w-5 h-5" />}
                Identity Status
              </h3>
              
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
                  <div className="flex items-center gap-2 text-sm text-[#00FFFF]">
                    <Check className="w-4 h-4" />
                    <span>Ready for identity-bound generation</span>
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

            {/* AI Assistant Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-2xl p-6"
            >
              <h3 className="text-xl font-semibold mb-2">💬 AI ჩათბოტი</h3>
              <p className="text-gray-400 text-sm mb-4">დაგეხმარებათ სერვისის გამოყენებაში</p>
              <button className="w-full py-3 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-xl transition-colors flex items-center justify-center gap-2">
                <MessageSquare className="w-5 h-5" />
                ჩათის დაწყება
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
