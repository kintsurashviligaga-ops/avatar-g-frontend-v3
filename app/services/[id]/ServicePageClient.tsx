"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";
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
  Settings
} from "lucide-react";

interface ServicePageClientProps {
  id: string;
}

const services = {
  "video-lab": {
    icon: Video,
    title: "Video Cine-Lab",
    description: "პროფესიონალური AI ვიდეო გენერაცია",
    features: ["15 წამიანი კლიპები", "Cinematic ხარისხი", "მულტიმოდალური AI", "4K რეზოლუცია"],
    placeholder: "აღწერეთ თქვენი ვიდეო... (მაგ: 'ქართული ფეხბურთის მატჩი, საღამოს სანათი, დინამიკური კადრები')",
    color: "from-purple-500 to-pink-600",
    sampleOutputs: ["video-1.mp4", "video-2.mp4", "video-3.mp4"]
  },
  "image-generator": {
    icon: ImageIcon,
    title: "Image Forge",
    description: "AI სურათების გენერაცია",
    features: ["4K ხარისხი", "სტილის კონტროლი", "Inpainting", "Outpainting"],
    placeholder: "აღწერეთ სურათი... (მაგ: 'ფუტურისტული ქალაქი, ნეონური განათება, cyberpunk სტილი')",
    color: "from-cyan-500 to-blue-600",
    sampleOutputs: ["image-1.png", "image-2.png", "image-3.png"]
  },
  "text-intelligence": {
    icon: MessageSquare,
    title: "Text Intelligence",
    description: "AI ტექსტის გენერაცია და ანალიზი",
    features: ["GPT-4 ინტეგრაცია", "მრავალენოვანი", "კონტექსტური გაგება", "Code generation"],
    placeholder: "დაწერეთ რაიმე... (მაგ: 'დამიწერე პოემა თბილისზე')",
    color: "from-emerald-500 to-teal-600",
    sampleOutputs: ["text-1.txt", "text-2.txt", "text-3.txt"]
  },
  "voice-studio": {
    icon: Mic,
    title: "Voice Studio",
    description: "ხმოვანი AI ასისტენტი",
    features: ["TTS/STT", "ხმის კლონირება", "მრავალენოვანი", "Real-time"],
    placeholder: "ჩაწერეთ ან ჩაწერეთ ტექსტი...",
    color: "from-orange-500 to-red-600",
    sampleOutputs: ["voice-1.mp3", "voice-2.mp3", "voice-3.mp3"]
  },
  "code-assistant": {
    icon: Code,
    title: "Code Forge",
    description: "AI კოდის ასისტენტი",
    features: ["ავტომატური კოდი", "Debug", "რეფაქტორინგი", "Documentation"],
    placeholder: "ჩაწერეთ კოდი ან აღწერეთ რა გინდათ...",
    color: "from-indigo-500 to-purple-600",
    sampleOutputs: ["code-1.js", "code-2.py", "code-3.ts"]
  },
  "data-analyst": {
    icon: BarChart3,
    title: "Data Intelligence",
    description: "AI მონაცემთა ანალიზი",
    features: ["ვიზუალიზაცია", "პროგნოზირება", "ავტომატური report-ები", "CSV/Excel"],
    placeholder: "ატვირთეთ მონაცემები ან აღწერეთ ანალიზი...",
    color: "from-rose-500 to-pink-600",
    sampleOutputs: ["chart-1.png", "report-1.pdf", "data-1.csv"]
  }
};

export default function ServicePageClient({ id }: ServicePageClientProps) {
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  const service = services[id as keyof typeof services] || {
    icon: Sparkles,
    title: id.replace(/-/g, " "),
    description: "AI სერვისი",
    features: [],
    placeholder: "შეიყვანეთ ტექსტი...",
    color: "from-cyan-500 to-blue-600",
    sampleOutputs: []
  };
  
  const Icon = service.icon;

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setIsGenerating(true);
    setProgress(0);
    setResult(null);
    
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

    // Simulate AI generation
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setResult(`✨ AI გენერაციის შედეგი:\n\n"${input}"\n\n🎯 სერვისი: ${service.title}\n⏱️ დრო: 2.3 წამი\n📊 ხარისხი: 98.5%\n\n✅ მზადაა ჩამოტვირთვისთვის!`);
      setIsGenerating(false);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-20">
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

            {/* Sample Outputs */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
            >
              <h3 className="text-xl font-semibold mb-4">🎨 მაგალითები</h3>
              <div className="grid grid-cols-3 gap-2">
                {service.sampleOutputs.map((sample, idx) => (
                  <div key={idx} className="aspect-square bg-white/5 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer border border-white/10">
                    <Icon className="w-8 h-8 opacity-50" />
                  </div>
                ))}
              </div>
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
