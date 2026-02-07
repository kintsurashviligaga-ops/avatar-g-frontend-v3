"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Camera, Image, Wand2, Sparkles, Download, Share2, Save, 
  Trash2, Upload, Sliders, Crop, RotateCw, FlipHorizontal, 
  FlipVertical, Sun, Contrast, Droplets, Eye, Palette, 
  Type, Sticker, Layers, Maximize2, Minimize2, ZoomIn, 
  ZoomOut, Undo2, Redo2, History, Copy, Check, X,
  Move, MousePointer2, Scissors, Frame, Filter,
  Aperture, Triangle, Circle, Square, Star, Heart,
  ChevronLeft, ChevronRight, Plus, Minus, Grid3X3,
  FileImage, Images, FolderOpen, Settings, Info,
  Eraser, Cloud, Paperclip, Link, Send, Layout
} from "lucide-react"
import { ServiceShell } from "@/components/shared/ServiceShell"
import { FeatureCard } from "@/components/shared/FeatureCard"
import { WorkspacePanel } from "@/components/shared/WorkspacePanel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"

// Feature definitions
const features = [
  { 
    id: 'enhance', 
    title: 'AI Enhance', 
    description: 'One-click photo improvement', 
    icon: <Wand2 size={24} />, 
    gradient: 'from-yellow-400 to-orange-500',
    color: 'yellow'
  },
  { 
    id: 'edit', 
    title: 'Pro Editor', 
    description: 'Advanced editing tools', 
    icon: <Sliders size={24} />, 
    gradient: 'from-cyan-400 to-blue-500',
    color: 'cyan'
  },
  { 
    id: 'remove', 
    title: 'Background', 
    description: 'Remove or replace bg', 
    icon: <Scissors size={24} />, 
    gradient: 'from-purple-400 to-pink-500',
    color: 'purple'
  },
  { 
    id: 'effects', 
    title: 'Effects', 
    description: 'Filters and overlays', 
    icon: <Sparkles size={24} />, 
    gradient: 'from-green-400 to-emerald-500',
    color: 'green'
  },
]

// Filter presets
const filterPresets = [
  { id: 'original', name: 'Original', preview: 'bg-gray-500' },
  { id: 'vivid', name: 'Vivid', preview: 'bg-gradient-to-br from-orange-400 to-red-500' },
  { id: 'dramatic', name: 'Dramatic', preview: 'bg-gradient-to-br from-purple-900 to-black' },
  { id: 'noir', name: 'Noir', preview: 'bg-gradient-to-br from-gray-900 to-black' },
  { id: 'bright', name: 'Bright', preview: 'bg-gradient-to-br from-yellow-200 to-white' },
  { id: 'cool', name: 'Cool', preview: 'bg-gradient-to-br from-blue-400 to-cyan-300' },
  { id: 'warm', name: 'Warm', preview: 'bg-gradient-to-br from-orange-300 to-yellow-200' },
  { id: 'vintage', name: 'Vintage', preview: 'bg-gradient-to-br from-yellow-600 to-amber-800' },
  { id: 'cyber', name: 'Cyber', preview: 'bg-gradient-to-br from-cyan-500 to-purple-600' },
  { id: 'natural', name: 'Natural', preview: 'bg-gradient-to-br from-green-400 to-emerald-600' },
]

// Adjustment sliders
const adjustments = [
  { id: 'brightness', name: 'Brightness', icon: Sun, min: -100, max: 100, default: 0 },
  { id: 'contrast', name: 'Contrast', icon: Contrast, min: -100, max: 100, default: 0 },
  { id: 'saturation', name: 'Saturation', icon: Droplets, min: -100, max: 100, default: 0 },
  { id: 'highlights', name: 'Highlights', icon: Maximize2, min: -100, max: 100, default: 0 },
  { id: 'shadows', name: 'Shadows', icon: Minimize2, min: -100, max: 100, default: 0 },
  { id: 'sharpness', name: 'Sharpness', icon: Eye, min: 0, max: 100, default: 0 },
  { id: 'blur', name: 'Aperture', icon: Aperture, min: 0, max: 100, default: 0 },
  { id: 'vignette', name: 'Vignette', icon: Circle, min: 0, max: 100, default: 0 },
]

// AI tools
const aiTools = [
  { id: 'upscale', name: 'AI Upscale', desc: '4x resolution boost', icon: Maximize2 },
  { id: 'restore', name: 'Old Photo Restore', desc: 'Repair damaged photos', icon: History },
  { id: 'colorize', name: 'AI Colorize', desc: 'Add color to B&W', icon: Palette },
  { id: 'portrait', name: 'Portrait Pro', desc: 'Perfect skin & eyes', icon: Sparkles },
  { id: 'sky', name: 'Sky Replacement', desc: 'Change sky automatically', icon: Cloud },
  { id: 'object', name: 'Object Removal', desc: 'Remove unwanted items', icon: Eraser },
]

// Recent edits
const recentEdits = [
  { id: 1, name: 'Vacation_01.jpg', thumbnail: '🏖️', date: '2 min ago', size: '2.4 MB' },
  { id: 2, name: 'Portrait_Pro.png', thumbnail: '👤', date: '15 min ago', size: '4.1 MB' },
  { id: 3, name: 'Product_Shot.jpg', thumbnail: '📦', date: '1 hour ago', size: '3.2 MB' },
  { id: 4, name: 'Landscape_4K.jpg', thumbnail: '🏔️', date: 'Yesterday', size: '8.7 MB' },
]

// Stickers and elements
const stickers = [
  { id: 'emoji', items: ['😀', '😎', '🔥', '❤️', '⭐', '🎉', '💯', '🌟'] },
  { id: 'shapes', items: ['⭕', '🔲', '🔺', '⭐', '❤️', '⚡', '💎', '🎯'] },
  { id: 'decorations', items: ['✨', '🌸', '🍃', '🌙', '☀️', '☁️', '🌈', '❄️'] },
]

export default function PhotoStudioPage() {
  const [activeFeature, setActiveFeature] = useState('enhance')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelTitle, setPanelTitle] = useState('Workspace')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [activeFilter, setActiveFilter] = useState('original')
  const [adjustmentValues, setAdjustmentValues] = useState<Record<string, number>>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [history, setHistory] = useState<string[]>(['Original'])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [activeTab, setActiveTab] = useState('filters')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize adjustment values
  useEffect(() => {
    const initial: Record<string, number> = {}
    adjustments.forEach(adj => initial[adj.id] = adj.default)
    setAdjustmentValues(initial)
  }, [])

  // Handle feature selection
  const handleFeatureClick = (featureId: string) => {
    setActiveFeature(featureId)
    const feature = features.find(f => f.id === featureId)
    if (feature) {
      setPanelTitle(feature.title)
      setIsPanelOpen(true)
    }
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedImage(URL.createObjectURL(file))
      setHistory(['Original', `Uploaded: ${file.name}`])
      setHistoryIndex(1)
    }
  }

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(URL.createObjectURL(file))
    }
  }

  // Process image with AI
  const processImage = (tool: string) => {
    setIsProcessing(true)
    setProcessingProgress(0)
    
    const interval = setInterval(() => {
      setProcessingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsProcessing(false)
          setHistory(prev => [...prev, `Applied: ${tool}`])
          setHistoryIndex(prev => prev + 1)
          return 100
        }
        return prev + 5
      })
    }, 100)
  }

  // Reset adjustments
  const resetAdjustments = () => {
    const initial: Record<string, number> = {}
    adjustments.forEach(adj => initial[adj.id] = adj.default)
    setAdjustmentValues(initial)
    setActiveFilter('original')
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
  }

  // Undo/Redo
  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1)
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1)
    }
  }

  return (
    <ServiceShell
      title="Photo Studio"
      subtitle="Professional photo editing powered by AI"
      gradient="from-yellow-400 to-orange-500"
      actions={
        <>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} className="mr-2" /> Upload
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
        {/* Main Canvas */}
        <div className="lg:col-span-2 space-y-6">
          {/* Canvas Area */}
          <Card 
            className="relative overflow-hidden min-h-[500px] flex items-center justify-center"
            glow
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {selectedImage ? (
              <div className="relative w-full h-full flex items-center justify-center p-8">
                {/* Image Container */}
                <motion.div
                  className="relative"
                  style={{
                    transform: `
                      scale(${zoom / 100}) 
                      rotate(${rotation}deg) 
                      scaleX(${flipH ? -1 : 1}) 
                      scaleY(${flipV ? -1 : 1})
                    `,
                    filter: `
                      brightness(${100 + (adjustmentValues.brightness || 0)}%) 
                      contrast(${100 + (adjustmentValues.contrast || 0)}%) 
                      saturate(${100 + (adjustmentValues.saturation || 0)}%)
                      blur(${adjustmentValues.blur || 0}px)
                    `
                  }}
                >
                  <div className="w-96 h-96 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center text-6xl shadow-2xl">
                    {activeFilter === 'original' && '🖼️'}
                    {activeFilter === 'vivid' && '🌈'}
                    {activeFilter === 'dramatic' && '🎭'}
                    {activeFilter === 'noir' && '🎬'}
                    {activeFilter === 'bright' && '☀️'}
                    {activeFilter === 'cool' && '❄️'}
                    {activeFilter === 'warm' && '🔥'}
                    {activeFilter === 'vintage' && '📷'}
                    {activeFilter === 'cyber' && '👾'}
                    {activeFilter === 'natural' && '🌿'}
                  </div>
                  
                  {/* Vignette overlay */}
                  {(adjustmentValues.vignette || 0) > 0 && (
                    <div 
                      className="absolute inset-0 rounded-lg pointer-events-none"
                      style={{
                        boxShadow: `inset 0 0 ${adjustmentValues.vignette * 2}px rgba(0,0,0,0.5)`
                      }}
                    />
                  )}
                </motion.div>

                {/* Processing Overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-20">
                    <div className="text-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 border-4 border-yellow-400/30 border-t-yellow-400 rounded-full mx-auto mb-4"
                      />
                      <p className="text-lg font-semibold mb-2">AI Processing...</p>
                      <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-yellow-400"
                          style={{ width: `${processingProgress}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-400 mt-2">{processingProgress}%</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Empty State */
              <div className="text-center p-12">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-yellow-400/20 to-orange-500/20 flex items-center justify-center mb-6"
                >
                  <Image size={48} className="text-yellow-400" />
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">Drop your photo here</h3>
                <p className="text-gray-400 mb-6">or click upload to get started</p>
                <Button variant="glow" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} className="mr-2" /> Choose Photo
                </Button>
                <p className="text-xs text-gray-500 mt-4">Supports JPG, PNG, WEBP, RAW</p>
              </div>
            )}

            {/* Drag Overlay */}
            {isDragging && (
              <div className="absolute inset-0 bg-yellow-500/20 border-4 border-dashed border-yellow-400 flex items-center justify-center z-10">
                <p className="text-2xl font-bold text-yellow-400">Drop your image here</p>
              </div>
            )}

            {/* Canvas Toolbar */}
            {selectedImage && (
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <div className="flex items-center gap-2 bg-[#05070A]/90 backdrop-blur rounded-lg p-1 border border-white/10">
                  <button 
                    onClick={undo}
                    disabled={historyIndex <= 0}
                    className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30"
                  >
                    <Undo2 size={18} />
                  </button>
                  <button 
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1}
                    className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30"
                  >
                    <Redo2 size={18} />
                  </button>
                  <div className="w-px h-6 bg-white/10 mx-1" />
                  <button 
                    onClick={() => setRotation(prev => prev - 90)}
                    className="p-2 hover:bg-white/10 rounded-lg"
                  >
                    <RotateCw size={18} />
                  </button>
                  <button 
                    onClick={() => setFlipH(!flipH)}
                    className={`p-2 rounded-lg ${flipH ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10'}`}
                  >
                    <FlipHorizontal size={18} />
                  </button>
                  <button 
                    onClick={() => setFlipV(!flipV)}
                    className={`p-2 rounded-lg ${flipV ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10'}`}
                  >
                    <FlipVertical size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-[#05070A]/90 backdrop-blur rounded-lg p-1 border border-white/10">
                  <button 
                    onClick={() => setZoom(Math.max(10, zoom - 10))}
                    className="p-2 hover:bg-white/10 rounded-lg"
                  >
                    <ZoomOut size={18} />
                  </button>
                  <span className="text-sm font-mono w-16 text-center">{zoom}%</span>
                  <button 
                    onClick={() => setZoom(Math.min(200, zoom + 10))}
                    className="p-2 hover:bg-white/10 rounded-lg"
                  >
                    <ZoomIn size={18} />
                  </button>
                  <div className="w-px h-6 bg-white/10 mx-1" />
                  <button 
                    onClick={() => setZoom(100)}
                    className="p-2 hover:bg-white/10 rounded-lg text-xs"
                  >
                    Fit
                  </button>
                </div>
              </div>
            )}
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

          {/* AI Tools */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles size={20} className="text-yellow-400" /> AI Magic Tools
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {aiTools.map((tool) => {
                const Icon = tool.icon
                return (
                  <motion.button
                    key={tool.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => processImage(tool.name)}
                    disabled={isProcessing || !selectedImage}
                    className="p-4 rounded-xl bg-[#05070A] hover:bg-white/5 border border-white/10 hover:border-yellow-500/30 transition-all text-left group disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center mb-3 group-hover:bg-yellow-500/30 transition-colors">
                      <Icon size={20} className="text-yellow-400" />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">{tool.name}</h4>
                    <p className="text-xs text-gray-500">{tool.desc}</p>
                  </motion.button>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Filters */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Palette size={20} className="text-yellow-400" /> Filters
              </h3>
              <Button variant="ghost" size="sm" onClick={resetAdjustments}>
                Reset
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {filterPresets.map((filter) => (
                <motion.button
                  key={filter.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`
                    relative p-3 rounded-lg border-2 transition-all overflow-hidden
                    ${activeFilter === filter.id 
                      ? 'border-yellow-400' 
                      : 'border-transparent hover:border-white/20'}
                  `}
                >
                  <div className={`w-full h-12 rounded mb-2 ${filter.preview}`} />
                  <p className="text-xs font-medium">{filter.name}</p>
                  {activeFilter === filter.id && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                      <Check size={12} className="text-black" />
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </Card>

          {/* Adjustments */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sliders size={20} className="text-yellow-400" /> Adjustments
            </h3>
            <div className="space-y-4">
              {adjustments.map((adj) => {
                const Icon = adj.icon
                return (
                  <div key={adj.id}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="text-gray-400" />
                        <span className="text-sm">{adj.name}</span>
                      </div>
                      <span className="text-xs font-mono text-gray-500">
                        {adjustmentValues[adj.id] || 0}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={adj.min}
                      max={adj.max}
                      value={adjustmentValues[adj.id] || adj.default}
                      onChange={(e) => setAdjustmentValues(prev => ({
                        ...prev,
                        [adj.id]: parseInt(e.target.value)
                      }))}
                      className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                    />
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Recent Edits */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <History size={20} className="text-yellow-400" /> Recent
            </h3>
            <div className="space-y-2">
              {recentEdits.map((edit) => (
                <div key={edit.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#05070A] hover:bg-white/5 transition-colors cursor-pointer">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-400/20 to-orange-500/20 flex items-center justify-center text-xl">
                    {edit.thumbnail}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{edit.name}</p>
                    <p className="text-xs text-gray-500">{edit.date} • {edit.size}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Download size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          {/* Export Options */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Download size={20} className="text-yellow-400" /> Export
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-[#05070A] rounded-lg">
                <span className="text-sm">Format</span>
                <select className="bg-gray-800 rounded px-3 py-1 text-sm">
                  <option>PNG</option>
                  <option>JPG</option>
                  <option>WEBP</option>
                  <option>TIFF</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#05070A] rounded-lg">
                <span className="text-sm">Quality</span>
                <select className="bg-gray-800 rounded px-3 py-1 text-sm">
                  <option>High (100%)</option>
                  <option>Medium (80%)</option>
                  <option>Low (60%)</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#05070A] rounded-lg">
                <span className="text-sm">Size</span>
                <select className="bg-gray-800 rounded px-3 py-1 text-sm">
                  <option>Original</option>
                  <option>1920x1080</option>
                  <option>1080x1080</option>
                  <option>Custom</option>
                </select>
              </div>
            </div>
            <Button variant="glow" className="w-full mt-4">
              <Download size={16} className="mr-2" />
              Export Image
            </Button>
          </Card>

          {/* Pro Tip */}
          <Card className="p-6 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/30">
            <div className="flex items-start gap-3">
              <Sparkles className="text-yellow-400 shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold mb-1">Pro Tip</h4>
                <p className="text-sm text-gray-400">
                  Use AI Enhance for instant one-click improvements. 
                  It automatically adjusts lighting, colors, and sharpness!
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
        {/* AI Enhance Panel */}
        {activeFeature === 'enhance' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-yellow-400/20 to-orange-500/20 flex items-center justify-center mb-4">
                <Wand2 size={48} className="text-yellow-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Enhance</h3>
              <p className="text-gray-400 mb-6">
                One-click professional photo improvement
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Enhancement Options</h4>
                <div className="space-y-3">
                  {[
                    { name: 'Auto Light', desc: 'Perfect exposure & contrast', icon: Sun },
                    { name: 'Color Boost', desc: 'Vibrant, natural colors', icon: Palette },
                    { name: 'Sharp Pro', desc: 'Crystal clear details', icon: Eye },
                    { name: 'Noise Remove', desc: 'Clean, smooth image', icon: Sparkles },
                  ].map((opt) => {
                    const Icon = opt.icon
                    return (
                      <div key={opt.name} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                            <Icon size={16} className="text-yellow-400" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{opt.name}</p>
                            <p className="text-xs text-gray-500">{opt.desc}</p>
                          </div>
                        </div>
                        <div className="w-10 h-5 rounded-full bg-yellow-500 relative cursor-pointer">
                          <div className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Before / After</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="aspect-square bg-gray-800 rounded-lg flex items-center justify-center text-gray-600">
                    Original
                  </div>
                  <div className="aspect-square bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-lg flex items-center justify-center border-2 border-yellow-400/50">
                    <Sparkles size={32} className="text-yellow-400" />
                  </div>
                </div>
              </div>
            </div>

            <Button 
              variant="glow" 
              className="w-full"
              onClick={() => processImage('AI Enhance')}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : (
                <><Wand2 size={16} className="mr-2" /> Enhance Photo</>
              )}
            </Button>
          </div>
        )}

        {/* Pro Editor Panel */}
        {activeFeature === 'edit' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center mb-4">
                <Sliders size={48} className="text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Pro Editor</h3>
              <p className="text-gray-400 mb-6">
                Advanced editing tools
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Transform</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button className="p-3 bg-gray-800/50 rounded-lg hover:bg-white/5 transition-colors">
                    <Crop size={20} className="mx-auto mb-2" />
                    <span className="text-xs">Crop</span>
                  </button>
                  <button className="p-3 bg-gray-800/50 rounded-lg hover:bg-white/5 transition-colors">
                    <RotateCw size={20} className="mx-auto mb-2" />
                    <span className="text-xs">Rotate</span>
                  </button>
                  <button className="p-3 bg-gray-800/50 rounded-lg hover:bg-white/5 transition-colors">
                    <Maximize2 size={20} className="mx-auto mb-2" />
                    <span className="text-xs">Resize</span>
                  </button>
                  <button className="p-3 bg-gray-800/50 rounded-lg hover:bg-white/5 transition-colors">
                    <Move size={20} className="mx-auto mb-2" />
                    <span className="text-xs">Perspective</span>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Advanced</h4>
                <div className="space-y-2">
                  <button className="w-full p-3 bg-gray-800/50 rounded-lg hover:bg-white/5 transition-colors text-left flex items-center gap-3">
                    <Palette size={18} />
                    <span className="text-sm">Curves</span>
                  </button>
                  <button className="w-full p-3 bg-gray-800/50 rounded-lg hover:bg-white/5 transition-colors text-left flex items-center gap-3">
                    <Droplets size={18} />
                    <span className="text-sm">HSL Adjust</span>
                  </button>
                  <button className="w-full p-3 bg-gray-800/50 rounded-lg hover:bg-white/5 transition-colors text-left flex items-center gap-3">
                    <Layers size={18} />
                    <span className="text-sm">Split Toning</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Background Panel */}
        {activeFeature === 'remove' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-purple-400/20 to-pink-500/20 flex items-center justify-center mb-4">
                <Scissors size={48} className="text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Background AI</h3>
              <p className="text-gray-400 mb-6">
                Remove or replace background
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Background Options</h4>
                <div className="space-y-2">
                  <button className="w-full p-3 bg-purple-500/20 border border-purple-500/50 rounded-lg text-left">
                    <p className="font-medium text-sm text-purple-400">Remove Background</p>
                    <p className="text-xs text-gray-500">Make background transparent</p>
                  </button>
                  <button className="w-full p-3 bg-gray-800/50 rounded-lg hover:bg-white/5 transition-colors text-left">
                    <p className="font-medium text-sm">Aperture Background</p>
                    <p className="text-xs text-gray-500">Keep subject, blur background</p>
                  </button>
                  <button className="w-full p-3 bg-gray-800/50 rounded-lg hover:bg-white/5 transition-colors text-left">
                    <p className="font-medium text-sm">Replace Background</p>
                    <p className="text-xs text-gray-500">Choose new background</p>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Background Presets</h4>
                <div className="grid grid-cols-3 gap-2">
                  {['⬜', '⬛', '🔲', '🌅', '🏙️', '🌿'].map((bg, i) => (
                    <button key={i} className="aspect-square bg-gray-800 rounded-lg flex items-center justify-center text-2xl hover:bg-white/10 transition-colors">
                      {bg}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button variant="glow" className="w-full">
              <Scissors size={16} className="mr-2" />
              Remove Background
            </Button>
          </div>
        )}

        {/* Effects Panel */}
        {activeFeature === 'effects' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-green-400/20 to-emerald-500/20 flex items-center justify-center mb-4">
                <Sparkles size={48} className="text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Effects & Overlays</h3>
              <p className="text-gray-400 mb-6">
                Creative effects and stickers
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Stickers</h4>
                <div className="space-y-3">
                  {stickers.map((category) => (
                    <div key={category.id}>
                      <p className="text-xs text-gray-500 mb-2 capitalize">{category.id}</p>
                      <div className="flex gap-2 flex-wrap">
                        {category.items.map((item, i) => (
                          <button key={i} className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-xl hover:bg-white/10 transition-colors">
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Overlays</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button className="p-3 bg-gray-800/50 rounded-lg text-sm hover:bg-white/5">Light Leaks</button>
                  <button className="p-3 bg-gray-800/50 rounded-lg text-sm hover:bg-white/5">Film Grain</button>
                  <button className="p-3 bg-gray-800/50 rounded-lg text-sm hover:bg-white/5">Lens Flare</button>
                  <button className="p-3 bg-gray-800/50 rounded-lg text-sm hover:bg-white/5">Dust & Scratches</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </WorkspacePanel>
    </ServiceShell>
  )
}
