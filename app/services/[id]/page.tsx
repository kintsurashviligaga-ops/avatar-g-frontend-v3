"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, MessageSquare, Image, Music, Video, Wand2, Gamepad2, Briefcase, Zap, Bot, Loader2, Send, Mic } from "lucide-react";
import SpaceSingularityBackground from "@/components/SpaceSingularityBackground";
import GlobalChatbot from "@/components/GlobalChatbot";
import ImageGenerator from "@/components/ImageGenerator";

const services = {
  "text-intelligence": { title: "ტექსტის ინტელექტი", description: "პროფესიონალური წერა და ანალიზი AI-ს დახმარებით", icon: MessageSquare, color: "from-cyan-500 to-blue-500", features: ["ტექსტის გენერაცია", "გრამატიკის შემოწმება", "თარგმანი", "რეზიუმე"] },
  "prompt-builder": { title: "პრომპტის ბილდერი", description: "AI პრომპტების ოპტიმიზაცია და გაუმჯობესება", icon: Sparkles, color: "from-violet-500 to-purple-500", features: ["პრომპტის ოპტიმიზაცია", "ტემპლეიტები", "ვერსიების შედარება"] },
  "image-generator": { title: "სურათის გენერატორი", description: "AI სურათების შექმნა ტექსტური აღწერილობიდან", icon: Image, color: "from-pink-500 to-rose-500", features: ["ტექსტიდან სურათი", "სტილის ცვლილება", "რეზოლუციის მორგება"] },
  "image-architect": { title: "სურათის არქიტექტორი", description: "დიზაინის სისტემები და ვიზუალური კონტენტი", icon: Wand2, color: "from-indigo-500 to-blue-600", features: ["ლოგოს დიზაინი", "ბრენდინგი", "UI/UX კონცეპტები"] },
  "music-studio": { title: "მუსიკის სტუდია", description: "AI მუსიკის შექმნა და რედაქტირება", icon: Music, color: "from-amber-500 to-orange-500", features: ["მუსიკის გენერაცია", "ხმის ეფექტები", "აუდიო რედაქტირება"] },
  "voice-lab": { title: "ხმის ლაბორატორია", description: "ხმის გენერაცია, კლონირება და ეფექტები", icon: Bot, color: "from-emerald-500 to-teal-500", features: ["ხმის კლონირება", "ტექსტიდან ხმა", "ხმის ეფექტები"] },
  "video-generator": { title: "ვიდეო გენერატორი", description: "AI ვიდეოების შექმნა და რედაქტირება", icon: Video, color: "from-red-500 to-pink-500", features: ["ტექსტიდან ვიდეო", "სურათიდან ვიდეო", "ვიდეო რედაქტირება"] },
  "video-cine-lab": { title: "ვიდეო კინო ლაბი", description: "კინემატოგრაფიული პროდუქცია AI-ს დახმარებით", icon: Video, color: "from-orange-500 to-red-500", features: ["კინო სცენები", "ვიზუალური ეფექტები", "კოლორიზაცია"] },
  "game-forge": { title: "თამაშის ფორჯი", description: "თამაშის დიზაინი და გენერაცია", icon: Gamepad2, color: "from-emerald-500 to-green-500", features: ["თამაშის კონცეპტები", "აქტივების გენერაცია", "ლეველის დიზაინი"] },
  "ai-production": { title: "AI პროდუქცია", description: "კონტენტის ქარხანა მასობრივი გენერაციისთვის", icon: Zap, color: "from-yellow-500 to-amber-500", features: ["მასობრივი გენერაცია", "ავტომატიზაცია", "კონტენტის პლანირება"] },
  "business-agent": { title: "ბიზნეს აგენტი", description: "ბიზნეს სტრატეგია და ანალიტიკა", icon: Briefcase, color: "from-blue-500 to-indigo-500", features: ["ბიზნეს გეგმა", "ბაზრის ანალიზი", "ფინანსური პროგნოზი"] },
};

export default function ServicePage() {
  const params = useParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  const serviceId = params.id as string;
  const service = services[serviceId as keyof typeof services];

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return <div className="min-h-screen bg-[#05070A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /></div>;

  if (!service) return <div className="min-h-screen bg-[#05070A] flex items-center justify-center"><div className="text-center"><h1 className="text-2xl font-bold text-white mb-4">სერვისი ვერ მოიძებნა</h1><button onClick={() => router.push("/")} className="px-6 py-3 rounded-xl bg-cyan-500 text-white font-semibold hover:bg-cyan-400 transition-colors">მთავარ გვერდზე დაბრუნება</button></div></div>;

  const Icon = service.icon;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070A]">
      <SpaceSingularityBackground />
      <div className="relative z-10">
        <header className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <button onClick={() => router.push("/services")} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /><span>უკან</span></button>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center`}><Icon className="w-5 h-5 text-white" /></div>
                <h1 className="text-xl font-bold text-white hidden sm:block">{service.title}</h1>
              </div>
              <div className="w-20" />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-cyan-500/20`}><Icon className="w-10 h-10 text-white" /></div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{service.title}</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">{service.description}</p>
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              {service.features.map((feature, index) => <span key={index} className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-gray-300">{feature}</span>)}
            </div>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            {serviceId === "image-generator" && <ImageGenerator />}
            {serviceId === "text-intelligence" && <TextTool color={service.color} />}
            {serviceId === "voice-lab" && <VoiceTool color={service.color} />}
            {serviceId === "video-generator" && <VideoTool color={service.color} />}
            {serviceId === "music-studio" && <MusicTool color={service.color} />}
            {!["image-generator", "text-intelligence", "voice-lab", "video-generator", "music-studio"].includes(serviceId) && <div className="glass rounded-2xl p-12 text-center"><div className={`w-20 h-20 rounded-full bg-gradient-to-r ${service.color} flex items-center justify-center mx-auto mb-6`}><Sparkles className="w-10 h-10 text-white" /></div><h3 className="text-xl font-semibold text-white mb-2">მალე დაემატება</h3><p className="text-gray-400">ეს ფუნქცია აქტიურად ვითარდება</p></div>}
          </div>
        </main>
      </div>
      <GlobalChatbot />
    </div>
  );
}

function TextTool({ color }: { color: string }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [action, setAction] = useState<"generate" | "improve" | "translate">("generate");

  const handleProcess = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/openrouter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `${action}: ${input}` }) });
      const data = await response.json();
      setOutput(data.response);
    } catch (error) { console.error(error); } finally { setIsLoading(false); }
  };

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        {[{ id: "generate", label: "გენერაცია" }, { id: "improve", label: "გაუმჯობესება" }, { id: "translate", label: "თარგმანი" }].map((a) => <button key={a.id} onClick={() => setAction(a.id as any)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${action === a.id ? `bg-gradient-to-r ${color} text-white` : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>{a.label}</button>)}
      </div>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="შეიყვანეთ ტექსტი..." className="w-full h-40 bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 resize-none mb-4" />
      <button onClick={handleProcess} disabled={isLoading || !input.trim()} className={`w-full py-3 rounded-xl bg-gradient-to-r ${color} text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2`}>{isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}დამუშავება</button>
      {output && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10"><p className="text-white whitespace-pre-wrap">{output}</p></motion.div>}
    </div>
  );
}

function VoiceTool({ color }: { color: string }) {
  const [isRecording, setIsRecording] = useState(false);
  return <div className="glass rounded-2xl p-6"><div className="text-center py-12"><div className={`w-20 h-20 rounded-full bg-gradient-to-r ${color} flex items-center justify-center mx-auto mb-6`}><Mic className="w-10 h-10 text-white" /></div><h3 className="text-xl font-semibold text-white mb-2">ხმის ჩაწერა</h3><p className="text-gray-400 mb-6">დააჭირეთ ჩასაწერად</p><button onClick={() => setIsRecording(!isRecording)} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isRecording ? "bg-red-500 animate-pulse" : `bg-gradient-to-r ${color} hover:scale-110`}`}>{isRecording ? <span className="w-6 h-6 bg-white rounded-sm" /> : <Mic className="w-6 h-6 text-white" />}</button></div></div>;
}

function VideoTool({ color }: { color: string }) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  return <div className="glass rounded-2xl p-6"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="აღწერეთ ვიდეო..." className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 resize-none mb-4" /><button onClick={() => setIsGenerating(true)} disabled={isGenerating} className={`w-full py-4 rounded-xl bg-gradient-to-r ${color} text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2`}>{isGenerating ? <><Loader2 className="w-5 h-5 animate-spin" />ვიდეოს გენერაცია...</> : <><Video className="w-5 h-5" />ვიდეოს გენერაცია</>}</button></div>;
}

function MusicTool({ color }: { color: string }) {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("electronic");
  return <div className="glass rounded-2xl p-6"><div className="flex gap-2 mb-4 overflow-x-auto pb-2">{["electronic", "classical", "jazz", "rock", "pop"].map((g) => <button key={g} onClick={() => setGenre(g)} className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${genre === g ? `bg-gradient-to-r ${color} text-white` : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>{g}</button>)}</div><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="აღწერეთ მუსიკა..." className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 resize-none mb-4" /><button className={`w-full py-4 rounded-xl bg-gradient-to-r ${color} text-white font-semibold flex items-center justify-center gap-2`}><Music className="w-5 h-5" />მუსიკის გენერაცია</button></div>;
}
