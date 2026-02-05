"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Code, Copy, Check, Play, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import SpaceBackground from "@/components/SpaceBackground";
import Header from "@/components/Header";

export default function CodeServicePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      setCode(`// AI Generated Code\nfunction greet(name) {\n  return "Hello, " + name + "!";\n}\n\nconsole.log(greet("World"));`);
      setIsGenerating(false);
    }, 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <Header />
      <section className="pt-24 pb-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => router.push("/services")} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10">
              <ArrowLeft className="w-5 h-5 text-gray-300" />
            </motion.button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center"><Code className="w-5 h-5 text-white" /></div>
              <div><h1 className="text-xl font-bold text-white">კოდის გენერატორი</h1><p className="text-sm text-gray-400">GitHub Copilot, CodeT5</p></div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                <label className="block text-sm font-medium text-gray-300 mb-2">აღწერე რა კოდი გჭირდება</label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="მაგ: React კომპონენტი ღილაკისთვის..." rows={6} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 resize-none focus:outline-none focus:border-indigo-500/50" />
                <div className="flex items-center gap-2 mt-4">
                  <select className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-gray-300 text-sm">
                    <option>JavaScript</option>
                    <option>TypeScript</option>
                    <option>Python</option>
                    <option>React</option>
                  </select>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleGenerate} disabled={!prompt.trim() || isGenerating} className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium rounded-xl disabled:opacity-50 flex items-center gap-2">
                    {isGenerating ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />გენერირება...</> : <><Sparkles className="w-4 h-4" />შექმნა</>}
                  </motion.button>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="p-6 rounded-2xl bg-black/50 border border-white/10 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-400">შედეგი</span>
                <div className="flex items-center gap-2">
                  <motion.button whileHover={{ scale: 1.05 }} onClick={handleCopy} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.05 }} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300"><Play className="w-4 h-4" /></motion.button>
                </div>
              </div>
              <pre className="font-mono text-sm text-gray-300 overflow-x-auto"><code>{code || "// კოდი გამოჩნდება აქ"}</code></pre>
            </motion.div>
          </div>
        </div>
      </section>
    </main>
  );
}
