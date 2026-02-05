"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  User, Scan, Palette, Sparkles, Download, Share2, Camera, 
  Sliders, Undo, Redo, Layers, Rotate3D, Zap, Save, Trash2,
  ChevronRight, ChevronLeft, Maximize2, Grid3X3, Type
} from "lucide-react"
import { ServiceShell } from "@/components/shared/ServiceShell"
import { FeatureCard } from "@/components/shared/FeatureCard"
import { WorkspacePanel } from "@/components/shared/WorkspacePanel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"

// Feature definitions
const features = [
  { 
    id: 'scan', 
    title: '3D Biometric Scan', 
    description: 'Capture facial geometry with neural precision', 
    icon: <Scan size={24} />, 
    gradient: 'from-cyan-400 to-blue-500',
    color: 'cyan'
  },
  { 
    id: 'customize', 
    title: 'Deep Customization', 
    description: 'Fine-tune every facial feature with AI', 
    icon: <Sliders size={24} />, 
    gradient: 'from-purple-400 to-pink-500',
    color: 'purple'
  },
  { 
    id: 'style', 
    title: 'AI Style Transfer', 
    description: 'Apply artistic styles instantly', 
    icon: <Palette size={24} />, 
    gradient: 'from-orange-400 to-red-500',
    color: 'orange'
  },
  { 
    id: 'enhance', 
    title: 'Neural Enhancement', 
    description: 'AI-powered quality boost', 
    icon: <Sparkles size={24} />, 
    gradient: 'from-green-400 to-emerald-500',
    color: 'green'
  },
]

// Customization options
const customizationGroups = [
  {
    title: "Face Structure",
    options: [
      { id: 'faceShape', label: 'Face Shape', min: 0, max: 100, default: 50, icon: <User size={16} /> },
      { id: 'faceWidth', label: 'Face Width', min: 0, max: 100, default: 50, icon: <Grid3X3 size={16} /> },
      { id: 'jawline', label: 'Jawline Definition', min: 0, max: 100, default: 60, icon: <Zap size={16} /> },
    ]
  },
  {
    title: "Eyes & Brows",
    options: [
      { id: 'eyeSize', label: 'Eye Size', min: 0, max: 100, default: 60, icon: <Maximize2 size={16} /> },
      { id: 'eyeSpacing', label: 'Eye Spacing', min: 0, max: 100, default: 50, icon: <Grid3X3 size={16} /> },
      { id: 'browHeight', label: 'Brow Height', min: 0, max: 100, default: 45, icon: <Type size={16} /> },
    ]
  },
  {
    title: "Nose & Mouth",
    options: [
      { id: 'noseWidth', label: 'Nose Width', min: 0, max: 100, default: 45, icon: <Grid3X3 size={16} /> },
      { id: 'noseHeight', label: 'Nose Height', min: 0, max: 100, default: 50, icon: <Maximize2 size={16} /> },
      { id: 'mouthWidth', label: 'Mouth Width', min: 0, max: 100, default: 50, icon: <Type size={16} /> },
      { id: 'lipFullness', label: 'Lip Fullness', min: 0, max: 100, default: 55, icon: <Zap size={16} /> },
    ]
  },
  {
    title: "Skin & Hair",
    options: [
      { id: 'skinTone', label: 'Skin Tone', min: 0, max: 100, default: 30, icon: <Palette size={16} /> },
      { id: 'skinSmoothness', label: 'Skin Smoothness', min: 0, max: 100, default: 70, icon: <Sparkles size={16} /> },
      { id: 'hairVolume', label: 'Hair Volume', min: 0, max: 100, default: 70, icon: <Layers size={16} /> },
      { id: 'hairColor', label: 'Hair Color', min: 0, max: 100, default: 40, icon: <Palette size={16} /> },
    ]
  },
]

// Style presets
const stylePresets = [
  { id: 'realistic', name: 'Realistic', gradient: 'from-amber-200 to-orange-300', description: 'Photorealistic rendering' },
  { id: 'cartoon', name: 'Cartoon', gradient: 'from-pink-300 to-rose-400', description: 'Animated character style' },
  { id: 'cyberpunk', name: 'Cyberpunk', gradient: 'from-cyan-400 to-purple-500', description: 'Neon futuristic look' },
  { id: 'fantasy', name: 'Fantasy', gradient: 'from-purple-400 to-indigo-500', description: 'Magical ethereal style' },
  { id: 'minimal', name: 'Minimal', gradient: 'from-gray-200 to-gray-400', description: 'Clean simple design' },
  { id: 'artistic', name: 'Artistic', gradient: 'from-yellow-200 to-red-300', description: 'Painterly effect' },
  { id: 'vintage', name: 'Vintage', gradient: 'from-amber-600 to-yellow-700', description: 'Retro classic look' },
  { id: 'anime', name: 'Anime', gradient: 'from-blue-300 to-pink-300', description: 'Japanese animation style' },
]

// Layer types
const layerTypes = [
  { id: 'base', name: 'Base Model', icon: <User size={16} />, active: true, locked: true },
  { id: 'skin', name: 'Skin Texture', icon: <Palette size={16} />, active: true, locked: false },
  { id: 'eyes', name: 'Eyes', icon: <Maximize2 size={16} />, active: true, locked: false },
  { id: 'brows', name: 'Eyebrows', icon: <Type size={16} />, active: true, locked: false },
  { id: 'nose', name: 'Nose', icon: <Grid3X3 size={16} />, active: true, locked: false },
  { id: 'mouth', name: 'Mouth', icon: <Zap size={16} />, active: true, locked: false },
  { id: 'hair', name: 'Hair', icon: <Layers size={16} />, active: true, locked: false },
  { id: 'clothing', name: 'Clothing', icon: <Grid3X3 size={16} />, active: false, locked: false },
  { id: 'accessories', name: 'Accessories', icon: <Sparkles size={16} />, active: false, locked: false },
]

export default function AvatarBuilderPage() {
  const [activeFeature, setActiveFeature] = useState('scan')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelTitle, setPanelTitle] = useState('Workspace')
  const [scanProgress, setScanProgress] = useState(0)
  const [isScanning, setIsScanning] = useState(false)
  const [scanStage, setScanStage] = useState(0)
  const [customization, setCustomization] = useState<Record<string, number>>({})
  const [selectedStyle, setSelectedStyle] = useState('realistic')
  const [layers, setLayers] = useState(layerTypes)
  const [activeLayer, setActiveLayer] = useState('base')
  const [history, setHistory] = useState<any[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [avatarRotation, setAvatarRotation] = useState(0)
  const [isAutoRotating, setIsAutoRotating] = useState(false)

  // Auto-rotation effect
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isAutoRotating) {
      interval = setInterval(() => {
        setAvatarRotation(prev => (prev + 1) % 360)
      }, 50)
    }
    return () => clearInterval(interval)
  }, [isAutoRotating])

  // Handle feature selection
  const handleFeatureClick = (featureId: string) => {
    setActiveFeature(featureId)
    const feature = features.find(f => f.id === featureId)
    if (feature) {
      setPanelTitle(feature.title)
      setIsPanelOpen(true)
    }
  }

  // Start 3D scan simulation
  const startScan = () => {
    setIsScanning(true)
    setScanProgress(0)
    setScanStage(0)
    
    const stages = [
      { progress: 25, stage: 1, message: 'Scanning facial geometry...' },
      { progress: 50, stage: 2, message: 'Capturing texture data...' },
      { progress: 75, stage: 3, message: 'Processing neural data...' },
      { progress: 100, stage: 4, message: 'Scan complete!' },
    ]

    let currentStage = 0
    
    const interval = setInterval(() => {
      setScanProgress(prev => {
        const newProgress = prev + 1
        
        if (currentStage < stages.length && newProgress >= stages[currentStage].progress) {
          setScanStage(stages[currentStage].stage)
          currentStage++
        }
        
        if (newProgress >= 100) {
          clearInterval(interval)
          setTimeout(() => {
            setIsScanning(false)
            setScanStage(0)
          }, 1000)
        }
        
        return newProgress
      })
    }, 50)
  }

  // Handle customization change
  const handleCustomizationChange = (id: string, value: number) => {
    setCustomization(prev => {
      const newValues = { ...prev, [id]: value }
      // Add to history
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push({ ...newValues })
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
      return newValues
    })
  }

  // Undo/Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1)
      setCustomization(history[historyIndex - 1])
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1)
      setCustomization(history[historyIndex + 1])
    }
  }

  // Toggle layer
  const toggleLayer = (layerId: string) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, active: !layer.active } : layer
    ))
  }

  // Render scan stage message
  const getScanMessage = () => {
    const messages = [
      'Initializing sensors...',
      'Scanning facial geometry...',
      'Capturing texture data...',
      'Processing neural data...',
      'Scan complete!'
    ]
    return messages[scanStage] || 'Ready to scan'
  }

  return (
    <ServiceShell
      title="Avatar Builder"
      subtitle="Create your digital twin with neural precision and biometric accuracy"
      gradient="from-cyan-400 to-blue-500"
      actions={
        <>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleUndo}
            disabled={historyIndex <= 0}
          >
            <Undo size={16} className="mr-2" /> Undo
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
          >
            <Redo size={16} className="mr-2" /> Redo
          </Button>
          <Button variant="outline" size="sm">
            <Save size={16} className="mr-2" /> Save
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
          {/* 3D Preview Card */}
          <Card className="aspect-[4/3] max-h-[600px] flex items-center justify-center relative overflow-hidden" glow>
            {/* Animated Background Grid */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute inset-0" style={{
                backgroundImage: 'linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                transform: `perspective(500px) rotateX(60deg) translateY(${scanProgress}%)`
              }} />
            </div>

            {/* Scanning Rings */}
            {isScanning && (
              <>
                <motion.div
                  className="absolute inset-0 border-2 border-cyan-400/30 rounded-full"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div
                  className="absolute inset-8 border-2 border-purple-400/30 rounded-full"
                  animate={{ scale: [1.2, 1, 1.2], opacity: [0, 0.5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                />
              </>
            )}

            {/* Avatar Container */}
            <div className="relative z-10 flex flex-col items-center">
              {/* 3D Avatar */}
              <motion.div
                animate={{ 
                  rotateY: avatarRotation,
                  scale: isScanning ? [1, 1.02, 1] : 1
                }}
                transition={{ duration: 0.1 }}
                className="relative w-64 h-64"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Main Avatar Circle */}
                <div className={`
                  absolute inset-0 rounded-full flex items-center justify-center
                  bg-gradient-to-br from-cyan-400/20 to-blue-500/20
                  border-2 border-cyan-500/30 backdrop-blur-sm
                  ${isScanning ? 'animate-pulse' : ''}
                `}>
                  <User size={80} className="text-cyan-400" />
                </div>

                {/* Scanning Laser Effect */}
                {isScanning && (
                  <motion.div
                    className="absolute inset-0 rounded-full overflow-hidden"
                    style={{ transform: 'translateZ(1px)' }}
                  >
                    <motion.div
                      className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_20px_rgba(6,182,212,0.8)]"
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                  </motion.div>
                )}

                {/* Style Overlay */}
                {selectedStyle && !isScanning && (
                  <div className={`
                    absolute inset-0 rounded-full opacity-30
                    bg-gradient-to-br ${stylePresets.find(s => s.id === selectedStyle)?.gradient || ''}
                  `} />
                )}
              </motion.div>

              {/* Scan Progress */}
              {isScanning && (
                <div className="mt-8 text-center">
                  <div className="relative w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 to-blue-500"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-cyan-400 font-mono">
                    {scanProgress}% - {getScanMessage()}
                  </p>
                </div>
              )}

              {/* Rotation Controls */}
              <div className="mt-6 flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsAutoRotating(!isAutoRotating)}
                >
                  <Rotate3D size={16} className="mr-2" />
                  {isAutoRotating ? 'Stop' : 'Auto Rotate'}
                </Button>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setAvatarRotation(prev => prev - 45)}
                  >
                    <ChevronLeft size={20} />
                  </Button>
                  <span className="text-sm text-gray-400 w-16 text-center">
                    {avatarRotation}°
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setAvatarRotation(prev => prev + 45)}
                  >
                    <ChevronRight size={20} />
                  </Button>
                </div>
              </div>
            </div>

            {/* Floating Action Bar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
              <Button variant="secondary" size="sm">
                <Camera size={16} className="mr-2" /> Capture
              </Button>
              <Button 
                variant="glow" 
                size="sm" 
                onClick={startScan}
                disabled={isScanning}
              >
                <Scan size={16} className="mr-2" />
                {isScanning ? 'Scanning...' : '3D Scan'}
              </Button>
            </div>

            {/* Corner Info */}
            <div className="absolute top-4 right-4 flex gap-2">
              <Badge variant="success">Ready</Badge>
              <Badge variant="default">v2.0</Badge>
            </div>
          </Card>

          {/* Feature Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {features.map((feature) => (
              <FeatureCard
                key={feature.id}
                title={feature.title}
                description={feature.description}
                icon={feature.icon}
                gradient={feature.gradient}
                isActive={activeFeature === feature.id}
                onClick={() => handleFeatureClick(feature.id)}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Layers Panel */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Layers size={20} className="text-cyan-400" /> Layers
              </h3>
              <Button variant="ghost" size="sm">
                <Grid3X3 size={16} />
              </Button>
            </div>
            <div className="space-y-2">
              {layers.map((layer) => (
                <motion.div
                  key={layer.id}
                  whileHover={{ x: 4 }}
                  onClick={() => setActiveLayer(layer.id)}
                  className={`
                    flex items-center justify-between p-3 rounded-lg cursor-pointer
                    ${activeLayer === layer.id ? 'bg-cyan-500/20 border border-cyan-500/30' : 'bg-[#05070A] hover:bg-white/5'}
                    ${!layer.active && 'opacity-50'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-8 h-8 rounded flex items-center justify-center
                      ${activeLayer === layer.id ? 'bg-cyan-500/30 text-cyan-400' : 'bg-white/5 text-gray-400'}
                    `}>
                      {layer.icon}
                    </div>
                    <span className="text-sm font-medium">{layer.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {layer.locked && <span className="text-xs text-gray-500">🔒</span>}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLayer(layer.id)
                      }}
                      className={`
                        w-6 h-6 rounded flex items-center justify-center
                        ${layer.active ? 'bg-cyan-500 text-white' : 'bg-gray-700 text-gray-500'}
                      `}
                    >
                      {layer.active ? '✓' : ''}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>

          {/* Quick Stats */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Avatar Stats</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Polygons</span>
                <span className="font-mono">12,847</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Textures</span>
                <span className="font-mono">4K PBR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">File Size</span>
                <span className="font-mono">24.5 MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last Saved</span>
                <span className="font-mono">Just now</span>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="sm">
                <Share2 size={16} className="mr-2" /> Share
              </Button>
              <Button variant="outline" size="sm">
                <Download size={16} className="mr-2" /> Export
              </Button>
              <Button variant="outline" size="sm" className="col-span-2 text-red-400 hover:bg-red-500/10">
                <Trash2 size={16} className="mr-2" /> Reset Avatar
              </Button>
            </div>
          </Card>

          {/* Pro Tip */}
          <Card className="p-6 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
            <div className="flex items-start gap-3">
              <Sparkles className="text-cyan-400 shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold mb-1">Pro Tip</h4>
                <p className="text-sm text-gray-400">
                  Use the 3D biometric scan for the most accurate facial geometry. 
                  The AI automatically optimizes your avatar for various use cases.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Workspace Panel */}
      <WorkspacePanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        title={panelTitle}
      >
        {/* Scan Panel */}
        {activeFeature === 'scan' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center mb-4">
                <Scan size={48} className="text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">3D Biometric Scan</h3>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                Position your face in the center of the camera frame. 
                Ensure good lighting for optimal results.
              </p>
              
              <div className="flex flex-col gap-4 max-w-sm mx-auto">
                <Button 
                  variant="glow" 
                  onClick={startScan}
                  disabled={isScanning}
                  className="w-full"
                >
                  {isScanning ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mr-2"
                      />
                      Scanning...
                    </>
                  ) : (
                    <>Start 3D Scan</>
                  )}
                </Button>
                
                <Button variant="outline" className="w-full">
                  Upload Photo Instead
                </Button>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <h4 className="font-semibold mb-4">Scan Requirements</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Good lighting conditions
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Face clearly visible
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Neutral expression
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  Remove glasses if possible
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Customize Panel */}
        {activeFeature === 'customize' && (
          <div className="space-y-6">
            <p className="text-gray-400">
              Adjust facial features with millimeter precision. 
              All changes are saved automatically.
            </p>
            
            <div className="space-y-6">
              {customizationGroups.map((group) => (
                <div key={group.title} className="border-b border-white/10 pb-6 last:border-0">
                  <h4 className="font-semibold mb-4 flex items-center gap-2">
                    <Sliders size={16} className="text-purple-400" />
                    {group.title}
                  </h4>
                  <div className="space-y-4">
                    {group.options.map((option) => (
                      <div key={option.id}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm flex items-center gap-2">
                            {option.icon}
                            {option.label}
                          </span>
                          <span className="text-sm text-purple-400 font-mono">
                            {customization[option.id] ?? option.default}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={option.min}
                          max={option.max}
                          defaultValue={option.default}
                          onChange={(e) => handleCustomizationChange(option.id, parseInt(e.target.value))}
                          className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Style Panel */}
        {activeFeature === 'style' && (
          <div className="space-y-6">
            <p className="text-gray-400">
              Apply AI-powered style transfer to your avatar. 
              Each style is optimized for different use cases.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              {stylePresets.map((style) => (
                <motion.div
                  key={style.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`
                    p-4 rounded-xl cursor-pointer border-2 transition-all
                    ${selectedStyle === style.id 
                      ? 'border-orange-500 bg-orange-500/10' 
                      : 'border-white/10 hover:border-white/30 bg-[#05070A]'}
                  `}
                >
                  <div className={`
                    h-20 rounded-lg mb-3 bg-gradient-to-br ${style.gradient}
                    ${selectedStyle === style.id ? 'ring-2 ring-white/50' : ''}
                  `} />
                  <h5 className="font-semibold text-sm">{style.name}</h5>
                  <p className="text-xs text-gray-500 mt-1">{style.description}</p>
                </motion.div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-4">
              <h4 className="font-semibold mb-3">Style Intensity</h4>
              <input
                type="range"
                min={0}
                max={100}
                defaultValue={75}
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>
          </div>
        )}

        {/* Enhance Panel */}
        {activeFeature === 'enhance' && (
          <div className="space-y-6">
            <p className="text-gray-400">
              Apply neural enhancement algorithms to improve avatar quality.
            </p>
            
            <div className="space-y-4">
              {[
                { name: 'Super Resolution', desc: '4x quality boost', active: true },
                { name: 'Denoising', desc: 'Remove artifacts', active: true },
                { name: 'Detail Enhancement', desc: 'Sharpen features', active: false },
                { name: 'Lighting Correction', desc: 'Fix shadows', active: false },
                { name: 'Color Grading', desc: 'Professional look', active: false },
              ].map((enhancement) => (
                <div
                  key={enhancement.name}
                  className="flex items-center justify-between p-4 bg-[#05070A] rounded-lg"
                >
                  <div>
                    <h5 className="font-semibold">{enhancement.name}</h5>
                    <p className="text-sm text-gray-500">{enhancement.desc}</p>
                  </div>
                  <button
                    className={`
                      w-12 h-6 rounded-full relative transition-colors
                      ${enhancement.active ? 'bg-green-500' : 'bg-gray-700'}
                    `}
                  >
                    <span className={`
                      absolute top-1 w-4 h-4 rounded-full bg-white transition-all
                      ${enhancement.active ? 'left-7' : 'left-1'}
                    `} />
                  </button>
                </div>
              ))}
            </div>

            <Button variant="glow" className="w-full">
              <Zap size={16} className="mr-2" />
              Apply All Enhancements
            </Button>
          </div>
        )}
      </WorkspacePanel>
    </ServiceShell>
  )
}
