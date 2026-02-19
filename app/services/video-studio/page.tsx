'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Film, Sparkles, Video, Wand2 } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';

export default function VideoStudioPage() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    // TODO: Connect to video generation API
    setTimeout(() => setIsGenerating(false), 3000);
  };

  return (
    <main className="relative min-h-screen bg-[#05070A]">
      <SpaceBackground />
      
      <div className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/30 rounded-full mb-4">
              <Film className="w-4 h-4 text-violet-400" />
              <span className="text-violet-300 text-sm font-medium">ვიდეო სტუდია</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              შექმენი <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">კინემატიკური ვიდეოები</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              შექმენი პროფესიონალური ვიდეო კონტენტი AI გენერაციით, ანიმაციით და ლიფ-სინქით
            </p>
          </motion.div>

          {/* Generation Interface */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-white mb-4">აღწერე შენი ვიდეო</h2>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="კინემატიკური კადრი გმირისგან, რომელიც დადის ფუტურისტულ ქალაქში, ნეონის შუქები ირეკლება სველ ქუჩებზე..."
                  className="w-full h-32 bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500/50"
                />
                
                <div className="flex gap-3 mt-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isGenerating}
                    className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                  >
                    {isGenerating ? (
                      <>
                        <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                        გენერაცია მიმდინარეობს...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        ვიდეოს გენერაცია
                      </>
                    )}
                  </Button>
                </div>
              </Card>

              {/* Video Preview */}
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm mt-6">
                <h2 className="text-xl font-semibold text-white mb-4">პრევიუ</h2>
                <div className="aspect-video bg-black/50 rounded-lg flex items-center justify-center border border-white/10">
                  <div className="text-center">
                    <Video className="w-16 h-16 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500">შენი ვიდეო აქ გამოჩნდება</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-4">ვიდეო პარამეტრები</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">ხანგრძლივობა</label>
                    <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white">
                      <option>5 წამი</option>
                      <option>10 წამი</option>
                      <option>15 წამი</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">სტილი</label>
                    <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white">
                      <option>კინემატიკური</option>
                      <option>ანიმაციური</option>
                      <option>რეალისტური</option>
                      <option>არტისტული</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">გარჩევადობა</label>
                    <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white">
                      <option>1080p</option>
                      <option>4K</option>
                    </select>
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/30 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-2">კრედიტები</h3>
                <p className="text-2xl font-bold text-violet-300 mb-1">20 კრედიტი</p>
                <p className="text-sm text-gray-400">თითო გენერაციაზე</p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
