"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, 
  Upload, 
  Play, 
  Pause, 
  Check, 
  Volume2,
  Activity,
  Save,
  RotateCw,
  Wand2
} from "lucide-react";

type RecordingState = "idle" | "recording" | "processing" | "complete";

export default function VoiceCloningClient() {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState(0);
  const [voiceMetrics, setVoiceMetrics] = useState({
    clarity: 0,
    tone: 0,
    uniqueness: 0,
    stability: 0
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  // 1980s Executive Luxury Colors
  const colors = {
    gold: "#D4AF37",
    cyan: "#00FFFF",
    obsidian: "#0A0A0A",
    obsidianLight: "#1A1A1A"
  };

  // Simulate audio waveform visualization
  useEffect(() => {
    if (!canvasRef.current || recordingState !== "recording") return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.fillStyle = colors.obsidian;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const bars = 50;
      const barWidth = canvas.width / bars;
      
      for (let i = 0; i < bars; i++) {
        const height = Math.random() * canvas.height * 0.8;
        const gradient = ctx.createLinearGradient(0, canvas.height - height, 0, canvas.height);
        gradient.addColorStop(0, colors.gold);
        gradient.addColorStop(1, colors.cyan);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 2, height);
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [recordingState]);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (recordingState === "recording") {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 60) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [recordingState]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/wav" });
        setAudioBlob(blob);
        processVoice();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecordingState("recording");
      setRecordingTime(0);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecordingState("processing");
  };

  const processVoice = () => {
    // Simulate voice processing with progress
    let prog = 0;
    const interval = setInterval(() => {
      prog += 2;
      setProgress(prog);
      
      // Update metrics randomly
      setVoiceMetrics({
        clarity: Math.min(98, 70 + Math.random() * 30),
        tone: Math.min(97, 75 + Math.random() * 25),
        uniqueness: Math.min(99, 80 + Math.random() * 20),
        stability: Math.min(96, 72 + Math.random() * 28)
      });
      
      if (prog >= 100) {
        clearInterval(interval);
        setRecordingState("complete");
      }
    }, 100);
  };

  const generateVoiceHash = () => {
    return `VC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  };

  const renderIdleState = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold" style={{ color: colors.gold }}>
          Zero-Shot Voice Cloning
        </h2>
        <p className="text-gray-400">
          60-second minimum training sample for perfect voice replication
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Live Recording */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={startRecording}
          className="aspect-square rounded-2xl border-2 border-dashed border-[#D4AF37]/30 bg-[#0A0A0A]/50 flex flex-col items-center justify-center hover:border-[#D4AF37]/60 transition-colors group"
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-red-500/20 flex items-center justify-center mb-4 group-hover:from-[#D4AF37]/30 group-hover:to-red-500/30 transition-all">
            <Mic className="w-12 h-12 text-[#D4AF37]" />
          </div>
          <p className="text-[#D4AF37] font-semibold">Live Recording</p>
          <p className="text-sm text-gray-500 mt-2">60-second sample</p>
        </motion.button>

        {/* Upload */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="aspect-square rounded-2xl border-2 border-dashed border-[#00FFFF]/30 bg-[#0A0A0A]/50 flex flex-col items-center justify-center hover:border-[#00FFFF]/60 transition-colors"
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#00FFFF]/20 to-[#D4AF37]/20 flex items-center justify-center mb-4">
            <Upload className="w-12 h-12 text-[#00FFFF]" />
          </div>
          <p className="text-[#00FFFF] font-semibold">Upload Sample</p>
          <p className="text-sm text-gray-500 mt-2">WAV, MP3, M4A</p>
        </motion.div>
      </div>

      <div className="flex justify-center gap-6 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#D4AF37]" />
          <span>Real-time analysis</span>
        </div>
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-[#00FFFF]" />
          <span>Emotion preservation</span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-[#D4AF37]" />
          <span>&lt;200ms latency</span>
        </div>
      </div>
    </motion.div>
  );

  const renderRecordingState = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center min-h-[400px] space-y-8"
    >
      <div className="relative">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="w-32 h-32 rounded-full bg-red-500/20 flex items-center justify-center"
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="w-24 h-24 rounded-full bg-red-500/40 flex items-center justify-center"
          >
            <Mic className="w-12 h-12 text-red-500" />
          </motion.div>
        </motion.div>
        <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
          <div className="w-3 h-3 bg-white rounded-full" />
        </div>
      </div>

      <div className="text-center space-y-4">
        <h3 className="text-2xl font-bold text-red-500">Recording...</h3>
        <p className="text-4xl font-mono text-[#D4AF37]">
          {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
          {(recordingTime % 60).toString().padStart(2, '0')}
        </p>
        <p className="text-gray-400">Minimum: 00:60 | Recommended: 02:00</p>
      </div>

      {/* Waveform Visualization */}
      <canvas 
        ref={canvasRef}
        width={400}
        height={100}
        className="rounded-xl border border-[#D4AF37]/30"
      />

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={stopRecording}
        className="px-8 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-bold text-white flex items-center gap-2"
      >
        <Pause className="w-5 h-5" />
        Stop Recording
      </motion.button>
    </motion.div>
  );

  const renderProcessingState = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center min-h-[400px] space-y-8"
    >
      <div className="relative w-48 h-48">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-4 border-[#D4AF37]/20 border-t-[#D4AF37]"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-4 rounded-full border-4 border-[#00FFFF]/20 border-t-[#00FFFF]"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Wand2 className="w-16 h-16 text-[#D4AF37]" />
        </div>
      </div>

      <div className="text-center space-y-4">
        <h3 className="text-2xl font-bold text-[#D4AF37]">Encoding Vocal Print</h3>
        <p className="text-gray-400">Analyzing speech patterns and intonation...</p>
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Processing</span>
          <span className="text-[#00FFFF]">{progress}%</span>
        </div>
        <div className="h-2 bg-[#0A0A0A] rounded-full overflow-hidden border border-[#D4AF37]/30">
          <motion.div
            className="h-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Voice Metrics */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        {Object.entries(voiceMetrics).map(([key, value]) => (
          <div key={key} className="bg-[#1A1A1A] rounded-xl p-4 border border-[#D4AF37]/20">
            <p className="text-xs text-gray-400 uppercase mb-1">{key}</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-[#00FFFF]">{value.toFixed(1)}</span>
              <span className="text-sm text-gray-500 mb-1">%</span>
            </div>
            <div className="h-1 bg-[#0A0A0A] rounded-full mt-2">
              <div 
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-full transition-all duration-500"
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );

  const renderCompleteState = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8"
    >
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] flex items-center justify-center"
        >
          <Check className="w-12 h-12 text-black" />
        </motion.div>
        <h2 className="text-3xl font-bold text-[#D4AF37]">Voice Clone Established</h2>
        <p className="text-gray-400">Your vocal identity has been encoded and secured</p>
      </div>

      {/* Voice Identity Card */}
      <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-[#D4AF37]/30 max-w-lg mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#00FFFF]/20 flex items-center justify-center">
            <Volume2 className="w-8 h-8 text-[#D4AF37]" />
          </div>
          <div>
            <p className="text-sm text-gray-400">GLOBAL_VOICE_ID</p>
            <p className="text-[#00FFFF] font-mono text-lg">{generateVoiceHash()}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-[#D4AF37]/10">
            <span className="text-gray-400">Sample Duration</span>
            <span className="text-[#D4AF37]">{recordingTime}s</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[#D4AF37]/10">
            <span className="text-gray-400">Quality Score</span>
            <span className="text-[#00FFFF]">98.7%</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[#D4AF37]/10">
            <span className="text-gray-400">Emotion Range</span>
            <span className="text-[#D4AF37]">12 profiles</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">Latency</span>
            <span className="text-[#00FFFF]">147ms</span>
          </div>
        </div>
      </div>

      {/* Audio Preview */}
      <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-[#D4AF37]/30 max-w-lg mx-auto">
        <p className="text-sm text-gray-400 mb-4">Preview Cloned Voice</p>
        <div className="flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-14 h-14 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] flex items-center justify-center"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-black" />
            ) : (
              <Play className="w-6 h-6 text-black ml-1" />
            )}
          </motion.button>
          <div className="flex-1">
            <div className="h-12 bg-[#0A0A0A] rounded-lg flex items-center px-4 gap-1">
              {Array.from({length: 30}).map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: isPlaying ? [4, 16 + Math.random() * 20, 4] : 4 
                  }}
                  transition={{ 
                    duration: 0.3, 
                    repeat: isPlaying ? Infinity : 0,
                    delay: i * 0.02 
                  }}
                  className="w-1 bg-gradient-to-t from-[#D4AF37] to-[#00FFFF] rounded-full"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setRecordingState("idle");
            setProgress(0);
            setRecordingTime(0);
          }}
          className="px-8 py-3 bg-[#1A1A1A] border border-[#D4AF37]/50 rounded-xl text-[#D4AF37] flex items-center gap-2"
        >
          <RotateCw className="w-5 h-5" />
          Re-record
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl text-black font-bold flex items-center gap-2"
        >
          <Save className="w-5 h-5" />
          Save & Continue
        </motion.button>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0A0A0A] via-[#1A1A1A] to-[#0A0A0A] border-b border-[#D4AF37]/20 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] flex items-center justify-center">
              <Volume2 className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#D4AF37]">Zero-Shot Voice Cloning</h1>
              <p className="text-gray-400">Establish your primary audio identity source</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <AnimatePresence mode="wait">
          {recordingState === "idle" && renderIdleState()}
          {recordingState === "recording" && renderRecordingState()}
          {recordingState === "processing" && renderProcessingState()}
          {recordingState === "complete" && renderCompleteState()}
        </AnimatePresence>
      </div>
    </div>
  );
}
