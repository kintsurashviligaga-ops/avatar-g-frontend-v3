'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, Play, Sparkles, Wand2 } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';

export default function VoiceLabPage() {
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    // TODO: Connect to voice generation API
    setTimeout(() => setIsGenerating(false), 2000);
  };

  return (
    <main className="relative min-h-screen bg-[#05070A]">
      <SpaceBackground />
      
      <div className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-full mb-4">
              <Mic className="w-4 h-4 text-amber-400" />
              <span className="text-amber-300 text-sm font-medium">ხმის ლაბორატორია</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              დააკლონე და მოარგე <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">შენი ხმა</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              პროფესიონალური ხმის კლონირება, ტექსტი-ხმაში და მრავალენოვანი სინთეზი
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-white mb-4">ტექსტი ხმაში</h2>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="შეიყვანე ტექსტი, რომელსაც ხმად გადააქცევ..."
                  className="w-full h-32 bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-amber-500/50"
                />
                
                <div className="flex gap-3 mt-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={!text.trim() || isGenerating}
                    className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                  >
                    {isGenerating ? (
                      <>
                        <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                        გენერაცია მიმდინარეობს...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        ხმის გენერაცია
                      </>
                    )}
                  </Button>
                </div>
              </Card>

              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm mt-6">
                <h2 className="text-xl font-semibold text-white mb-4">ხმის ნიმუშები</h2>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-black/30 border border-white/10 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                          <Mic className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-white font-medium">ხმის ნიმუში {i}</p>
                          <p className="text-sm text-gray-400">2:30</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Play className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-4">ხმის პარამეტრები</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">ხმის მოდელი</label>
                    <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white">
                      <option>ჩემი ხმის კლონი</option>
                      <option>პროფესიონალი მამაკაცი</option>
                      <option>პროფესიონალი ქალი</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">ენა</label>
                    <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white">
                      <option>ინგლისური</option>
                      <option>ესპანური</option>
                      <option>ფრანგული</option>
                      <option>გერმანული</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">სიჩქარე</label>
                    <input type="range" min="0.5" max="2" step="0.1" defaultValue="1" className="w-full" />
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-2">კრედიტები</h3>
                <p className="text-2xl font-bold text-amber-300 mb-1">50 კრედიტი</p>
                <p className="text-sm text-gray-400">თითო ხმის კლონზე</p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
