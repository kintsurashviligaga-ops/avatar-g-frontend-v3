"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Music, Disc3, Mic2, Radio, Play, Pause, Square, SkipBack, SkipForward,
  Volume2, VolumeX, Wand2, Download, Share2, Save, Trash2, Plus,
  Settings, Sliders, Zap, Headphones, Mic, AudioWaveform, Music2
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
    id: 'compose', 
    title: 'AI Composer', 
    description: 'Generate original music with AI', 
    icon: <Wand2 size={24} />, 
    gradient: 'from-green-400 to-emerald-500',
    color: 'green'
  },
  { 
    id: 'record', 
    title: 'Studio Recording', 
    description: 'Professional multi-track recording', 
    icon: <Mic2 size={24} />, 
    gradient: 'from-cyan-400 to-blue-500',
    color: 'cyan'
  },
  { 
    id: 'mix', 
    title: 'Smart Mixing', 
    description: 'AI-powered audio mixing', 
    icon: <Sliders size={24} />, 
    gradient: 'from-purple-400 to-pink-500',
    color: 'purple'
  },
  { 
    id: 'master', 
    title: 'Mastering', 
    description: 'Professional mastering suite', 
    icon: <Zap size={24} />, 
    gradient: 'from-yellow-400 to-orange-500',
    color: 'yellow'
  },
]

// Track types
const trackTypes = [
  { id: 'drums', name: 'Drums', icon: <Disc3 size={16} />, color: 'from-red-500 to-orange-500', muted: false, solo: false, volume: 80 },
  { id: 'bass', name: 'Bass', icon: <AudioWaveform size={16} />, color: 'from-orange-500 to-yellow-500', muted: false, solo: false, volume: 75 },
  { id: 'synth', name: 'Synth', icon: <Zap size={16} />, color: 'from-purple-500 to-pink-500', muted: false, solo: false, volume: 70 },
  { id: 'pads', name: 'Pads', icon: <Music size={16} />, color: 'from-blue-500 to-cyan-500', muted: false, solo: false, volume: 60 },
  { id: 'vocals', name: 'Vocals', icon: <Mic size={16} />, color: 'from-green-500 to-emerald-500', muted: true, solo: false, volume: 85 },
  { id: 'fx', name: 'FX', icon: <Wand2 size={16} />, color: 'from-pink-500 to-rose-500', muted: false, solo: false, volume: 50 },
]

// AI composition styles
const compositionStyles = [
  { id: 'electronic', name: 'Electronic', bpm: 128, key: 'C min', duration: '3:45' },
  { id: 'lofi', name: 'Lo-Fi Hip Hop', bpm: 85, key: 'F maj', duration: '2:30' },
  { id: 'cinematic', name: 'Cinematic', bpm: 110, key: 'D min', duration: '4:20' },
  { id: 'pop', name: 'Pop', bpm: 120, key: 'G maj', duration: '3:15' },
  { id: 'jazz', name: 'Jazz', bpm: 95, key: 'Bb maj', duration: '5:00' },
  { id: 'ambient', name: 'Ambient', bpm: 70, key: 'A min', duration: '6:30' },
]

// Effects
const effectsList = [
  { id: 'reverb', name: 'Reverb', value: 30, icon: <Radio size={16} /> },
  { id: 'delay', name: 'Delay', value: 20, icon: <AudioWaveform size={16} /> },
  { id: 'chorus', name: 'Chorus', value: 15, icon: <Music2 size={16} /> },
  { id: 'distortion', name: 'Distortion', value: 10, icon: <Zap size={16} /> },
  { id: 'compression', name: 'Compression', value: 45, icon: <Sliders size={16} /> },
  { id: 'eq', name: 'EQ', value: 50, icon: <Settings size={16} /> },
]

export default function MusicStudioPage() {
  const [activeFeature, setActiveFeature] = useState('compose')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelTitle, setPanelTitle] = useState('Workspace')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(225) // 3:45 in seconds
  const [masterVolume, setMasterVolume] = useState(80)
  const [isMuted, setIsMuted] = useState(false)
  const [tracks, setTracks] = useState(trackTypes)
  const [selectedStyle, setSelectedStyle] = useState('electronic')
  const [isGenerating, setIsGenerating] = useState(false)
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(64).fill(0))
  const [effects, setEffects] = useState(effectsList)

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
          return prev + 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isPlaying, duration])

  // Visualizer animation
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isPlaying) {
      interval = setInterval(() => {
        setVisualizerData(prev => prev.map(() => Math.random() * 100))
      }, 100)
    } else {
      setVisualizerData(new Array(64).fill(0))
    }
    return () => clearInterval(interval)
  }, [isPlaying])

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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

  // Toggle track mute
  const toggleMute = (trackId: string) => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, muted: !track.muted } : track
    ))
  }

  // Toggle track solo
  const toggleSolo = (trackId: string) => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, solo: !track.solo } : track
    ))
  }

  // Update track volume
  const updateTrackVolume = (trackId: string, volume: number) => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, volume } : track
    ))
  }

  // Generate music
  const generateMusic = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setIsGenerating(false)
      setIsPlaying(true)
    }, 3000)
  }

  // Update effect
  const updateEffect = (effectId: string, value: number) => {
    setEffects(prev => prev.map(effect => 
      effect.id === effectId ? { ...effect, value } : effect
    ))
  }

  return (
    <ServiceShell
      title="Music Studio"
      subtitle="Create, record, and produce professional music with AI assistance"
      gradient="from-green-400 to-emerald-500"
      actions={
        <>
          <Button variant="secondary" size="sm">
            <Save size={16} className="mr-2" /> Save
          </Button>
          <Button variant="outline" size="sm">
            <Share2 size={16} className="mr-2" /> Share
          </Button>
          <Button variant="primary" size="sm">
            <Download size={16} className="mr-2" /> Export
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Studio Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Visualizer & Transport */}
          <Card className="p-6 relative overflow-hidden" glow>
            {/* Background Animation */}
            <div className="absolute inset-0 opacity-10">
              <motion.div
                animate={{ 
                  background: [
                    'radial-gradient(circle at 20% 50%, rgba(34,197,94,0.3) 0%, transparent 50%)',
                    'radial-gradient(circle at 80% 50%, rgba(34,197,94,0.3) 0%, transparent 50%)',
                    'radial-gradient(circle at 20% 50%, rgba(34,197,94,0.3) 0%, transparent 50%)',
                  ]
                }}
                transition={{ duration: 5, repeat: Infinity }}
                className="absolute inset-0"
              />
            </div>

            {/* Visualizer */}
            <div className="relative h-48 mb-6 flex items-end justify-center gap-1">
              {visualizerData.map((height, i) => (
                <motion.div
                  key={i}
                  className="flex-1 bg-gradient-to-t from-green-500 to-emerald-400 rounded-t-sm"
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.1 }}
                  style={{ opacity: height > 0 ? 0.6 + (height / 200) : 0.3 }}
                />
              ))}
            </div>

            {/* Transport Controls */}
            <div className="relative flex items-center justify-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setCurrentTime(0)}
              >
                <SkipBack size={24} />
              </Button>
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsPlaying(!isPlaying)}
                className={`
                  w-16 h-16 rounded-full flex items-center justify-center
                  ${isPlaying 
                    ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]' 
                    : 'bg-gradient-to-br from-green-500 to-emerald-500 shadow-[0_0_30px_rgba(34,197,94,0.5)]'}
                `}
              >
                {isPlaying ? <Square size={28} /> : <Play size={28} className="ml-1" />}
              </motion.button>

              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setCurrentTime(duration)}
              >
                <SkipForward size={24} />
              </Button>
            </div>

            {/* Progress Bar */}
            <div className="relative mt-6">
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden cursor-pointer">
                <motion.div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration}
                  value={currentTime}
                  onChange={(e) => setCurrentTime(parseInt(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>

            {/* Master Controls */}
            <div className="relative flex items-center justify-between mt-6 pt-6 border-t border-white/10">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </Button>
                <div className="w-32">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={masterVolume}
                    onChange={(e) => setMasterVolume(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                </div>
                <span className="text-sm font-mono w-12">{masterVolume}%</span>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="success">{compositionStyles.find(s => s.id === selectedStyle)?.bpm} BPM</Badge>
                <Badge variant="default">{compositionStyles.find(s => s.id === selectedStyle)?.key}</Badge>
              </div>
            </div>
          </Card>

          {/* Mixer / Timeline */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sliders size={20} className="text-green-400" /> Mixer
              </h3>
              <Button variant="outline" size="sm">
                <Plus size={16} className="mr-2" /> Add Track
              </Button>
            </div>

            <div className="space-y-3">
              {tracks.map((track, index) => (
                <motion.div
                  key={track.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`
                    flex items-center gap-4 p-3 rounded-lg
                    ${track.muted ? 'opacity-50' : 'bg-[#05070A]'}
                    ${track.solo ? 'ring-1 ring-yellow-500/50' : ''}
                  `}
                >
                  {/* Track Info */}
                  <div className="w-32 flex items-center gap-3">
                    <div className={`
                      w-8 h-8 rounded flex items-center justify-center
                      bg-gradient-to-br ${track.color}
                    `}>
                      {track.icon}
                    </div>
                    <span className="text-sm font-medium">{track.name}</span>
                  </div>

                  {/* Mute/Solo */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleMute(track.id)}
                      className={`
                        px-3 py-1 rounded text-xs font-bold
                        ${track.muted ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-400'}
                      `}
                    >
                      M
                    </button>
                    <button
                      onClick={() => toggleSolo(track.id)}
                      className={`
                        px-3 py-1 rounded text-xs font-bold
                        ${track.solo ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400'}
                      `}
                    >
                      S
                    </button>
                  </div>

                  {/* Volume Slider */}
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={track.volume}
                      onChange={(e) => updateTrackVolume(track.id, parseInt(e.target.value))}
                      className="flex-1 h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: track.muted ? '#ef4444' : '#22c55e' }}
                    />
                    <span className="text-xs font-mono w-8">{track.volume}</span>
                  </div>

                  {/* Mini Visualizer */}
                  <div className="w-24 h-8 flex items-end gap-0.5">
                    {new Array(12).fill(0).map((_, i) => (
                      <motion.div
                        key={i}
                        className={`flex-1 rounded-sm ${track.muted ? 'bg-gray-700' : 'bg-green-500/50'}`}
                        animate={isPlaying && !track.muted ? {
                          height: [`${Math.random() * 30}%`, `${Math.random() * 100}%`]
                        } : { height: '10%' }}
                        transition={{ duration: 0.2, repeat: Infinity }}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
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
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Music size={32} />
              </div>
              <div>
                <h3 className="font-semibold">Untitled Project</h3>
                <p className="text-sm text-gray-400">Last edited 2 min ago</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-[#05070A] rounded-lg">
                <p className="text-gray-400">Duration</p>
                <p className="font-mono">{formatTime(duration)}</p>
              </div>
              <div className="p-3 bg-[#05070A] rounded-lg">
                <p className="text-gray-400">Tracks</p>
                <p className="font-mono">{tracks.length}</p>
              </div>
              <div className="p-3 bg-[#05070A] rounded-lg">
                <p className="text-gray-400">Tempo</p>
                <p className="font-mono">{compositionStyles.find(s => s.id === selectedStyle)?.bpm} BPM</p>
              </div>
              <div className="p-3 bg-[#05070A] rounded-lg">
                <p className="text-gray-400">Key</p>
                <p className="font-mono">{compositionStyles.find(s => s.id === selectedStyle)?.key}</p>
              </div>
            </div>
          </Card>

          {/* Effects Rack */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings size={20} className="text-green-400" /> Effects
            </h3>
            <div className="space-y-4">
              {effects.map((effect) => (
                <div key={effect.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm flex items-center gap-2">
                      {effect.icon}
                      {effect.name}
                    </span>
                    <span className="text-xs text-green-400 font-mono">{effect.value}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={effect.value}
                    onChange={(e) => updateEffect(effect.id, parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Button variant="outline" className="w-full justify-start">
                <Headphones size={16} className="mr-2" /> Preview Mix
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Mic size={16} className="mr-2" /> Record Vocals
              </Button>
              <Button variant="outline" className="w-full justify-start text-red-400 hover:bg-red-500/10">
                <Trash2 size={16} className="mr-2" /> Clear All
              </Button>
            </div>
          </Card>

          {/* Pro Tip */}
          <Card className="p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30">
            <div className="flex items-start gap-3">
              <Zap className="text-green-400 shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold mb-1">Pro Tip</h4>
                <p className="text-sm text-gray-400">
                  Use the AI Composer to generate a base track, then customize individual instruments 
                  in the mixer for a unique sound.
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
        {/* AI Composer Panel */}
        {activeFeature === 'compose' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-green-400/20 to-emerald-500/20 flex items-center justify-center mb-4">
                <Wand2 size={48} className="text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Composer</h3>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                Generate original music in seconds. Select a style and let the AI create 
                a unique composition for you.
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Select Style</h4>
              <div className="grid grid-cols-1 gap-3">
                {compositionStyles.map((style) => (
                  <motion.div
                    key={style.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedStyle(style.id)}
                    className={`
                      p-4 rounded-xl cursor-pointer border-2 transition-all
                      ${selectedStyle === style.id 
                        ? 'border-green-500 bg-green-500/10' 
                        : 'border-white/10 hover:border-white/30 bg-[#05070A]'}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-semibold">{style.name}</h5>
                        <p className="text-sm text-gray-500">
                          {style.bpm} BPM • {style.key} • {style.duration}
                        </p>
                      </div>
                      {selectedStyle === style.id && (
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <span className="text-white text-sm">✓</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <Button 
              variant="glow" 
              className="w-full"
              onClick={generateMusic}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mr-2"
                  />
                  Composing...
                </>
              ) : (
                <>
                  <Wand2 size={16} className="mr-2" />
                  Generate Music
                </>
              )}
            </Button>
          </div>
        )}

        {/* Recording Panel */}
        {activeFeature === 'record' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center mb-4">
                <Mic2 size={48} className="text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Studio Recording</h3>
              <p className="text-gray-400 mb-6">
                Record professional-quality audio with real-time monitoring
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-medium">Input Level</span>
                  <Badge variant="success">Good</Badge>
                </div>
                <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-green-500 to-yellow-500 to-red-500"
                    animate={{ width: ['30%', '60%', '40%', '70%', '30%'] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[#05070A] rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Input Device</p>
                  <p className="font-medium">Built-in Microphone</p>
                </div>
                <div className="p-4 bg-[#05070A] rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Sample Rate</p>
                  <p className="font-medium">48 kHz</p>
                </div>
              </div>
            </div>

            <Button variant="glow" className="w-full">
              <Mic size={16} className="mr-2" />
              Start Recording
            </Button>
          </div>
        )}

        {/* Mixing Panel */}
        {activeFeature === 'mix' && (
          <div className="space-y-6">
            <p className="text-gray-400">
              AI-powered smart mixing automatically balances your tracks for a professional sound.
            </p>

            <div className="space-y-4">
              {[
                { name: 'Auto Balance', desc: 'Automatically adjust track levels', active: true },
                { name: 'Smart EQ', desc: 'AI-optimized frequency balancing', active: true },
                { name: 'Dynamic Compression', desc: 'Intelligent loudness control', active: false },
                { name: 'Stereo Widening', desc: 'Enhance spatial presence', active: false },
                { name: 'Harmonic Exciter', desc: 'Add warmth and clarity', active: false },
              ].map((feature) => (
                <div
                  key={feature.name}
                  className="flex items-center justify-between p-4 bg-[#05070A] rounded-lg"
                >
                  <div>
                    <h5 className="font-semibold">{feature.name}</h5>
                    <p className="text-sm text-gray-500">{feature.desc}</p>
                  </div>
                  <button
                    className={`
                      w-12 h-6 rounded-full relative transition-colors
                      ${feature.active ? 'bg-green-500' : 'bg-gray-700'}
                    `}
                  >
                    <span className={`
                      absolute top-1 w-4 h-4 rounded-full bg-white transition-all
                      ${feature.active ? 'left-7' : 'left-1'}
                    `} />
                  </button>
                </div>
              ))}
            </div>

            <Button variant="glow" className="w-full">
              <Sliders size={16} className="mr-2" />
              Auto Mix All Tracks
            </Button>
          </div>
        )}

        {/* Mastering Panel */}
        {activeFeature === 'master' && (
          <div className="space-y-6">
            <p className="text-gray-400">
              Professional mastering suite to finalize your track for release.
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h5 className="font-semibold mb-4">Loudness</h5>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-400">-14</span>
                  <input
                    type="range"
                    min={-20}
                    max={0}
                    defaultValue={-14}
                    className="flex-1 h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  />
                  <span className="text-sm text-gray-400">0 LUFS</span>
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h5 className="font-semibold mb-4">Export Format</h5>
                <div className="grid grid-cols-3 gap-3">
                  {['MP3', 'WAV', 'FLAC'].map((format) => (
                    <button
                      key={format}
                      className="p-3 rounded-lg bg-gray-800 hover:bg-yellow-500/20 border border-transparent hover:border-yellow-500/50 transition-colors"
                    >
                      {format}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h5 className="font-semibold mb-2">Quality</h5>
                <select className="w-full p-3 bg-gray-800 rounded-lg text-white border border-gray-700">
                  <option>320 kbps (Highest)</option>
                  <option>256 kbps (High)</option>
                  <option>192 kbps (Standard)</option>
                </select>
              </div>
            </div>

            <Button variant="glow" className="w-full">
              <Zap size={16} className="mr-2" />
              Master & Export
            </Button>
          </div>
        )}
      </WorkspacePanel>
    </ServiceShell>
  )
}
