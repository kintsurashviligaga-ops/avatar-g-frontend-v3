'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Image as ImageIcon, Sparkles, Wand2, Palette } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';

export default function ImageCreatorPage() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    // TODO: Connect to image generation API
    setTimeout(() => setIsGenerating(false), 3000);
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
              <ImageIcon className="w-4 h-4 text-amber-400" />
              <span className="text-amber-300 text-sm font-medium">Image Creator</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              Generate <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">Stunning AI Images</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Create professional images with AI-powered generation, upscaling, and style transfer
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-white mb-4">Describe Your Image</h2>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A majestic dragon flying over a medieval castle at sunset, highly detailed, fantasy art..."
                  className="w-full h-32 bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-amber-500/50"
                />
                
                <Button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 mt-4"
                >
                  {isGenerating ? (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      Generate Image
                    </>
                  )}
                </Button>
              </Card>

              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm mt-6">
                <h2 className="text-xl font-semibold text-white mb-4">Generated Images</h2>
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="aspect-square bg-black/50 rounded-lg border border-white/10 flex items-center justify-center">
                      <div className="text-center">
                        <Palette className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                        <p className="text-xs text-gray-500">Image {i}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-4">Image Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Style</label>
                    <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white">
                      <option>Realistic</option>
                      <option>Artistic</option>
                      <option>Anime</option>
                      <option>3D Render</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Aspect Ratio</label>
                    <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white">
                      <option>1:1 Square</option>
                      <option>16:9 Landscape</option>
                      <option>9:16 Portrait</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Quality</label>
                    <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white">
                      <option>Standard</option>
                      <option>HD</option>
                      <option>Ultra HD</option>
                    </select>
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-2">Credits</h3>
                <p className="text-2xl font-bold text-amber-300 mb-1">8 credits</p>
                <p className="text-sm text-gray-400">per image</p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
