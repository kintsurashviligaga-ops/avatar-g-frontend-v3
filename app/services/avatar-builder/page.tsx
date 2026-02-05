"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { User, Scan, Palette, Sparkles, Download, Share2, Camera, Sliders, Undo, Redo, Layers } from "lucide-react"
import { ServiceShell } from "@/components/shared/ServiceShell"
import { FeatureCard } from "@/components/shared/FeatureCard"
import { WorkspacePanel } from "@/components/shared/WorkspacePanel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Tabs } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

const features = [
  { id: 'scan', title: '3D Biometric Scan', description: 'Capture facial geometry with precision', icon: <Scan size={24} />, gradient: 'from-cyan-400 to-blue-500' },
  { id: 'customize', title: 'Deep Customization', description: 'Fine-tune every facial feature', icon: <Sliders size={24} />, gradient: 'from-purple-400 to-pink-500' },
  { id: 'style', title: 'AI Style Transfer', description: 'Apply artistic styles to your avatar', icon: <Palette size={24} />, gradient: 'from-orange-400 to-red-500' },
  { id: 'enhance', title: 'Neural Enhancement', description: 'AI-powered quality improvement', icon: <Sparkles size={24} />, gradient: 'from-green-400 to-emerald-500' },
]

const customizationOptions = [
  { label: 'Face Shape', min: 0, max: 100, default: 50 },
  { label: 'Skin Tone', min: 0, max: 100, default: 30 },
  { label: 'Eye Size', min: 0, max: 100, default: 60 },
  { label: 'Nose Shape', min: 0, max: 100, default: 45 },
  { label: 'Mouth Width', min: 0, max: 100, default: 50 },
  { label: 'Hair Volume', min: 0, max: 100, default: 70 },
]

export default function AvatarBuilderPage() {
  const [activeFeature, setActiveFeature] = useState('scan')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [avatarState, setAvatarState] = useState({
    isScanning: false,
    scanProgress: 0,
    customization: {} as Record<string, number>
  })

  const handleScan = () => {
    setAvatarState(prev => ({ ...prev, isScanning: true }))
    let progress = 0
    const interval = setInterval(() => {
      progress += 2
      setAvatarState(prev => ({ ...prev, scanProgress: progress }))
      if (progress >= 100) {
        clearInterval(interval)
        setAvatarState(prev => ({ ...prev, isScanning: false, scanProgress: 100 }))
      }
    }, 50)
  }

  return (
    <ServiceShell
      title="Avatar Builder"
      subtitle="Create your digital twin with neural precision and biometric accuracy"
      gradient="from-cyan-400 to-blue-500"
      actions={
        <>
          <Button variant="secondary" size="sm">
            <Undo size={16} className="mr-2" /> Undo
          </Button>
          <Button variant="secondary" size="sm">
            <Redo size={16} className="mr-2" /> Redo
          </Button>
          <Button variant="primary" size="sm">
            <Download size={16} className="mr-2" /> Export
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Preview Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="aspect-square max-h-[600px] flex items-center justify-center relative overflow-hidden" glow>
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: 'linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)',
                backgroundSize: '40px 40px'
              }} />
            </div>

            {/* Avatar Preview */}
            <div className="relative z-10">
              <motion.div
                animate={avatarState.isScanning ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-64 h-64 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 border-2 border-cyan-500/30 flex items-center justify-center relative overflow-hidden"
              >
                <User size={80} className="text-cyan-400" />
                
                {/* Scanning Effect */}
                {avatarState.isScanning && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent"
                    animate={{ y: ['-100%', '100%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  />
                )}
              </motion.div>

              {/* Progress Ring */}
              {avatarState.isScanning && (
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="50%"
                    cy="50%"
                    r="140"
                    fill="none"
                    stroke="rgba(6,182,212,0.2)"
                    strokeWidth="4"
                  />
                  <motion.circle
                    cx="50%"
                    cy="50%"
                    r="140"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={880}
                    strokeDashoffset={880 - (880 * avatarState.scanProgress) / 100}
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                </svg>
              )}
            </div>

            {/* Floating Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
              <Button variant="secondary" size="sm">
                <Camera size={16} className="mr-2" /> Capture
              </Button>
              <Button variant="glow" size="sm" onClick={handleScan} disabled={avatarState.isScanning}>
                <Scan size={16} className="mr-2" /> 
                {avatarState.isScanning ? 'Scanning...' : '3D Scan'}
              </Button>
            </div>
          </Card>

          {/* Feature Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {features.map((feature) => (
              <FeatureCard
                key={feature.id}
                {...feature}
                isActive={activeFeature === feature.id}
                onClick={() => {
                  setActiveFeature(feature.id)
                  setIsPanelOpen(true)
                }}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Layers size={20} className="text-cyan-400" /> Layers
            </h3>
            <div className="space-y-3">
              {['Base Model', 'Skin Texture', 'Eyes', 'Hair', 'Clothing', 'Accessories'].map((layer, i) => (
                <div key={layer} className="flex items-center justify-between p-3 bg-[#05070A] rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </div>
                    <span className="text-sm">{layer}</span>
                  </div>
                  <Badge variant={i < 3 ? 'success' : 'default'}>
                    {i < 3 ? 'Active' : 'Hidden'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="sm">
                <Share2 size={16} className="mr-2" /> Share
              </Button>
              <Button variant="outline" size="sm">
                <Download size={16} className="mr-2" /> Save
              </Button>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
            <h3 className="text-lg font-semibold mb-2">Pro Tip</h3>
            <p className="text-sm text-gray-400">
              Use the 3D biometric scan for the most accurate facial geometry capture. The AI will automatically optimize your avatar for various use cases.
            </p>
          </Card>
        </div>
      </div>

      {/* Workspace Panel */}
      <WorkspacePanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        title={features.find(f => f.id === activeFeature)?.title || 'Workspace'}
      >
        {activeFeature === 'customize' && (
          <div className="space-y-6">
            <p className="text-gray-400">Adjust facial features with precision controls</p>
            {customizationOptions.map((option) => (
              <Slider
                key={option.label}
                label={option.label}
                defaultValue={option.default}
                onChange={(value) => setAvatarState(prev => ({
                  ...prev,
                  customization: { ...prev.customization, [option.label]: value }
                }))}
              />
            ))}
          </div>
        )}
        
        {activeFeature === 'style' && (
          <div className="grid grid-cols-2 gap-4">
            {['Realistic', 'Cartoon', 'Cyberpunk', 'Fantasy', 'Minimal', 'Artistic'].map((style) => (
              <motion.div
                key={style}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="aspect-square rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center cursor-pointer hover:border-purple-500/50 transition-colors"
              >
                <span className="font-semibold">{style}</span>
              </motion.div>
            ))}
          </div>
        )}

        {activeFeature === 'scan' && (
          <div className="text-center py-12">
            <Scan size={64} className="mx-auto text-cyan-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2">3D Biometric Scan</h3>
            <p className="text-gray-400 mb-6">Position your face in the center and follow the on-screen instructions</p>
            <Button variant="glow" onClick={handleScan} disabled={avatarState.isScanning}>
              {avatarState.isScanning ? 'Scanning...' : 'Start Scan'}
            </Button>
          </div>
        )}
      </WorkspacePanel>
    </ServiceShell>
  )
}
