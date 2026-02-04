"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image, Loader2, Download, RefreshCw, Sparkles } from "lucide-react";

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState("");

  const generateImage = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError("");
    setGeneratedImage(null);

    try {
      const response = await fetch("/api/image-generator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      if (!response.ok) throw new Error("Generation failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setGeneratedImage(url);
    } catch (err) {
      setError("სურათის გენერაცია ვერ მოხერხდა.");
    } finally { setIsGenerating(false); }
  };

  const downloadImage = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = `avatar-g-${Date.now()}.png`;
    link.click();
  };

  const examplePrompts = ["ქართული სახლი მთებში, მზის ჩასვლისას", "ფუტურისტული თბილისი, კიბერპანკ სტილი", "ქართული ტრადიციული ცეკვა, აბსტრაქტული ხელოვნება"];

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="glass rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center"><Image className="w-6 h-6 text-white" /></div>
          <div><h2 className="text-2xl font-bold text-white">AI სურათის გენერატორი</h2><p className="text-gray-400">Stability AI - Stable Diffusion XL</p></div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {examplePrompts.map((example, index) => <button key={index} onClick={() => setPrompt(example)} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-colors">{example}</button>)}
        </div>

        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="აღწერეთ რა სურათი გინდათ..." className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50 resize-none mb-4" />

        <button onClick={generateImage} disabled={isGenerating || !prompt.trim()} className="w-full py-4 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-pink-400 hover:to-rose-400 transition-all flex items-center justify-center gap-2">
          {isGenerating ? <><Loader2 className="w-5 h-5 animate-spin" />გენერაცია მიმდინარეობს...</> : <><Sparkles className="w-5 h-5" />სურათის გენერაცია</>}
        </button>

        <AnimatePresence>
          {error && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">{error}</motion.div>}
          {generatedImage && <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="relative mt-6"><img src={generatedImage} alt="Generated" className="w-full rounded-xl border border-white/10" /><div className="absolute bottom-4 right-4 flex gap-2"><button onClick={downloadImage} className="p-3 rounded-xl bg-black/50 backdrop-blur text-white hover:bg-black/70 transition-colors"><Download className="w-5 h-5" /></button><button onClick={() => { setGeneratedImage(null); setPrompt(""); }} className="p-3 rounded-xl bg-black/50 backdrop-blur text-white hover:bg-black/70 transition-colors"><RefreshCw className="w-5 h-5" /></button></div></motion.div>}
        </AnimatePresence>
      </div>
    </div>
  );
}
