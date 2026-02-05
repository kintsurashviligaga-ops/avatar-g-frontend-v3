"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Phone, 
  Upload, 
  FileText, 
  Mic,
  Play,
  Pause,
  Check,
  Clock,
  User,
  Volume2,
  Sparkles,
  ArrowRight,
  X
} from "lucide-react";
import { useIdentity } from "@/lib/identity/IdentityContext";

type TaskStatus = "pending" | "processing" | "complete" | "calling";

interface Task {
  id: string;
  type: "document" | "voice" | "text";
  content: string;
  status: TaskStatus;
  result?: string;
  callDuration?: number;
}

export default function ExecutiveAgentClient() {
  const { globalAvatarId, globalVoiceId, injectIdentity } = useIdentity();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [isCallActive, setIsCallActive] = useState(false);
  const [callProgress, setCallProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colors = {
    gold: "#D4AF37",
    cyan: "#00FFFF",
    obsidian: "#0A0A0A"
  };

  const handleSubmit = async (type: "document" | "voice" | "text") => {
    if (!input.trim() && type === "text") return;

    const newTask: Task = {
      id: Date.now().toString(),
      type,
      content: input || "Document uploaded",
      status: "processing"
    };

    // Inject identity before processing
    try {
      const taskWithIdentity = injectIdentity(newTask);
      setTasks(prev => [...prev, taskWithIdentity]);
      setInput("");
      
      // Simulate processing
      setTimeout(() => {
        setTasks(prev => prev.map(t => 
          t.id === newTask.id 
            ? { ...t, status: "complete", result: generateResult(t) }
            : t
        ));
        
        // Initiate callback
        initiateCallback(newTask.id);
      }, 3000);
    } catch (error) {
      alert("Identity verification required!");
    }
  };

  const generateResult = (task: Task): string => {
    const results = [
      `Analyzed ${task.content}. Key findings: 3 critical insights identified. Revenue impact: +$2.4M. Recommend immediate action on Q3 strategy.`,
      `Processed ${task.content}. Generated comprehensive report with 12 data points. Risk assessment: LOW. Opportunity score: 8.7/10.`,
      `Reviewed ${task.content}. Executive summary prepared. 5 action items identified. Timeline: 30 days. Budget requirement: $150K.`
    ];
    return results[Math.floor(Math.random() * results.length)];
  };

  const initiateCallback = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId) || currentTask;
    if (!task) return;

    setCurrentTask(task);
    setIsCallActive(true);
    setCallProgress(0);

    // Simulate call progress
    const interval = setInterval(() => {
      setCallProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsCallActive(false);
          setTasks(prev => prev.map(t => 
            t.id === taskId ? { ...t, status: "calling", callDuration: 45 } : t
          ));
          return 100;
        }
        return prev + 2;
      });
    }, 100);
  };

  const renderCallModal = () => (
    <AnimatePresence>
      {isCallActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="max-w-md w-full bg-[#1A1A1A] border border-[#D4AF37]/30 rounded-3xl p-8 text-center"
          >
            {/* Pulsing Avatar */}
            <div className="relative w-32 h-32 mx-auto mb-6">
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] blur-2xl"
              />
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-[#F5D0C5] to-[#E8B4A0] flex items-center justify-center border-4 border-[#D4AF37]">
                <User className="w-16 h-16 text-[#4A90E2]" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center border-4 border-[#1A1A1A]">
                <Phone className="w-5 h-5 text-white" />
              </div>
            </div>

            <h3 className="text-2xl font-bold text-[#D4AF37] mb-2">
              Avatar G Calling
            </h3>
            <p className="text-gray-400 mb-6">
              Delivering your executive briefing using cloned voice...
            </p>

            {/* Voice Waveform */}
            <div className="h-16 bg-[#0A0A0A] rounded-xl flex items-center justify-center gap-1 mb-6 px-4">
              {Array.from({length: 40}).map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ height: [4, 20 + Math.random() * 30, 4] }}
                  transition={{ duration: 0.3, repeat: Infinity, delay: i * 0.02 }}
                  className="w-1 bg-gradient-to-t from-[#D4AF37] to-[#00FFFF] rounded-full"
                />
              ))}
            </div>

            {/* Progress */}
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Call Progress</span>
                <span className="text-[#00FFFF]">{callProgress}%</span>
              </div>
              <div className="h-2 bg-[#0A0A0A] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF]"
                  style={{ width: `${callProgress}%` }}
                />
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsCallActive(false)}
                className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center"
              >
                <X className="w-6 h-6 text-white" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-14 h-14 rounded-full bg-[#0A0A0A] border border-[#D4AF37] flex items-center justify-center"
              >
                <Volume2 className="w-6 h-6 text-[#D4AF37]" />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0A0A0A] via-[#1A1A1A] to-[#0A0A0A] border-b border-[#D4AF37]/20 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] flex items-center justify-center">
              <Phone className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#D4AF37]">Executive Agent</h1>
              <p className="text-gray-400">AI assistant with voice callback protocol</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1A1A1A] border border-[#D4AF37]/20 rounded-2xl p-6"
            >
              <h3 className="text-xl font-bold text-[#D4AF37] mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                New Request
              </h3>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe your task... (e.g., 'Analyze Q3 financial report and prepare executive summary')"
                className="w-full h-32 bg-[#0A0A0A] border border-[#D4AF37]/30 rounded-xl p-4 text-white placeholder-gray-500 focus:border-[#D4AF37] focus:outline-none resize-none mb-4"
              />

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSubmit("text")}
                  className="flex-1 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl text-black font-bold flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-5 h-5" />
                  Submit Task
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-3 bg-[#0A0A0A] border border-[#D4AF37]/30 rounded-xl hover:border-[#D4AF37]/60"
                >
                  <Upload className="w-5 h-5 text-[#D4AF37]" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-4 py-3 bg-[#0A0A0A] border border-[#D4AF37]/30 rounded-xl hover:border-[#D4AF37]/60"
                >
                  <Mic className="w-5 h-5 text-[#00FFFF]" />
                </motion.button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={() => handleSubmit("document")}
              />
            </motion.div>

            {/* Identity Status */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-[#1A1A1A] border border-[#00FFFF]/20 rounded-2xl p-6"
            >
              <h3 className="text-lg font-bold text-[#00FFFF] mb-4">Identity Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-[#0A0A0A] rounded-xl">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-[#D4AF37]" />
                    <span className="text-gray-300">Global Avatar ID</span>
                  </div>
                  <span className="text-[#00FFFF] font-mono text-sm">
                    {globalAvatarId || "Not established"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-[#0A0A0A] rounded-xl">
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-5 h-5 text-[#D4AF37]" />
                    <span className="text-gray-300">Global Voice ID</span>
                  </div>
                  <span className="text-[#00FFFF] font-mono text-sm">
                    {globalVoiceId || "Not established"}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Tasks History */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-[#D4AF37]">Task History</h3>
            
            <div className="space-y-4">
              {tasks.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks yet. Submit your first request.</p>
                </div>
              ) : (
                tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-[#1A1A1A] border border-[#D4AF37]/20 rounded-2xl p-6"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          task.status === "complete" ? 'bg-[#00FFFF]/20' :
                          task.status === "calling" ? 'bg-[#D4AF37]/20' :
                          'bg-[#0A0A0A]'
                        }`}>
                          {task.status === "complete" && <Check className="w-5 h-5 text-[#00FFFF]" />}
                          {task.status === "calling" && <Phone className="w-5 h-5 text-[#D4AF37]" />}
                          {task.status === "processing" && <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }} className="w-5 h-5 border-2 border-[#D4AF37] border-t-transparent rounded-full" />}
                        </div>
                        <div>
                          <p className="font-semibold text-white capitalize">{task.type} Task</p>
                          <p className="text-xs text-gray-500">{new Date(parseInt(task.id)).toLocaleString()}</p>
                        </div>
                      </div>
                      <span className={`text-xs px-3 py-1 rounded-full ${
                        task.status === "complete" ? 'bg-[#00FFFF]/20 text-[#00FFFF]' :
                        task.status === "calling" ? 'bg-[#D4AF37]/20 text-[#D4AF37]' :
                        'bg-[#0A0A0A] text-gray-400'
                      }`}>
                        {task.status}
                      </span>
                    </div>

                    <p className="text-gray-300 text-sm mb-3 line-clamp-2">{task.content}</p>

                    {task.result && (
                      <div className="bg-[#0A0A0A] rounded-xl p-4 mb-3">
                        <p className="text-sm text-gray-400">{task.result}</p>
                      </div>
                    )}

                    {task.status === "complete" && !task.callDuration && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => initiateCallback(task.id)}
                        className="w-full py-2 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-lg text-black font-semibold flex items-center justify-center gap-2"
                      >
                        <Phone className="w-4 h-4" />
                        Receive Voice Briefing
                      </motion.button>
                    )}

                    {task.callDuration && (
                      <div className="flex items-center gap-2 text-sm text-[#00FFFF]">
                        <Phone className="w-4 h-4" />
                        <span>Call completed ({task.callDuration}s)</span>
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {renderCallModal()}
    </div>
  );
}
