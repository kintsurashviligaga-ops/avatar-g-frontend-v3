"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import ServicesSlider from "@/components/ServicesSlider";
import LanguageToggle from "@/components/LanguageToggle";

export default function WorkspacePage() {
  const [input, setInput] = useState("");
  const [isOnline] = useState(true);

  const handleSend = () => {
    if (!input.trim()) return;
    console.log("Message sent:", input);
    setInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-[#05070A] text-[#E5E7EB] flex flex-col">
      <header className="border-b border-cyan-500/20 bg-white/5 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            <span className="font-bold text-lg">Avatar G</span>
          </div>
          <h1 className="text-sm sm:text-base font-medium">სამუშაო არე</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-400" : "bg-red-400"} animate-pulse`} />
              <span className="text-xs hidden sm:inline">ონლაინ</span>
            </div>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-5xl h-[calc(100vh-8rem)] flex flex-col">
          <div className="flex-1 bg-white/5 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-2xl shadow-cyan-500/10 flex flex-col">
            <div className="p-4 border-b border-cyan-500/10">
              <ServicesSlider />
            </div>

            <div className="flex-1 p-6 flex flex-col items-center justify-center">
              <div className="w-48 h-48 bg-gradient-to-br from-cyan-500/40 to-blue-500/40 rounded-full border border-cyan-500/40 shadow-2xl shadow-cyan-500/50" />
              <div className="text-center space-y-4 mt-8 max-w-md">
                <h2 className="text-2xl font-semibold text-cyan-400">გამარჯობა, Avatar G-ზე</h2>
                <p className="text-sm text-slate-400">აირჩიე სერვისი ზემოდან ან დაწერე შენი მოთხოვნა</p>
              </div>
              <div className="flex gap-3 mt-6">
                <button className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25">
                  დაიწყე შექმნა
                </button>
                <button className="px-6 py-3 bg-white/10 hover:bg-white/20 text-slate-200 rounded-lg font-medium transition-colors border border-cyan-500/30">
                  გაიგე მეტი
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-cyan-500/10">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="დაწერე შენი მოთხოვნა..."
                  className="flex-1 bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="px-4 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-lg shadow-cyan-500/25"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
