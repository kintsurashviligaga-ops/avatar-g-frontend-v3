"use client";

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, Upload, Sparkles, Shield, Check, RefreshCw, 
  Download, Share2, Palette, User, Scan, Cpu, Dna, ChevronLeft 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useIdentityStore } from '@/store/identity-store';
import { toast } from '@/components/ui/use-toast';
import SpaceBackground from '@/components/SpaceBackground';
import Link from 'next/link';

const STYLES = [
  { id: 'business', name: 'Corporate Executive', icon: '💼', color: '#00D4FF', desc: 'Professional attire for business environments' },
  { id: 'formal', name: 'Galactic Ambassador', icon: '🌌', color: '#9D4EDD', desc: 'Formal wear for interstellar diplomacy' },
  { id: 'creative', name: 'Nebula Artist', icon: '🎨', color: '#FF6B35', desc: 'Expressive style for creative endeavors' },
  { id: 'casual', name: 'Station Casual', icon: '👕', color: '#06FFA5', desc: 'Comfortable attire for daily operations' },
  { id: 'tactical', name: 'Void Ranger', icon: '🚀', color: '#FFD700', desc: 'Field-ready gear for space exploration' },
  { id: 'elegant', name: 'Starlight Elite', icon: '✨', color: '#FF006E', desc: 'Luxurious style for high-society events' },
];

const FEATURES = [
  { icon: Scan, title: '3D Facial Mapping', desc: '32-point mesh analysis' },
  { icon: Cpu, title: 'Neural Processing', desc: 'AI-enhanced features' },
  { icon: Dna, title: 'Biometric Sync', desc: 'Identity verification' },
];

export default function AvatarBuilderPage() {
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState(0);
  const [selectedStyle, setSelectedStyle] = useState('business');
  const [quality, setQuality] = useState(85);
  const [scanProgress, setScanProgress] = useState(0);
  const { setAvatar, avatar } = useIdentityStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCapturedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const processAvatar = async () => {
    if (!capturedImage) return;
    setIsProcessing(true);
    
    const stages = ['Scanning facial geometry...', 'Analyzing biometric data...', 'Generating neural mesh...', 'Applying style presets...', 'Finalizing avatar...'];
    
    for (let i = 0; i < stages.length; i++) {
      setProcessingStage(i);
      setScanProgress((i + 1) * 20);
      await new Promise(r => setTimeout(r, 800));
    }

    const newAvatar = {
      id: `avatar_${Date.now()}`,
      name: 'Digital Twin',
      imageUrl: capturedImage,
      facialGeometry: { meshPoints: 468, depthAccuracy: 0.98, symmetry: 0.96, expressionRange: 127 },
      stylePreferences: [selectedStyle],
      neuralSignature: `ns_${Math.random().toString(36).substr(2, 16)}`,
      createdAt: new Date().toISOString(),
    };
    
    setAvatar(newAvatar);
    setIsProcessing(false);
    setScanProgress(0);
    toast({ title: "✅ Avatar Synthesized", description: "Your digital twin has been encoded to the singularity." });
  };

  return (
    <div className="min-h-screen bg-[#000208] text-white relative overflow-hidden">
      <SpaceBackground />
      
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-cyan-500/20">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="outline" size="icon" className="border-cyan-500/30 hover:bg-cyan-500/10">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-glow">Avatar Synthesis</h1>
            <p className="text-cyan-400/60 text-xs font-mono">BIOMETRIC IDENTITY ENCODER</p>
          </div>
        </div>
        <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-mono">
          <Scan className="w-3 h-3 mr-1" /> SYSTEM ACTIVE
        </Badge>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="glass-panel p-6 h-full">
              <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-black/30 mb-6 p-1">
                  <TabsTrigger value="camera" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                    <Camera className="w-4 h-4 mr-2" /> Neural Scan
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                    <Upload className="w-4 h-4 mr-2" /> Data Upload
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="camera" className="mt-0">
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black/50 border-2 border-cyan-500/30 flex items-center justify-center">
                    <AnimatePresence>
                      {capturedImage ? (
                        <motion.img initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <div className="w-24 h-24 mx-auto mb-4 rounded-full border-2 border-dashed border-cyan-500/30 flex items-center justify-center">
                            <Scan className="w-10 h-10 text-cyan-400/50 animate-pulse" />
                          </div>
                          <p className="text-cyan-400/50 font-mono text-sm">AWAITING BIOMETRIC INPUT</p>
                        </div>
                      )}
                    </AnimatePresence>
                    
                    {!capturedImage && (
                      <div className="absolute inset-0 pointer-events-none">
                        <motion.div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" animate={{ top: ['10%', '90%', '10%'] }} transition={{ duration: 3, repeat: Infinity }} />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 mt-6">
                    {!capturedImage ? (
                      <Button onClick={() => setCapturedImage('/api/placeholder/400/400')} className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 cyan-glow font-mono">
                        <Camera className="w-4 h-4 mr-2" /> INITIATE SCAN
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" onClick={() => setCapturedImage(null)} className="flex-1 border-cyan-500/30 hover:bg-cyan-500/10 font-mono">
                          <RefreshCw className="w-4 h-4 mr-2" /> RESET
                        </Button>
                        <Button onClick={processAvatar} disabled={isProcessing} className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 cyan-glow font-mono">
                          {isProcessing ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> PROCESSING...</> : <><Sparkles className="w-4 h-4 mr-2" /> SYNTHESIZE}
                        </Button>
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="upload" className="mt-0">
                  <div className="border-2 border-dashed border-cyan-500/30 rounded-xl p-12 text-center hover:border-cyan-500/50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" ref={fileInputRef} />
                    <Upload className="w-12 h-12 mx-auto mb-4 text-cyan-400/50" />
                    <p className="text-lg font-medium mb-2 font-mono">UPLOAD BIOMETRIC DATA</p>
                    <p className="text-sm text-cyan-400/50">Drop file or click to browse</p>
                  </div>
                </TabsContent>
              </Tabs>

              {isProcessing && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-4 glass-panel rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-cyan-400">
                      {['Scanning facial geometry...', 'Analyzing biometric data...', 'Generating neural mesh...', 'Applying style presets...', 'Finalizing avatar...'][processingStage]}
                    </span>
                    <span className="text-sm font-mono text-cyan-400">{scanProgress}%</span>
                  </div>
                  <Progress value={scanProgress} className="h-2 bg-cyan-950" />
                </motion.div>
              )}
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <Card className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold font-mono">VISUAL PRESETS</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {STYLES.map((style) => (
                  <button key={style.id} onClick={() => setSelectedStyle(style.id)} className={`p-4 rounded-xl border transition-all duration-300 text-left group ${selectedStyle === style.id ? 'border-cyan-400 bg-cyan-500/20 cyan-glow' : 'border-cyan-500/20 hover:border-cyan-500/40 bg-black/20'}`}>
                    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">{style.icon}</div>
                    <div className="font-medium text-sm font-mono" style={{ color: style.color }}>{style.name}</div>
                    <div className="text-xs text-cyan-400/50 mt-1">{style.desc}</div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-lg font-semibold font-mono">RENDER QUALITY</h3>
                </div>
                <Badge className="border-cyan-400/30 text-cyan-400 font-mono">{quality}%</Badge>
              </div>
              <Slider value={[quality]} onValueChange={(v) => setQuality(v[0])} max={100} step={5} className="mb-4" />
            </Card>

            {avatar && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="glass-panel p-6 border-green-500/30 bg-green-500/5">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-green-400 cyan-glow">
                      <img src={avatar.imageUrl} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Check className="w-5 h-5 text-green-400" />
                        <h3 className="font-semibold text-green-400 font-mono">IDENTITY ENCODED</h3>
                      </div>
                      <p className="text-xs text-cyan-400/70 font-mono">ID: {avatar.id.slice(0, 20)}...</p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" className="border-cyan-500/30 font-mono text-xs">
                          <Download className="w-3 h-3 mr-1" /> EXPORT
                        </Button>
                        <Button size="sm" variant="outline" className="border-cyan-500/30 font-mono text-xs">
                          <Share2 className="w-3 h-3 mr-1" /> BROADCAST
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
