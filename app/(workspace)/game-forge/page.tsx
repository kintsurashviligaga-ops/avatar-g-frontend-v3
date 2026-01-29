"use client";

import React, { useState, useCallback } from "react";
import { Check, Loader2, X } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

type JobStatus = "queued" | "processing" | "done" | "error";

interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: Date;
}

const GAME_TYPES = ["Runner", "Puzzle", "Arcade", "Idle", "Strategy"];
const DIFFICULTIES = ["Easy", "Normal", "Hard"];
const ART_STYLES = ["Pixel", "Lowpoly", "Modern", "Retro Noir"];
const RESOLUTIONS = ["Mobile", "Tablet", "Desktop"];
const TARGETS = ["Web", "Android", "iOS"];

export default function GameForgePage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  
  const [gameType, setGameType] = useState(GAME_TYPES[0]);
  const [coreLoop, setCoreLoop] = useState("");
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1]);
  const [artStyle, setArtStyle] = useState(ART_STYLES[0]);
  const [resolution, setResolution] = useState(RESOLUTIONS[0]);
  const [target, setTarget] = useState(TARGETS[0]);
  const [monetization, setMonetization] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleGenerate = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: `${gameType} Game`,
      status: "queued",
      createdAt: new Date(),
    };
    setJobs(prev => [newJob, ...prev]);
    showToast("Prototype generation started.");
    
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "processing" } : j));
    }, 1000);
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "done" } : j));
    }, 7000);
  }, [gameType, showToast]);

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
    <ServicePageShell
      title="Game Forge"
      subtitle="Playable Prototype Engine"
      primaryLabel="Generate Prototype"
      onPrimary={handleGenerate}
      toast={toast}
    >
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Game Type</h2>
        <select value={gameType} onChange={(e) => setGameType(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
          {GAME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Core Loop</h2>
        <div className="space-y-4">
          <textarea value={coreLoop} onChange={(e) => setCoreLoop(e.target.value)} placeholder="What the player does..." rows={3} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50" />
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Art Style</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Style</label>
            <select value={artStyle} onChange={(e) => setArtStyle(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
              {ART_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Resolution</label>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
              {RESOLUTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Export Target</h2>
        <div className="space-y-4">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
            {TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={monetization} onChange={(e) => setMonetization(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-black/
