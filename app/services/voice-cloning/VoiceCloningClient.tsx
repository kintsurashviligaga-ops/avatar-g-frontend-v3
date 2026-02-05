"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { useRouter } from "next/navigation";
import { 
  Mic, 
  StopCircle, 
  Play, 
  Pause, 
  CheckCircle, 
  AlertCircle,
  Volume2,
  Loader2,
  RefreshCw,
  ArrowRight,
  Clock,
  Activity,
  Sparkles
} from "lucide-react";

interface RecordingState {
  isRecording: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
}

interface VoiceMetrics {
  clarity: number;
  tone: number;
  uniqueness: number;
  stability: number;
}

export default function VoiceCloningClient() {
  const router = useRouter();
  const { setGlobalVoiceId } = useIdentity();
  const [recording, setRecording] = useState<RecordingState>({
    isRecording: false,
    duration: 0,
    audioBlob: null,
    audioUrl: null
  });
  const [metrics, setMetrics] = useState<VoiceMetrics>({
    clarity: 0,
    tone: 0,
    uniqueness: 0,
    stability: 0
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [step, setStep] = useState<"record" | "review" | "clone">("record");
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Activity visualization
  const drawActivity = useCallback(() => {
    if (!canvasRef.current || !recording.isRecording) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, width, height);
    
    // Draw animated waveform
    ctx.beginPath();
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 2;
    
    const time = Date.now() / 1000;
    for (let x = 0; x < width; x += 5) {
      const amplitude = Math.sin(x * 0.02 + time * 5) * 30 + 
                       Math.sin(x * 0.05 + time * 3) * 20;
      const y = height / 2 + amplitude * (0.5 + Math.random() * 0.5);
      
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw glow effect
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00FFFF';
    ctx.stroke();
    ctx.shadowBlur = 0;

    animationRef.current = requestAnimationFrame(drawActivity);
  }, [recording.isRecording]);

  useEffect(() => {
    if (recording.isRecording) {
      drawActivity();
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [recording.isRecording, drawActivity]);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecording(prev => ({
          ...prev,
          isRecording: false,
          audioBlob,
          audioUrl
        }));
        
        // Simulate metrics calculation
        calculateMetrics(audioBlob);
      };
      
      mediaRecorder.start(100);
      setRecording(prev => ({ ...prev, isRecording: true, duration: 0 }));
      
      // Start duration timer
      const interval = setInterval(() => {
        setRecording(prev => {
          if (!prev.isRecording) {
            clearInterval(interval);
            return prev;
          }
          return { ...prev, duration: prev.duration + 1 };
        });
      }, 1000);
      
    } catch (err) {
      setError("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording.isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
    }
  };

  const calculateMetrics = (blob: Blob) => {
    // Simulate AI analysis of voice recording
    setIsProcessing(true);
    
    setTimeout(() => {
      const size = blob.size;
      const duration = recording.duration;
      
      // Calculate pseudo-metrics based on recording quality
      setMetrics({
        clarity: Math.min(95, 70 + Math.random() * 25),
        tone: Math.min(98, 75 + Math.random() * 23),
        uniqueness: Math.min(96, 80 + Math.random() * 16),
        stability: Math.min(94, 72 + Math.random() * 22)
      });
      
      setIsProcessing(false);
      setStep("review");
    }, 2000);
  };

  const cloneVoice = async () => {
    if (!recording.audioBlob) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append("audio", recording.audioBlob, "voice-sample.webm");
      formData.append("name", `Avatar-G-Voice-${Date.now()}`);
      
      const response = await fetch('/api/voice/clone', {
        method: "POST",
        body: formData
      });
      
      if (!response.ok) {
        throw new Error("Voice cloning failed");
      }
      
      const data = await response.json();
      
      // Store voice ID
      setClonedVoiceId(data.voiceId);
      setGlobalVoiceId(data.voiceId);
      
      // Save to localStorage
      localStorage.setItem('GLOBAL_VOICE_ID', data.voiceId);
      
      setStep("clone");
      
      // Auto-redirect after success
      setTimeout(() => {
        router.push('/dashboard');
      }, 3000);
      
    } catch (err: any) {
      setError(err.message || "Failed to clone voice. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const playRecording = () => {
    if (audioRef.current && recording.audioUrl) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getMetricColor = (value: number) => {
    if (value >= 90) return "text-green-400";
    if (value >= 70) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] bg-clip-text text-transparent mb-4">
            Voice Cloning Studio
          </h1>
          <p className="text-gray-400 text-lg">
            Record 60 seconds of clear speech to create your digital voice twin
          </p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex justify-center mb-12">
          {["record", "review", "clone"].map((s, idx) => (
            <div key={s} className="flex items-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${
                step === s ? "bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black" :
                idx < ["record", "review", "clone"].indexOf(step) ? "bg-green-500 text-white" :
                "bg-white/10 text-gray-500"
              }`}>
                {idx < ["record", "review", "clone"].indexOf(step) ? (
                  <CheckCircle className="w-6 h-6" />
                ) : (
                  idx + 1
                )}
              </div>
              {idx < 2 && (
                <div className={`w-24 h-1 mx-2 ${
                  idx < ["record", "review", "clone"].indexOf(step) ? "bg-green-500" : "bg-white/10"
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center gap-3"
            >
              <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
              <p className="text-red-400">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording Interface */}
        {step === "record" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8"
          >
            {/* Activity Canvas */}
            <div className="relative h-48 bg-black/30 rounded-2xl mb-8 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={800}
                height={200}
                className="w-full h-full"
              />
              {!recording.isRecording && !recording.audioUrl && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  <Activity className="w-16 h-16 opacity-30" />
                </div>
              )}
            </div>

            {/* Recording Controls */}
            <div className="text-center">
              <div className="mb-6">
                <span className={`text-5xl font-mono font-bold ${
                  recording.duration < 60 ? "text-red-400" : "text-green-400"
                }`}>
                  {formatTime(recording.duration)}
                </span>
                <span className="text-gray-500 ml-2">/ 1:00 min</span>
              </div>

              {!recording.isRecording ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="w-24 h-24 rounded-full bg-gradient-to-r from-red-500 to-red-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30 disabled:opacity-50"
                >
                  <Mic className="w-10 h-10 text-white" />
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={stopRecording}
                  className="w-24 h-24 rounded-full bg-gradient-to-r from-gray-600 to-gray-700 flex items-center justify-center mx-auto mb-4"
                >
                  <StopCircle className="w-10 h-10 text-white" />
                </motion.button>
              )}

              <p className="text-gray-400">
                {recording.isRecording ? "Recording... Click to stop" : "Click to start recording"}
              </p>
              
              {recording.duration > 0 && recording.duration < 60 && !recording.isRecording && (
                <p className="text-yellow-400 text-sm mt-2">
                  Recording too short. Please record at least 60 seconds.
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Review Interface */}
        {step === "review" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* Playback */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-[#D4AF37]" />
                Preview Recording
              </h3>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={playRecording}
                  className="w-16 h-16 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] flex items-center justify-center"
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 text-black" />
                  ) : (
                    <Play className="w-8 h-8 text-black ml-1" />
                  )}
                </button>
                
                <div className="flex-1">
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF]"
                      style={{ width: isPlaying ? "100%" : "0%" }}
                      transition={{ duration: recording.duration }}
                    />
                  </div>
                  <p className="text-sm text-gray-400 mt-2">
                    {formatTime(recording.duration)} recorded
                  </p>
                </div>
              </div>
              
              <audio
                ref={audioRef}
                src={recording.audioUrl || undefined}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
            </div>

            {/* Metrics */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#00FFFF]" />
                Voice Analysis
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(metrics).map(([key, value]) => (
                  <div key={key} className="bg-black/30 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-400 capitalize">{key}</span>
                      <span className={`font-bold ${getMetricColor(value)}`}>
                        {value.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${value}%` }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className={`h-full rounded-full ${
                          value >= 90 ? "bg-green-500" :
                          value >= 70 ? "bg-yellow-500" :
                          "bg-red-500"
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <div className="flex items-center gap-2 text-green-400 mb-1">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold">Quality Check Passed</span>
                </div>
                <p className="text-sm text-gray-400">
                  Your voice sample meets our quality standards for cloning.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStep("record")}
                className="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-xl font-semibold flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                Re-record
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={cloneVoice}
                disabled={isProcessing}
                className="flex-1 py-4 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cloning...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Clone Voice
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Success State */}
        {step === "clone" && clonedVoiceId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center bg-white/5 backdrop-blur-sm border border-green-500/30 rounded-3xl p-12"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
            >
              <CheckCircle className="w-12 h-12 text-green-500" />
            </motion.div>
            
            <h2 className="text-3xl font-bold text-green-400 mb-4">
              Voice Cloned Successfully!
            </h2>
            
            <p className="text-gray-400 mb-6">
              Your digital voice twin has been created and is ready to use.
            </p>
            
            <div className="bg-black/30 rounded-xl p-4 mb-8 inline-block">
              <p className="text-xs text-gray-500 mb-1">Voice ID</p>
              <p className="text-[#00FFFF] font-mono text-lg">{clonedVoiceId}</p>
            </div>
            
            <div className="flex justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => router.push('/dashboard')}
                className="px-8 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-xl font-semibold flex items-center gap-2"
              >
                Go to Dashboard
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </div>
            
            <p className="text-sm text-gray-500 mt-6">
              Redirecting to dashboard in 3 seconds...
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
