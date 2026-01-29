"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, X, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

type JobStatus = "queued" | "processing" | "done" | "error";

interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: Date;
}

const SCENE_STYLES = ["Cinematic", "Ad", "Story", "Trailer"];
const ASPECTS = ["9:16", "16:9", "1:1"];
const DURATIONS = ["5s", "10s", "15s", "30s"];
const VISUAL_STYLES = ["Photoreal", "Noir", "Futuristic", "Studio Product"];

export default function VideoCineLabPage() {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  
  const [concept, setConcept] = useState("");
  const [sceneStyle, setSceneStyle] = useState(SCENE_STYLES[0]);
  const [aspect, setAspect] = useState(ASPECTS[0]);
  const [duration, setDuration] = useState(DURATIONS[1]);
  const [visualStyle, setVisualStyle] = useState(VISUAL_STYLES[0]);
  const [motion, setMotion] = useState(5);
  const [detail, setDetail] = useState(7);
  const [useReference, setUseReference] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleGenerate = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: concept.slice(0, 30) || "Untitled Video",
      status: "queued",
      createdAt: new Date(),
    };
    setJobs(prev => [newJob, ...prev]);
    showToast("Video generation started.");
    
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "processing" } : j));
    }, 1000);
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "done" } : j));
    }, 10000);
  }, [concept, showToast]);

  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status !== "done"));
  }, []);

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
            <h1 className="text-sm font-semibold">Video Cine-Lab</h1>
            <p className="text-[10px] text-gray-500">Cinematic Generator</p>
          </div>
          <div className="px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30 text-[10px] text-green-300">Active</div>
        </div>
      </header>

      <main className="pt-24 pb-32 px-4">
        <div className="max-w-md mx-auto space-y-6">
          
          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Concept</h2>
            <div className="space-y-4">
              <textarea value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Describe your video idea..." rows={4} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50" />
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Scene Style</label>
                <select value={sceneStyle} onChange={(e) => setSceneStyle(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                  {SCENE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Format</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Aspect</label>
                <select value={aspect} onChange={(e) => setAspect(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                  {ASPECTS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Duration</label>
                <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                  {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Visual Controls</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Visual Style</label>
                <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                  {VISUAL_STYLES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs text-gray-500">Motion</label>
                  <span className="text-xs text-cyan-400">{motion}</span>
                </div>
                <input type="range" min={1} max={10} value={motion} onChange={(e) => setMotion(Number(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs text-gray-500">Detail</label>
                  <span className="text-xs text-cyan-400">{detail}</span>
                </div>
                <input type="range" min={1} max={10} value={detail} onChange={(e) => setDetail(Number(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Optional Assets</h2>
            <div className="space-y-4">
              <button className="w-full py-4 rounded-xl border border-dashed border-white/20 bg-black/20 flex flex-col items-center gap-2 hover:border-cyan-500/50 transition-colors">
                <Upload className="w-6 h-6 text-gray-500" />
                <span className="text-xs text-gray-400">Upload Image/Video Reference</span>
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useReference} onChange={(e) => setUseReference(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50" />
                <span className="text-xs text-gray-400">Use as Reference</span>
              </label>
            </div>
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
                        <p className="text-xs font-medium text-white truncate max-w-[150px]">{job.name}</p>
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
          <button onClick={handleGenerate} className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity shadow
