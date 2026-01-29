"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, X, Mic, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

type JobStatus = "queued" | "processing" | "done" | "error";

interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: Date;
}

const LANGUAGES = ["Georgian", "English", "Russian"];
const VOICE_STYLES = ["Neutral", "Promo", "Cinematic", "Podcast"];

export default function VoiceLabPage() {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  
  const [projectName, setProjectName] = useState("");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [voiceStyle, setVoiceStyle] = useState(VOICE_STYLES[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [clarity, setClarity] = useState(7);
  const [emotion, setEmotion] = useState(5);
  const [stability, setStability] = useState(6);
  const [removeNoise, setRemoveNoise] = useState(true);
  const [testSentence, setTestSentence] = useState("");

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleCreateVoice = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: projectName || "Unnamed Voice",
      status: "queued",
      createdAt: new Date(),
    };
    setJobs(prev => [newJob, ...prev]);
    showToast("Voice model creation started.");
    
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "processing" } : j));
    }, 1000);
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "done" } : j));
    }, 5000);
  }, [projectName, showToast]);

  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status !== "done"));
  }, []);

  const toggleRecording = useCallback(() => {
    setIsRecording(prev => !prev);
    if (!isRecording) {
      setTimeout(() => setIsRecording(false), 3000);
    }
  }, [isRecording]);

  const handlePreview = useCallback(() => {
    showToast("Preview generated (demo)");
  }, [showToast]);

  const getStatusIcon = (status: JobStatus) => {
    switch (status) {
      case "queued": return <div className="w-4 h-4 rounded-full border-2 border-yellow-500/50" />;
      case "processing": return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case "done": return <Check className="w-4 h-4 text-green-400" />;
      case "error": return <X className="w-4 h-4 text-red-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="fixed top-0 left-0 right-0 z-50 px-4 pt-4">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.push("/")} className="p-2 rounded-xl hover:bg-white/10 transition-colors" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-sm font-semibold">Voice Lab</h1>
            <p className="text-[10px] text-gray-500">Neural Voice Clone Suite</p>
          </div>
          <div className="px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30 text-[10px] text-green-300">Active</div>
        </div>
      </header>

      <main className="pt-24 pb-32 px-4">
        <div className="max-w-md mx-auto space-y-6">
          
          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Project Setup</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Project Name</label>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="My Voice Clone" className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Voice Style</label>
                <select value={voiceStyle} onChange={(e) => setVoiceStyle(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                  {VOICE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Source Audio</h2>
            <div className="space-y-4">
              <button className="w-full py-4 rounded-xl border border-dashed border-white/20 bg-black/20 flex flex-col items-center gap-2 hover:border-cyan-500/50 transition-colors">
                <Upload className="w-6 h-6 text-gray-500" />
                <span className="text-xs text-gray-400">Upload MP3/WAV</span>
              </button>
              <button 
                onClick={toggleRecording}
                className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                  isRecording 
                    ? "bg-red-500/20 border border-red-500/50 text-red-300" 
                    : "bg-black/40 border border-white/10 text-gray-300 hover:text-white"
                }`}
              >
                <Mic className={`w-4 h-4 ${isRecording ? "animate-pulse" : ""}`} />
                {isRecording ? "Recording..." : "Record Voice"}
              </button>
              <p className="text-[10px] text-gray-600 text-center">Tip: Use 10-30 minutes of clear speech for best results</p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Clone Parameters</h2>
            <div className="space-y-4">
              {[
                { label: "Clarity", value: clarity, set: setClarity },
                { label: "Emotion", value: emotion, set: setEmotion },
                { label: "Stability", value: stability, set: setStability },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-xs text-gray-500">{label}</label>
                    <span className="text-xs text-cyan-400">{value}</span>
                  </div>
                  <input type="range" min={1} max={10} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
              ))}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={removeNoise} onChange={(e) => setRemoveNoise(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50" />
                <span className="text-xs text-gray-400">Remove Background Noise</span>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Test Sentence</h2>
            <textarea value={testSentence} onChange={(e) => setTestSentence(e.target.value)} placeholder="Enter text to preview voice..." rows={3} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50 mb-3" />
            <button onClick={handlePreview} className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">Preview Voice</button>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Queue</h2>
              {jobs.some(j => j.status === "done") && (
                <button onClick={clearCompleted} className="text-[10px] text-gray-500 hover:text-white transition-colors">Clear Completed</button>
              )}
            </div>
            <div className="space-y-2">
              {jobs.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-4">No jobs in queue</p>
              ) : (
                jobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <p className="text-xs font-medium text-white">{job.name}</p>
                        <p className="text-[10px] text-gray-500 capitalize">{job.status}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-600">{job.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/90 to-transparent">
        <div className="max-w-md mx-auto">
          <button onClick={handleCreateVoice} className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/25">Create Voice Model</button>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-24 left-4 right-4 max-w-md mx-auto">
            <div className="px-4 py-3 rounded-xl bg-green-500/20 border border-green-500/30 text-green-300 text-sm text-center">{toast}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
