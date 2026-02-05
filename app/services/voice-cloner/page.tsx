"use client"

import { useState, useRef } from "react"
import { motion } from "framer-motion"
import { Mic, Play, Pause, StopCircle, Download, Share2, Volume2, Wand2, Music, Radio } from "lucide-react"
import { ServiceShell } from "@/components/shared/ServiceShell"
import { FeatureCard } from "@/components/shared/FeatureCard"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Tabs } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

export default function VoiceClonerPage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [waveformData, setWaveformData] = useState<number[]>(new Array(50).fill(0))
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const startRecording = () => {
    setIsRecording(true)
    setRecordingTime(0)
    intervalRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1)
      setWaveformData(prev => prev.map(() => Math.random() * 100))
    }, 100)
  }

  const stopRecording = () => {
    setIsRecording(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <ServiceShell
      title="Voice Cloner"
      subtitle="Clone any voice with neural precision and real-time synthesis"
      gradient="from-purple-400 to-pink-500"
      actions={
        <>
          <Button variant="secondary" size="sm">
            <Download size={16} className="mr-2" /> Export
          </Button>
          <Button variant="primary" size="sm">
            <Share2 size={16} className="mr-2" /> Share
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Studio */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-8 min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden" glow>
            {/* Background Animation */}
            <div className="absolute inset-0 opacity-20">
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

            {/* Recording Visualizer */}
            <div className="relative z-10 flex flex-col items-center">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => isRecording ? stopRecording() : startRecording()}
                className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 transition-all ${
                  isRecording 
                    ? 'bg-red-500 shadow-[0_0_60px_rgba(239,68,68,0.5)] animate-pulse' 
                    : 'bg-gradient-to-br from-purple-500 to-pink-600 shadow-[0_0_60px_rgba(168,85,247,0.5)]'
                }`}
              >
                {isRecording ? <StopCircle size={48} /> : <Mic size={48} />}
              </motion.button>

              <h3 className="text-2xl font-bold mb-2">
                {isRecording ? 'Recording...' : 'Ready to Record'}
              </h3>
              <p className="text-gray-400 mb-4">
                {isRecording ? formatTime(recordingTime) : 'Click the microphone to start'}
              </p>

              {/* Waveform */}
              <div className="flex items-center gap-1 h-24 w-full max-w-md">
                {waveformData.map((height, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-purple-500 to-pink-400 rounded-full"
                    animate={{ height: isRecording ? `${height}%` : '10%' }}
                    transition={{ duration: 0.1 }}
                  />
                ))}
              </div>
            </div>
          </Card>

          {/* Playback Controls */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Recording Preview</h3>
              <Badge variant="success">Ready</Badge>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </Button>
              <div className="flex-1 h-12 bg-[#05070A] rounded-lg overflow-hidden flex items-center px-4">
                <div className="flex gap-1 w-full">
                  {new Array(30).fill(0).map((_, i) => (
                    <div 
                      key={i} 
                      className="flex-1 bg-purple-500/30 rounded-full"
                      style={{ height: `${Math.random() * 100}%` }}
                    />
                  ))}
                </div>
              </div>
              <span className="text-sm text-gray-400">00:00 / 00:15</span>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Wand2 size={20} className="text-purple-400" /> AI Enhancement
            </h3>
            <div className="space-y-4">
              <Slider label="Pitch" defaultValue={50} />
              <Slider label="Speed" defaultValue={50} />
              <Slider label="Clarity" defaultValue={75} />
              <Slider label="Emotion" defaultValue={60} />
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Voice Library</h3>
            <div className="space-y-3">
              {[
                { name: 'My Voice', duration: '0:15', date: 'Just now' },
                { name: 'Professional', duration: '2:30', date: '2 hours ago' },
                { name: 'Narrator', duration: '5:45', date: 'Yesterday' },
                { name: 'Character A', duration: '1:20', date: '3 days ago' }
              ].map((voice, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-[#05070A] rounded-lg hover:bg-purple-500/10 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Music size={16} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{voice.name}</p>
                      <p className="text-xs text-gray-400">{voice.date}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{voice.duration}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Export Options</h3>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="sm">MP3</Button>
              <Button variant="outline" size="sm">WAV</Button>
              <Button variant="outline" size="sm">FLAC</Button>
              <Button variant="outline" size="sm">OGG</Button>
            </div>
          </Card>
        </div>
      </div>
    </ServiceShell>
  )
}
