"use client";

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, Play, Pause, Volume2, Activity, Check, Save, 
  Sparkles, Waveform, Radio, Signal, ChevronLeft, RefreshCw 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useIdentityStore } from '@/store/identity-store';
import { toast } from '@/components/ui/use-toast';
import SpaceBackground from '@/components/SpaceBackground';
import Link from 'next/link';

const EMOTIONS = [
  { id: 'neutral', name: 'Neutral', icon: '😐', color: '#00D4FF', desc: 'Balanced tone' },
  { id: 'professional', name: 'Commander', icon: '👨‍✈️', color: '#9D4EDD', desc: 'Authoritative' },
  { id: 'warm', name: 'Counselor', icon: '🤗', color: '#FF6B35', desc: 'Friendly tone' },
  { id: 'energetic', name: 'Explorer', icon: '🚀', color: '#06FFA5', desc: 'Enthusiastic' },
  { id: 'calm', name: 'Meditator', icon: '🧘', color: '#FFD700', desc: 'Serene voice' },
  { id: 'dramatic', name: 'Performer', icon: '🎭', color: '#FF006E', desc: 'Expressive' },
];

export default function VoiceClonerPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedEmotion, setSelectedEmotion] = useState('neutral');
  const [waveformData, setWaveformData] = useState<number[]>(Array(50).fill(20));
  const { setVoice, voice } = useIdentityStore();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setWaveformData(Array(50).fill(0).map(() => Math.random() * 80 + 20));
    }, 100);
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        setAudioBlob(new Blob(chunks, { type: 'audio/wav' }));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);

      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => { if (prev >= 60) { stopRecording(); return 60; } return prev + 1; });
      }, 1000);
    } catch (err) {
      toast({ title: "❌ Microphone Access Denied", description: "Please allow microphone access." });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  const processVoice = async () => {
    if (!audioBlob) return;
    setIsProcessing(true);
    for (let i = 0; i <= 100; i += 5) { await new Promise(r => setTimeout(r, 200)); setProgress(i); }

    const newVoice = {
      id: `voice_${Date.now()}`,
      name: 'Neural Voice Print',
      voiceId: `singularity_${Math.random().toString(36).substr(2, 12)}`,
      sampleUrl: URL.createObjectURL(audioBlob),
      speechPatterns: { pitch: 1.0, speed: 1.0, emotion: selectedEmotion, clarity: 0.98 },
      createdAt: new Date().toISOString(),
    };
    
    setVoice(newVoice);
    setIsProcessing(false);
    setProgress(0);
    toast({ title: "✅ Voice Encoded", description: "Your neural voice print has been stored." });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#000208] text-white relative overflow-hidden">
      <SpaceBackground />
      
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-purple-500/20">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="outline" size="icon" className="border-purple-500/30 hover:bg-purple-500/10">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-glow-purple">Neural Voice Encoding</h1>
            <p className="text-purple-400/60 text-xs font-mono">QUANTUM ACOUSTIC SYNTHESIS</p>
          </div>
        </div>
        <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30 font-mono">
          <Signal className="w-3 h-3 mr-1" /> ARRAY ACTIVE
        </Badge>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass-panel-purple p-8">
              <div className="w-full h-40 bg-black/50 rounded-xl mb-6 relative overflow-hidden border border-purple-500/20">
                <div className="absolute inset-0 flex items-center justify-center gap-1 px-4">
                  {waveformData.map((height, i) => (
                    <motion.div key={i} className="w-2 rounded-full" style={{ background: isRecording ? `linear-gradient(to top, #9D4EDD, #C77DFF)` : `linear-gradient(to top, #4a4a6a, #6a6a8a)`, height: `${height}%` }} />
                  ))}
                </div>
                
                {isRecording && (
                  <div className="absolute top-4 right-4 flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-red-400 font-mono text-sm">REC</span>
                    </div>
                    <span className="text-2xl font-mono text-purple-400">{formatTime(recordingTime)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-4 justify-center mb-6">
                {!audioBlob ? (
                  <Button size="lg" onClick={isRecording ? stopRecording : startRecording} className={`px-12 py-6 text-lg font-mono ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 purple-glow'}`}>
                    {isRecording ? <><Pause className="w-5 h-5 mr-2" /> TERMINATE</> : <><Mic className="w-5 h-5 mr-2" /> INITIATE</>}
                  </Button>
                ) : (
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => { setAudioBlob(null); setRecordingTime(0); }} className="border-purple-500/30 font-mono">
                      <RefreshCw className="w-4 h-4 mr-2" /> RESET
                    </Button>
                    <Button onClick={processVoice} disabled={isProcessing} className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 purple-glow font-mono">
                      {isProcessing ? <><Activity className="w-4 h-4 mr-2 animate-spin" /> ENCODING...</> : <><Sparkles className="w-4 h-4 mr-2" /> ENCODE</>}
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {isProcessing && (
              <Card className="glass-panel-purple p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-mono text-purple-400">NEURAL ENCODING</span>
                  <span className="text-2xl font-mono text-purple-400">{progress}%</span>
                </div>
                <Progress value={progress} className="h-3 bg-purple-950" />
              </Card>
            )}

            {voice && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="glass-panel p-6 border-green-500/30 bg-green-500/5">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center cyan-glow">
                      <Check className="w-8 h-8 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-green-400 font-mono text-lg">VOICE ENCODED</h3>
                      <p className="text-sm text-cyan-400/70 font-mono">ID: {voice.voiceId}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </div>

          <div className="space-y-6">
            <Card className="glass-panel-purple p-6">
              <h3 className="text-sm font-semibold font-mono mb-4 text-purple-400 flex items-center gap-2">
                <Waveform className="w-4 h-4" />
                EMOTIONAL PROFILE
              </h3>
              <div className="space-y-2">
                {EMOTIONS.map((emotion) => (
                  <button key={emotion.id} onClick={() => setSelectedEmotion(emotion.id)} className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${selectedEmotion === emotion.id ? 'border-purple-400 bg-purple-500/20' : 'border-purple-500/20 hover:border-purple-500/40 bg-black/20'}`}>
                    <span className="text-xl">{emotion.icon}</span>
                    <div>
                      <div className="text-sm font-medium font-mono" style={{ color: emotion.color }}>{emotion.name}</div>
                      <div className="text-xs text-purple-400/50">{emotion.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
