"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Mic, Mic2, Play, Pause, Square, Volume2, VolumeX, Download, 
  Share2, Save, Trash2, Wand2, Sparkles, Settings, Sliders,
  Headphones, Radio, Zap, Copy, CheckCircle, Clock, Calendar,
  User, Users, Star, TrendingUp, BarChart3, FileAudio
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
    id: 'record', 
    title: 'Voice Recording', 
    description: 'High-quality voice capture', 
    icon: <Mic size={24} />, 
    gradient: 'from-purple-400 to-pink-500',
    color: 'purple'
  },
  { 
    id: 'clone', 
    title: 'AI Cloning', 
    description: 'Create voice model with AI', 
    icon: <Wand2 size={24} />, 
    gradient: 'from-cyan-400 to-blue-500',
    color: 'cyan'
  },
  { 
    id: 'synthesize', 
    title: 'Text to Speech', 
    description: 'Generate speech from text', 
    icon: <Sparkles size={24} />, 
    gradient: 'from-green-400 to-emerald-500',
    color: 'green'
  },
  { 
    id: 'enhance', 
    title: 'Voice Enhancement', 
    description: 'AI-powered audio cleanup', 
    icon: <Zap size={24} />, 
    gradient: 'from-yellow-400 to-orange-500',
    color: 'yellow'
  },
]

// Voice models
const voiceModels = [
  { id: 1, name: 'My Voice', status: 'ready', quality: 98, samples: 50, duration: '5:30', lastUsed: '2 min ago', isDefault: true },
  { id: 2, name: 'Professional', status: 'ready', quality: 95, samples: 100, duration: '12:00', lastUsed: '1 hour ago', isDefault: false },
  { id: 3, name: 'Narrator', status: 'training', quality: 0, samples: 30, duration: '3:00', lastUsed: 'Training...', isDefault: false },
  { id: 4, name: 'Character A', status: 'ready', quality: 92, samples: 75, duration: '8:45', lastUsed: '3 days ago', isDefault: false },
]

// Language options
const languages = [
  { id: 'en', name: 'English (US)', flag: '🇺🇸' },
  { id: 'en-uk', name: 'English (UK)', flag: '🇬🇧' },
  { id: 'es', name: 'Spanish', flag: '🇪🇸' },
  { id: 'fr', name: 'French', flag: '🇫🇷' },
  { id: 'de', name: 'German', flag: '🇩🇪' },
  { id: 'it', name: 'Italian', flag: '🇮🇹' },
  { id: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { id: 'ko', name: 'Korean', flag: '🇰🇷' },
]

// Emotion presets
const emotions = [
  { id: 'neutral', name: 'Neutral', icon: '😐', desc: 'Balanced and natural' },
  { id: 'happy', name: 'Happy', icon: '😊', desc: 'Cheerful and upbeat' },
  { id: 'sad', name: 'Sad', icon: '😢', desc: 'Melancholic and somber' },
  { id: 'excited', name: 'Excited', icon: '🤩', desc: 'Energetic and enthusiastic' },
  { id: 'calm', name: 'Calm', icon: '😌', desc: 'Relaxed and soothing' },
  { id: 'angry', name: 'Angry', icon: '😠', desc: 'Intense and forceful' },
  { id: 'professional', name: 'Professional', icon: '👔', desc: 'Formal and authoritative' },
  { id: 'friendly', name: 'Friendly', icon: '🤗', desc: 'Warm and approachable' },
]

export default function VoiceClonerPage() {
  const [activeFeature, setActiveFeature] = useState('record')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelTitle, setPanelTitle] = useState('Workspace')
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [selectedModel, setSelectedModel] = useState(1)
  const [selectedLanguage, setSelectedLanguage] = useState('en')
  const [selectedEmotion, setSelectedEmotion] = useState('neutral')
  const [textInput, setTextInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [waveformData, setWaveformData] = useState<number[]>(new Array(60).fill(0))
  const [volume, setVolume] = useState(80)
  const [isMuted, setIsMuted] = useState(false)
  const [pitch, setPitch] = useState(50)
  const [speed, setSpeed] = useState(50)
  const [clarity, setClarity] = useState(75)
  const [history, setHistory] = useState<string[]>([])

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1)
        setWaveformData(prev => prev.map(() => Math.random() * 100))
      }, 100)
    } else {
      setWaveformData(new Array(60).fill(0))
    }
    return () => clearInterval(interval)
  }, [isRecording])

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

  // Start/stop recording
  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false)
      setHistory(prev => [...prev, `Recording ${history.length + 1}`])
    } else {
      setIsRecording(true)
      setRecordingTime(0)
    }
  }

  // Generate speech
  const generateSpeech = () => {
    if (!textInput.trim()) return
    setIsGenerating(true)
    setGenerationProgress(0)
    
    const interval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsGenerating(false)
          setHistory(prev => [...prev, `Generated: ${textInput.slice(0, 30)}...`])
          return 100
        }
        return prev + 5
      })
    }, 100)
  }

  // Clone voice
  const cloneVoice = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setIsGenerating(false)
    }, 5000)
  }

  return (
    <ServiceShell
      title="Voice Cloner"
      subtitle="Clone, synthesize, and enhance voices with neural precision"
      gradient="from-purple-400 to-pink-500"
      actions={
        <>
          <Button variant="secondary" size="sm">
            <Save size={16} className="mr-2" /> Save Model
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
          {/* Voice Visualizer */}
          <Card className="p-8 min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden" glow>
            {/* Background Animation */}
            <div className="absolute inset-0 opacity-10">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent"
                  style={{ top: `${i * 5}%`, left: 0, right: 0 }}
                  animate={{ opacity: [0, 1, 0], x: ['-100%', '100%'] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
            </div>

            {/* Central Visualizer */}
            <div className="relative z-10 flex flex-col items-center">
              {/* Voice Circle */}
              <motion.div
                animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.5, repeat: Infinity }}
                className={`
                  w-48 h-48 rounded-full flex items-center justify-center mb-8 relative
                  ${isRecording 
                    ? 'bg-gradient-to-br from-red-500 to-pink-600 shadow-[0_0_60px_rgba(239,68,68,0.5)]' 
                    : 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-2 border-purple-500/30'}
                `}
              >
                {isRecording ? (
                  <Square size={48} />
                ) : isPlaying ? (
                  <Pause size={48} />
                ) : (
                  <Mic size={48} className="text-purple-400" />
                )}

                {/* Recording Rings */}
                {isRecording && (
                  <>
                    <motion.div
                      className="absolute inset-0 border-4 border-red-400/30 rounded-full"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <motion.div
                      className="absolute inset-4 border-4 border-pink-400/20 rounded-full"
                      animate={{ scale: [1.2, 1, 1.2], opacity: [0, 0.5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                    />
                  </>
                )}
              </motion.div>

              {/* Recording Timer */}
              <div className="text-center mb-6">
                <h3 className="text-3xl font-mono font-bold mb-2">
                  {formatTime(recordingTime)}
                </h3>
                <p className="text-gray-400">
                  {isRecording ? 'Recording in progress...' : 'Ready to record'}
                </p>
              </div>

              {/* Waveform */}
              <div className="flex items-end justify-center gap-1 h-24 w-full max-w-lg mb-6">
                {waveformData.map((height, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-purple-500 to-pink-400 rounded-full"
                    animate={{ height: `${Math.max(10, height)}%` }}
                    transition={{ duration: 0.1 }}
                  />
                ))}
              </div>

              {/* Main Controls */}
              <div className="flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={isRecording}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </Button>

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleRecording}
                  className={`
                    w-20 h-20 rounded-full flex items-center justify-center
                    ${isRecording 
                      ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.5)]' 
                      : 'bg-gradient-to-br from-purple-500 to-pink-600 shadow-[0_0_40px_rgba(168,85,247,0.5)]'}
                  `}
                >
                  {isRecording ? <Square size={32} /> : <Mic size={32} />}
                </motion.button>

                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setRecordingTime(0)}
                  disabled={isRecording}
                >
                  <Trash2 size={20} />
                </Button>
              </div>
            </div>

            {/* Volume Control */}
            <div className="absolute bottom-6 right-6 flex items-center gap-3">
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
                  className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            </div>
          </Card>

          {/* Voice Settings */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sliders size={20} className="text-purple-400" /> Voice Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Pitch</span>
                  <span className="font-mono">{pitch}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pitch}
                  onChange={(e) => setPitch(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Speed</span>
                  <span className="font-mono">{speed}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={speed}
                  onChange={(e) => setSpeed(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Clarity</span>
                  <span className="font-mono">{clarity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={clarity}
                  onChange={(e) => setClarity(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
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
          {/* Voice Models */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Users size={20} className="text-purple-400" /> Voice Models
              </h3>
              <Button variant="outline" size="sm">
                <Plus size={14} className="mr-1" /> New
              </Button>
            </div>
            <div className="space-y-3">
              {voiceModels.map((model) => (
                <motion.div
                  key={model.id}
                  whileHover={{ x: 4 }}
                  onClick={() => setSelectedModel(model.id)}
                  className={`
                    p-4 rounded-lg cursor-pointer border-2 transition-all
                    ${selectedModel === model.id 
                      ? 'border-purple-500 bg-purple-500/10' 
                      : 'border-transparent bg-[#05070A] hover:bg-white/5'}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center
                        ${model.status === 'ready' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}
                      `}>
                        {model.status === 'ready' ? <CheckCircle size={20} /> : <Clock size={20} />}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          {model.name}
                          {model.isDefault && <Badge variant="success" className="text-xs">Default</Badge>}
                        </h4>
                        <p className="text-xs text-gray-500">
                          {model.samples} samples • {model.duration}
                        </p>
                      </div>
                    </div>
                    {model.status === 'ready' && (
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-green-400">
                          <Star size={12} />
                          <span className="text-sm font-bold">{model.quality}%</span>
                        </div>
                        <p className="text-xs text-gray-500">{model.lastUsed}</p>
                      </div>
                    )}
                  </div>
                  {model.status === 'training' && (
                    <div className="mt-3">
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-yellow-500"
                          animate={{ width: ['0%', '60%', '40%', '80%'] }}
                          transition={{ duration: 3, repeat: Infinity }}
                        />
                      </div>
                      <p className="text-xs text-yellow-400 mt-1">Training model...</p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </Card>

          {/* Recent Generations */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock size={20} className="text-purple-400" /> Recent
            </h3>
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
              ) : (
                history.slice(-5).reverse().map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[#05070A] rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileAudio size={16} className="text-purple-400" />
                      <span className="text-sm truncate max-w-[150px]">{item}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Play size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Download size={14} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Stats */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 size={20} className="text-purple-400" /> Stats
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-[#05070A] rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-400">{voiceModels.length}</p>
                <p className="text-xs text-gray-500">Models</p>
              </div>
              <div className="p-3 bg-[#05070A] rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-400">{history.length}</p>
                <p className="text-xs text-gray-500">Generations</p>
              </div>
              <div className="p-3 bg-[#05070A] rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-400">12h</p>
                <p className="text-xs text-gray-500">Audio</p>
              </div>
              <div className="p-3 bg-[#05070A] rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-400">98%</p>
                <p className="text-xs text-gray-500">Quality</p>
              </div>
            </div>
          </Card>

          {/* Pro Tip */}
          <Card className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30">
            <div className="flex items-start gap-3">
              <Sparkles className="text-purple-400 shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold mb-1">Pro Tip</h4>
                <p className="text-sm text-gray-400">
                  Record at least 5 minutes of clear audio for best cloning results. 
                  Use a quiet environment and speak naturally.
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
        {/* Recording Panel */}
        {activeFeature === 'record' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-purple-400/20 to-pink-500/20 flex items-center justify-center mb-4">
                <Mic size={48} className="text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Voice Recording</h3>
              <p className="text-gray-400 mb-6">
                Record high-quality samples for voice cloning
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-medium">Input Level</span>
                  <Badge variant={isRecording ? "success" : "default"}>
                    {isRecording ? 'Recording' : 'Standby'}
                  </Badge>
                </div>
                <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                    animate={isRecording ? {
                      width: [`${Math.random() * 30}%`, `${Math.random() * 80 + 20}%`]
                    } : { width: '5%' }}
                    transition={{ duration: 0.1, repeat: Infinity }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[#05070A] rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Sample Rate</p>
                  <p className="font-medium">48 kHz</p>
                </div>
                <div className="p-4 bg-[#05070A] rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Bit Depth</p>
                  <p className="font-medium">24-bit</p>
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <p className="text-sm text-gray-400 mb-3">Recording Tips</p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-400" />
                    Use a quiet environment
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-400" />
                    Speak naturally and clearly
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-400" />
                    Record at least 5 minutes
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-400" />
                    Vary your tone and emotion
                  </li>
                </ul>
              </div>
            </div>

            <Button 
              variant="glow" 
              className="w-full"
              onClick={toggleRecording}
            >
              {isRecording ? (
                <>
                  <Square size={16} className="mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic size={16} className="mr-2" />
                  Start Recording
                </>
              )}
            </Button>
          </div>
        )}

        {/* AI Cloning Panel */}
        {activeFeature === 'clone' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center mb-4">
                <Wand2 size={48} className="text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Voice Cloning</h3>
              <p className="text-gray-400 mb-6">
                Create a perfect digital copy of your voice
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Selected Recordings</h4>
                <div className="space-y-2">
                  {['Recording 1 (2:30)', 'Recording 2 (1:45)', 'Recording 3 (3:15)'].map((rec, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                      <span className="text-sm">{rec}</span>
                      <CheckCircle size={16} className="text-green-400" />
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
                  <p className="text-sm text-cyan-400">
                    Total: 7:30 minutes of audio
                  </p>
                </div>
              </div>

              <div className="p-4 bg-[#05070A] rounded-lg">
                <h4 className="font-semibold mb-3">Training Options</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Quality Level</span>
                    <select className="bg-gray-800 rounded px-3 py-1 text-sm">
                      <option>Ultra (Slow)</option>
                      <option>High (Recommended)</option>
                      <option>Fast</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Language</span>
                    <select 
                      className="bg-gray-800 rounded px-3 py-1 text-sm"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                    >
                      {languages.map(lang => (
                        <option key={lang.id} value={lang.id}>{lang.flag} {lang.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <Button 
              variant="glow" 
              className="w-full"
              onClick={cloneVoice}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mr-2"
                  />
                  Training AI Model...
                </>
              ) : (
                <>
                  <Wand2 size={16} className="mr-2" />
                  Start Cloning Process
                </>
              )}
            </Button>
          </div>
        )}

        {/* Text to Speech Panel */}
        {activeFeature === 'synthesize' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-green-400/20 to-emerald-500/20 flex items-center justify-center mb-4">
                <Sparkles size={48} className="text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Text to Speech</h3>
              <p className="text-gray-400 mb-6">
                Generate natural speech from any text
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Enter Text</label>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type or paste your text here..."
                  className="w-full h-40 bg-[#05070A] border border-white/10 rounded-lg p-4 text-white placeholder-gray-600 resize-none focus:outline-none focus:border-green-500/50"
                />
                <p className="text-xs text-gray-500 mt-2 text-right">
                  {textInput.length} characters
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Select Emotion</h4>
                <div className="grid grid-cols-2 gap-2">
                  {emotions.map((emotion) => (
                    <motion.button
                      key={emotion.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedEmotion(emotion.id)}
                      className={`
                        p-3 rounded-lg text-left transition-all
                        ${selectedEmotion === emotion.id 
                          ? 'bg-green-500/20 border border-green-500/50' 
                          : 'bg-[#05070A] border border-transparent hover:border-white/20'}
                      `}
                    >
                      <span className="text-2xl mr-2">{emotion.icon}</span>
                      <span className="font-medium">{emotion.name}</span>
                      <p className="text-xs text-gray-500 mt-1">{emotion.desc}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>

            <Button 
              variant="glow" 
              className="w-full"
              onClick={generateSpeech}
              disabled={isGenerating || !textInput.trim()}
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
                  <Sparkles size={16} className="mr-2" />
                  Generate Speech
                </>
              )}
            </Button>
          </div>
        )}

        {/* Enhancement Panel */}
        {activeFeature === 'enhance' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-yellow-400/20 to-orange-500/20 flex items-center justify-center mb-4">
                <Zap size={48} className="text-yellow-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Voice Enhancement</h3>
              <p className="text-gray-400 mb-6">
                AI-powered audio cleanup and enhancement
              </p>
            </div>

            <div className="space-y-4">
              {[
                { name: 'Noise Reduction', desc: 'Remove background noise', value: 70 },
                { name: 'De-essing', desc: 'Reduce harsh sibilance', value: 45 },
                { name: 'Plosive Removal', desc: 'Clean up p and b sounds', value: 60 },
                { name: 'Normalization', desc: 'Consistent volume levels', value: 80 },
                { name: 'EQ Enhancement', desc: 'Optimize frequencies', value: 55 },
                { name: 'Compression', desc: 'Dynamic range control', value: 40 },
              ].map((enhancement) => (
                <div key={enhancement.name} className="p-4 bg-[#05070A] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h5 className="font-semibold text-sm">{enhancement.name}</h5>
                      <p className="text-xs text-gray-500">{enhancement.desc}</p>
                    </div>
                    <span className="text-sm text-yellow-400 font-mono">{enhancement.value}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    defaultValue={enhancement.value}
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  />
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
