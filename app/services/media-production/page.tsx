"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Film, Clapperboard, Wand2, Download, Share2, Save, Trash2, Plus,
  Play, Pause, SkipBack, SkipForward, Scissors, Type, Image as ImageIcon,
  Music, Mic, Palette, Settings, Zap, Layers, Grid3X3, Maximize2,
  ChevronLeft, ChevronRight, Volume2, VolumeX, Clock, Calendar
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
    id: 'edit', 
    title: 'Video Editor', 
    description: 'Professional timeline editing', 
    icon: <Clapperboard size={24} />, 
    gradient: 'from-red-400 to-orange-500',
    color: 'red'
  },
  { 
    id: 'generate', 
    title: 'AI Generate', 
    description: 'Text to video generation', 
    icon: <Wand2 size={24} />, 
    gradient: 'from-purple-400 to-pink-500',
    color: 'purple'
  },
  { 
    id: 'effects', 
    title: 'Effects & Color', 
    description: 'Cinematic color grading', 
    icon: <Palette size={24} />, 
    gradient: 'from-blue-400 to-cyan-500',
    color: 'blue'
  },
  { 
    id: 'audio', 
    title: 'Audio Mix', 
    description: 'Professional audio tools', 
    icon: <Music size={24} />, 
    gradient: 'from-green-400 to-emerald-500',
    color: 'green'
  },
]

// Timeline tracks
const timelineTracks = [
  { id: 'video', name: 'Video', type: 'video', clips: [
    { id: 1, start: 0, duration: 5, name: 'Intro.mp4', color: 'from-red-500 to-orange-500' },
    { id: 2, start: 5, duration: 10, name: 'Main.mp4', color: 'from-orange-500 to-yellow-500' },
    { id: 3, start: 15, duration: 5, name: 'Outro.mp4', color: 'from-yellow-500 to-red-500' },
  ]},
  { id: 'audio', name: 'Audio', type: 'audio', clips: [
    { id: 4, start: 0, duration: 20, name: 'Soundtrack.mp3', color: 'from-green-500 to-emerald-500' },
  ]},
  { id: 'text', name: 'Text', type: 'text', clips: [
    { id: 5, start: 2, duration: 3, name: 'Title', color: 'from-blue-500 to-cyan-500' },
    { id: 6, start: 10, duration: 5, name: 'Subtitle', color: 'from-cyan-500 to-blue-500' },
  ]},
  { id: 'effects', name: 'Effects', type: 'effects', clips: [
    { id: 7, start: 0, duration: 5, name: 'Transition', color: 'from-purple-500 to-pink-500' },
  ]},
]

// AI generation presets
const videoPresets = [
  { id: 'cinematic', name: 'Cinematic', desc: 'Movie-quality visuals', ratio: '16:9', duration: '0:15' },
  { id: 'social', name: 'Social Media', desc: 'Optimized for engagement', ratio: '9:16', duration: '0:30' },
  { id: 'commercial', name: 'Commercial', desc: 'Product showcase', ratio: '1:1', duration: '0:10' },
  { id: 'documentary', name: 'Documentary', desc: 'Informative style', ratio: '16:9', duration: '2:00' },
  { id: 'music', name: 'Music Video', desc: 'Rhythm synced', ratio: '16:9', duration: '3:30' },
  { id: 'animation', name: 'Animation', desc: '3D animated', ratio: '16:9', duration: '1:00' },
]

// Color grading presets
const colorPresets = [
  { id: 'cinematic', name: 'Cinematic', gradient: 'from-amber-600 to-blue-900' },
  { id: 'noir', name: 'Noir', gradient: 'from-gray-900 to-black' },
  { id: 'vintage', name: 'Vintage', gradient: 'from-amber-200 to-orange-400' },
  { id: 'cyberpunk', name: 'Cyberpunk', gradient: 'from-cyan-400 to-purple-600' },
  { id: 'natural', name: 'Natural', gradient: 'from-green-400 to-emerald-600' },
  { id: 'dramatic', name: 'Dramatic', gradient: 'from-red-600 to-orange-700' },
  { id: 'cold', name: 'Cold', gradient: 'from-blue-400 to-cyan-600' },
  { id: 'warm', name: 'Warm', gradient: 'from-yellow-400 to-red-500' },
]

// Effects library
const effectsLibrary = [
  { id: 'transition', name: 'Transitions', items: ['Fade', 'Dissolve', 'Wipe', 'Zoom', 'Slide', 'Glitch'] },
  { id: 'filter', name: 'Filters', items: ['Aperture', 'Sharpen', 'Noise', 'Vignette', 'Lens Flare'] },
  { id: 'text', name: 'Text Animations', items: ['Typewriter', 'Fade In', 'Slide Up', 'Scale', 'Rotate'] },
  { id: 'motion', name: 'Motion Graphics', items: ['Particles', 'Light Leaks', 'Film Grain', 'Scan Lines'] },
]

export default function MediaProductionPage() {
  const [activeFeature, setActiveFeature] = useState('edit')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelTitle, setPanelTitle] = useState('Workspace')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(20) // 20 seconds
  const [selectedPreset, setSelectedPreset] = useState('cinematic')
  const [selectedColor, setSelectedColor] = useState('cinematic')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [zoom, setZoom] = useState(100)
  const [volume, setVolume] = useState(80)
  const [isMuted, setIsMuted] = useState(false)
  const [selectedClip, setSelectedClip] = useState<number | null>(null)

  // Playback timer
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= duration) {
            setIsPlaying(false)
            return 0
          }
          return prev + 0.1
        })
      }, 100)
    }
    return () => clearInterval(interval)
  }, [isPlaying, duration])

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  // Handle feature selection
  const handleFeatureClick = (featureId: string) => {
    setActiveFeature(featureId)
    const feature = features.find(f => f.id === featureId)
    if (feature) {
      setPanelTitle(feature.title)
      setIsPanelOpen(true)
    }
  }

  // Generate video
  const generateVideo = () => {
    if (!prompt.trim()) return
    setIsGenerating(true)
    setGenerationProgress(0)
    
    const interval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsGenerating(false)
          return 100
        }
        return prev + 2
      })
    }, 100)
  }

  // Split clip at playhead
  const splitClip = () => {
    console.log('Split at', currentTime)
  }

  // Delete selected clip
  const deleteClip = () => {
    if (selectedClip) {
      setSelectedClip(null)
    }
  }

  return (
    <ServiceShell
      title="Media Production"
      subtitle="Professional video editing and AI-powered content creation"
      gradient="from-red-400 to-orange-500"
      actions={
        <>
          <Button variant="secondary" size="sm">
            <Scissors size={16} className="mr-2" /> Split
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
        {/* Main Editor Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Preview */}
          <Card className="aspect-video relative overflow-hidden bg-black" glow>
            {/* Preview Content */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Film size={64} className="mx-auto text-red-400 mb-4 opacity-50" />
                <p className="text-gray-500">Video Preview</p>
                <p className="text-2xl font-mono mt-2">{formatTime(currentTime)}</p>
              </div>
            </div>

            {/* Overlay Controls */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-20 h-20 rounded-full bg-red-500/90 flex items-center justify-center"
              >
                {isPlaying ? <Pause size={32} /> : <Play size={32} className="ml-1" />}
              </motion.button>
            </div>

            {/* Corner Info */}
            <div className="absolute top-4 right-4 flex gap-2">
              <Badge variant="default">{videoPresets.find(p => p.id === selectedPreset)?.ratio}</Badge>
              <Badge variant="success">{videoPresets.find(p => p.id === selectedPreset)?.duration}</Badge>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setCurrentTime(0)}>
                    <SkipBack size={20} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setIsPlaying(!isPlaying)}>
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setCurrentTime(duration)}>
                    <SkipForward size={20} />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setIsMuted(!isMuted)}>
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </Button>
                  <div className="w-24">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume}
                      onChange={(e) => setVolume(parseInt(e.target.value))}
                      className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Timeline */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Layers size={20} className="text-red-400" /> Timeline
                </h3>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(50, zoom - 10))}>
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="text-sm text-gray-400 w-12 text-center">{zoom}%</span>
                  <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(200, zoom + 10))}>
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={splitClip}>
                  <Scissors size={14} className="mr-1" /> Split
                </Button>
                <Button variant="outline" size="sm" onClick={deleteClip} disabled={!selectedClip}>
                  <Trash2 size={14} className="mr-1" /> Delete
                </Button>
              </div>
            </div>

            {/* Timeline Tracks */}
            <div className="space-y-2 relative">
              {/* Playhead */}
              <motion.div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              >
                <div className="absolute -top-2 -translate-x-1/2 w-4 h-4 bg-red-500 rotate-45" />
              </motion.div>

              {timelineTracks.map((track) => (
                <div key={track.id} className="flex items-center gap-2">
                  {/* Track Label */}
                  <div className="w-24 flex items-center gap-2 text-sm">
                    {track.type === 'video' && <Film size={14} />}
                    {track.type === 'audio' && <Music size={14} />}
                    {track.type === 'text' && <Type size={14} />}
                    {track.type === 'effects' && <Wand2 size={14} />}
                    <span className="text-gray-400">{track.name}</span>
                  </div>

                  {/* Track Lane */}
                  <div className="flex-1 h-12 bg-[#05070A] rounded relative overflow-hidden">
                    {track.clips.map((clip) => (
                      <motion.div
                        key={clip.id}
                        className={`
                          absolute h-full rounded flex items-center px-2 cursor-pointer
                          bg-gradient-to-r ${clip.color}
                          ${selectedClip === clip.id ? 'ring-2 ring-white' : ''}
                        `}
                        style={{
                          left: `${(clip.start / duration) * 100}%`,
                          width: `${(clip.duration / duration) * 100}%`,
                        }}
                        onClick={() => setSelectedClip(clip.id)}
                        whileHover={{ scale: 1.02 }}
                      >
                        <span className="text-xs font-medium truncate">{clip.name}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Time Ruler */}
              <div className="flex justify-between text-xs text-gray-500 mt-2 px-24">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i}>{formatTime((duration / 4) * i)}</span>
                ))}
              </div>
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
          {/* Project Info */}
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <Film size={32} />
              </div>
              <div>
                <h3 className="font-semibold">Project Alpha</h3>
                <p className="text-sm text-gray-400">Last edited 5 min ago</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-[#05070A] rounded-lg">
                <p className="text-gray-400">Duration</p>
                <p className="font-mono">{formatTime(duration)}</p>
              </div>
              <div className="p-3 bg-[#05070A] rounded-lg">
                <p className="text-gray-400">Resolution</p>
                <p className="font-mono">4K UHD</p>
              </div>
              <div className="p-3 bg-[#05070A] rounded-lg">
                <p className="text-gray-400">FPS</p>
                <p className="font-mono">60</p>
              </div>
              <div className="p-3 bg-[#05070A] rounded-lg">
                <p className="text-gray-400">Format</p>
                <p className="font-mono">MP4</p>
              </div>
            </div>
          </Card>

          {/* Media Library */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Media Library</h3>
              <Button variant="outline" size="sm">
                <Plus size={14} className="mr-1" /> Add
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['Clip 1', 'Clip 2', 'Clip 3', 'Audio 1', 'Title', 'Effect'].map((item, i) => (
                <div key={i} className="aspect-video bg-[#05070A] rounded-lg flex items-center justify-center text-xs text-gray-500 hover:bg-red-500/10 cursor-pointer transition-colors">
                  {item}
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Button variant="outline" className="w-full justify-start">
                <ImageIcon size={16} className="mr-2" /> Import Media
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Type size={16} className="mr-2" /> Add Text
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Music size={16} className="mr-2" /> Add Audio
              </Button>
              <Button variant="outline" className="w-full justify-start text-red-400 hover:bg-red-500/10">
                <Trash2 size={16} className="mr-2" /> Clear Timeline
              </Button>
            </div>
          </Card>

          {/* Pro Tip */}
          <Card className="p-6 bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/30">
            <div className="flex items-start gap-3">
              <Zap className="text-red-400 shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold mb-1">Pro Tip</h4>
                <p className="text-sm text-gray-400">
                  Use keyboard shortcuts: Space to play/pause, S to split, Delete to remove clips. 
                  The AI Generate feature can create entire scenes from text descriptions.
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
        {/* Video Editor Panel */}
        {activeFeature === 'edit' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-red-400/20 to-orange-500/20 flex items-center justify-center mb-4">
                <Clapperboard size={48} className="text-red-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Video Editor</h3>
              <p className="text-gray-400 mb-6">
                Professional timeline-based editing with precision controls
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Editing Tools</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Scissors size={16} />, name: 'Cut' },
                  { icon: <Copy size={16} />, name: 'Copy' },
                  { icon: <Clipboard size={16} />, name: 'Paste' },
                  { icon: <Undo size={16} />, name: 'Undo' },
                ].map((tool) => (
                  <Button key={tool.name} variant="outline" className="justify-start">
                    {tool.icon}
                    <span className="ml-2">{tool.name}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 pt-4">
              <h4 className="font-semibold mb-3">Transform</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Scale</span>
                    <span>100%</span>
                  </div>
                  <input type="range" className="w-full h-2 bg-gray-800 rounded-lg appearance-none accent-red-500" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Rotation</span>
                    <span>0°</span>
                  </div>
                  <input type="range" className="w-full h-2 bg-gray-800 rounded-lg appearance-none accent-red-500" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Opacity</span>
                    <span>100%</span>
                  </div>
                  <input type="range" className="w-full h-2 bg-gray-800 rounded-lg appearance-none accent-red-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Generate Panel */}
        {activeFeature === 'generate' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-purple-400/20 to-pink-500/20 flex items-center justify-center mb-4">
                <Wand2 size={48} className="text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Video Generation</h3>
              <p className="text-gray-400 mb-6">
                Describe your scene and let AI create it for you
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A cinematic aerial shot of a futuristic city at sunset with flying cars..."
                  className="w-full h-32 bg-[#05070A] border border-white/10 rounded-lg p-4 text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50"
                />
              </div>

              <div>
                <h4 className="font-semibold mb-3">Select Style</h4>
                <div className="grid grid-cols-1 gap-2">
                  {videoPresets.map((preset) => (
                    <motion.div
                      key={preset.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedPreset(preset.id)}
                      className={`
                        p-3 rounded-lg cursor-pointer border-2 transition-all
                        ${selectedPreset === preset.id 
                          ? 'border-purple-500 bg-purple-500/10' 
                          : 'border-white/10 hover:border-white/30 bg-[#05070A]'}
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-semibold text-sm">{preset.name}</h5>
                          <p className="text-xs text-gray-500">{preset.desc}</p>
                        </div>
                        <div className="text-right text-xs text-gray-400">
                          <p>{preset.ratio}</p>
                          <p>{preset.duration}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            <Button 
              variant="glow" 
              className="w-full"
              onClick={generateVideo}
              disabled={isGenerating || !prompt.trim()}
            >
              {isGenerating ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mr-2"
                  />
                  Generating... {generationProgress}%
                </>
              ) : (
                <>
                  <Wand2 size={16} className="mr-2" />
                  Generate Video
                </>
              )}
            </Button>
          </div>
        )}

        {/* Effects & Color Panel */}
        {activeFeature === 'effects' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-blue-400/20 to-cyan-500/20 flex items-center justify-center mb-4">
                <Palette size={48} className="text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Color Grading</h3>
              <p className="text-gray-400 mb-6">
                Professional color correction and cinematic looks
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Presets</h4>
              <div className="grid grid-cols-2 gap-3">
                {colorPresets.map((preset) => (
                  <motion.div
                    key={preset.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedColor(preset.id)}
                    className={`
                      p-3 rounded-lg cursor-pointer border-2 transition-all
                      ${selectedColor === preset.id ? 'border-white' : 'border-transparent'}
                    `}
                  >
                    <div className={`h-16 rounded-lg bg-gradient-to-br ${preset.gradient} mb-2`} />
                    <p className="text-sm font-medium text-center">{preset.name}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-4">
              <h4 className="font-semibold">Adjustments</h4>
              {[
                { name: 'Exposure', default: 50 },
                { name: 'Contrast', default: 50 },
                { name: 'Saturation', default: 60 },
                { name: 'Highlights', default: 40 },
                { name: 'Shadows', default: 60 },
              ].map((param) => (
                <div key={param.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">{param.name}</span>
                    <span>{param.default}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    defaultValue={param.default}
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audio Mix Panel */}
        {activeFeature === 'audio' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-green-400/20 to-emerald-500/20 flex items-center justify-center mb-4">
                <Music size={48} className="text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Audio Mixing</h3>
              <p className="text-gray-400 mb-6">
                Professional audio tools and sound design
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Audio Effects</h4>
              {[
                { name: 'Noise Reduction', value: 30 },
                { name: 'Voice Enhancement', value: 50 },
                { name: 'Bass Boost', value: 40 },
                { name: 'Treble', value: 60 },
              ].map((effect) => (
                <div key={effect.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">{effect.name}</span>
                    <span>{effect.value}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    defaultValue={effect.value}
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                </div>
              ))}
            </div>

            <Button variant="glow" className="w-full">
              <Mic size={16} className="mr-2" />
              Record Voiceover
            </Button>
          </div>
        )}
      </WorkspacePanel>
    </ServiceShell>
  )
}
