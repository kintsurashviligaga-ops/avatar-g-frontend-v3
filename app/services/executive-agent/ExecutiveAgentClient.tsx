"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  Send, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Play,
  Pause,
  Volume2,
  FileText,
  MessageSquare
} from "lucide-react";

interface Task {
  id: string;
  type: "text" | "voice" | "document";
  content: string;
  status: "pending" | "processing" | "complete" | "failed";
  result?: string;
  createdAt: string;
  completedAt?: string;
}

export default function ExecutiveAgentClient() {
  const { globalAvatarId, globalVoiceId, verifyIdentity } = useIdentity();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "active" | "ended">("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  
  const hasIdentity = verifyIdentity();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Simulate audio visualization
  useEffect(() => {
    if (isCallActive) {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isCallActive]);

  const submitTask = async (type: "text" | "voice" | "document") => {
    if (!input.trim() && type === "text") return;
    
    const newTask: Task = {
      id: `task-${Date.now()}`,
      type,
      content: input,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    
    setTasks(prev => [newTask, ...prev]);
    setActiveTask(newTask);
    setInput("");
    
    // Simulate processing
    setTimeout(() => {
      setTasks(prev => prev.map(t => 
        t.id === newTask.id ? { ...t, status: "processing" } : t
      ));
      
      // Simulate completion with voice callback
      setTimeout(() => {
        const completedTask = {
          ...newTask,
          status: "complete" as const,
          result: "Task completed successfully. Analysis shows 94% confidence in recommendations.",
          completedAt: new Date().toISOString()
        };
        
        setTasks(prev => prev.map(t => 
          t.id === newTask.id ? completedTask : t
        ));
        
        // Trigger voice callback if voice ID exists
        if (globalVoiceId) {
          initiateVoiceCallback(completedTask);
        }
      }, 5000);
    }, 2000);
  };

  const initiateVoiceCallback = async (task: Task) => {
    setCallStatus("connecting");
    
    try {
      // Generate voice message
      const response = await fetch('/api/generate/voice', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Task ${task.id.slice(-4)} completed. ${task.result}`,
          _identity: { voiceId: globalVoiceId },
          emotion: "neutral"
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Play audio
        if (audioRef.current) {
          audioRef.current.src = data.audioUrl;
          await audioRef.current.play();
        }
        
        setIsCallActive(true);
        setCallStatus("active");
        
        // Auto end after audio finishes
        setTimeout(() => {
          endCall();
        }, (data.audioProperties?.duration || 10) * 1000);
      }
    } catch (error) {
      console.error("Voice callback failed:", error);
      setCallStatus("idle");
    }
  };

  const endCall = () => {
    setIsCallActive(false);
    setCallStatus("ended");
    setAudioLevel(0);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setTimeout(() => setCallStatus("idle"), 2000);
  };

  const simulateIncomingCall = () => {
    setCallStatus("connecting");
    setTimeout(() => {
      setIsCallActive(true);
      setCallStatus("active");
    }, 2000);
  };

  if (!hasIdentity) {
    return (
      <div className="min-h-screen bg-[#05070A] text-white pt-20 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full bg-[#1A1A1A] border border-red-500/30 rounded-3xl p-8 text-center"
        >
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-red-400 mb-2">Identity Required</h2>
          <p className="text-gray-400 mb-6">Executive Agent requires Digital Twin setup</p>
          <a 
            href="/services/avatar-builder"
            className="inline-block px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl text-black font-bold"
          >
            Create Identity
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070A] text-white pt-20">
      <audio ref={audioRef} className="hidden" />
      
      {/* Header */}
      <div className="bg-gradient-to-r from-[#D4AF37]/20 to-[#00FFFF]/20 border-b border-[#D4AF37]/30 py-8">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] p-0.5">
              <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center">
                <Phone className="w-8 h-8 text-[#D4AF37]" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold">Executive Agent</h1>
              <p className="text-gray-400">AI-powered task management with voice callbacks</p>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Task Input */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
            >
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#D4AF37]" />
                New Task
              </h3>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe your task... (e.g., 'Analyze Q4 sales data and prepare executive summary')"
                className="w-full h-32 bg-black/30 border border-white/20 rounded-xl p-4 text-white placeholder-gray-500 focus:border-[#D4AF37] focus:outline-none resize-none mb-4"
              />
              
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => submitTask("text")}
                  disabled={!input.trim()}
                  className="flex-1 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                  Submit Task
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => submitTask("voice")}
                  className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <Mic className="w-5 h-5" />
                </motion.button>
              </div>
            </motion.div>

            {/* Task History */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
            >
              <h3 className="text-lg font-semibold mb-4">Recent Tasks</h3>
              
              <div className="space-y-3">
                <AnimatePresence>
                  {tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={`p-4 rounded-xl border ${
                        task.status === "complete" ? "bg-green-500/10 border-green-500/30" :
                        task.status === "processing" ? "bg-yellow-500/10 border-yellow-500/30" :
                        "bg-white/5 border-white/10"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm text-gray-300 line-clamp-2">{task.content || "Voice task"}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(task.createdAt).toLocaleTimeString()}
                            </span>
                            <span className={`flex items-center gap-1 ${
                              task.status === "complete" ? "text-green-400" :
                              task.status === "processing" ? "text-yellow-400" :
                              "text-gray-400"
                            }`}>
                              {task.status === "complete" && <CheckCircle className="w-3 h-3" />}
                              {task.status === "processing" && <Loader2 className="w-3 h-3 animate-spin" />}
                              {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                            </span>
                          </div>
                          {task.result && (
                            <p className="mt-2 text-sm text-green-300 bg-green-500/10 rounded-lg p-2">
                              {task.result}
                            </p>
                          )}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                          {task.type === "voice" ? <Mic className="w-5 h-5" /> :
                           task.type === "document" ? <FileText className="w-5 h-5" /> :
                           <MessageSquare className="w-5 h-5" />}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {tasks.length === 0 && (
                  <p className="text-center text-gray-500 py-8">No tasks yet. Submit your first task above.</p>
                )}
              </div>
            </motion.div>
          </div>

          {/* Call Interface */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`rounded-2xl p-6 border ${
                isCallActive ? "bg-green-500/10 border-green-500/50" : "bg-white/5 border-white/10"
              }`}
            >
              <h3 className="text-lg font-semibold mb-4">Voice Channel</h3>
              
              {/* Call Status */}
              <div className="text-center py-8">
                <motion.div
                  animate={isCallActive ? {
                    scale: [1, 1.2, 1],
                    boxShadow: [
                      "0 0 0 0 rgba(0, 255, 0, 0.4)",
                      "0 0 0 20px rgba(0, 255, 0, 0)",
                      "0 0 0 0 rgba(0, 255, 0, 0)"
                    ]
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 ${
                    isCallActive ? "bg-green-500" :
                    callStatus === "connecting" ? "bg-yellow-500" :
                    "bg-gray-700"
                  }`}
                >
                  {isCallActive ? (
                    <Volume2 className="w-12 h-12 text-white" />
                  ) : callStatus === "connecting" ? (
                    <Loader2 className="w-12 h-12 text-white animate-spin" />
                  ) : (
                    <Phone className="w-12 h-12 text-gray-400" />
                  )}
                </motion.div>
                
                <p className="text-xl font-semibold mb-1">
                  {isCallActive ? "Call in Progress" :
                   callStatus === "connecting" ? "Connecting..." :
                   callStatus === "ended" ? "Call Ended" :
                   "Ready"}
                </p>
                <p className="text-sm text-gray-400">
                  {isCallActive ? "Your AI agent is speaking" :
                   callStatus === "connecting" ? "Establishing connection..." :
                   "Waiting for task completion"}
                </p>
              </div>

              {/* Audio Visualization */}
              {isCallActive && (
                <div className="flex justify-center items-end gap-1 h-16 mb-4">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [10, Math.random() * 60 + 10, 10] }}
                      transition={{ duration: 0.3, repeat: Infinity, delay: i * 0.05 }}
                      className="w-2 bg-gradient-to-t from-green-500 to-green-300 rounded-full"
                    />
                  ))}
                </div>
              )}

              {/* Call Controls */}
              <div className="flex gap-3">
                {isCallActive ? (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={endCall}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <PhoneOff className="w-5 h-5" />
                    End Call
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={simulateIncomingCall}
                    disabled={callStatus !== "idle"}
                    className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-700 rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <Phone className="w-5 h-5" />
                    Simulate Call
                  </motion.button>
                )}
              </div>
            </motion.div>

            {/* Identity Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-[#D4AF37]/10 to-[#00FFFF]/10 border border-[#D4AF37]/30 rounded-2xl p-6"
            >
              <h3 className="text-lg font-semibold mb-4 text-[#D4AF37]">Active Identity</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-black/30 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                    <span className="text-[#D4AF37] font-bold">A</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">Avatar ID</p>
                    <p className="text-sm text-[#00FFFF] font-mono truncate">{globalAvatarId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-black/30 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-[#00FFFF]/20 flex items-center justify-center">
                    <span className="text-[#00FFFF] font-bold">V</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">Voice ID</p>
                    <p className="text-sm text-[#00FFFF] font-mono truncate">{globalVoiceId}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
