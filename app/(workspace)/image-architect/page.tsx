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

const STYLES = ["Photorealistic", "Retro-Futuristic", "Noir", "Minimal", "Studio Product"];
const LANGUAGES = ["KA", "EN", "RU"];
const ASPECTS = ["1:1", "9:16", "16:9"];
const CAMERAS = ["Wide", "50mm", "Portrait", "Macro"];
const LIGHTING = ["Softbox", "Neon", "Rim Light", "Golden Hour"];

export default function ImageArchitectPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [style, setStyle] = useState(STYLES[0]);
  const [detail, setDetail] = useState(7);
  const [contrast, setContrast] = useState(5);
  const [aspect, setAspect] = useState(ASPECTS[0]);
  const [camera, setCamera] = useState(CAMERAS[0]);
  const [lighting, setLighting] = useState(LIGHTING[0]);
  const [variations, setVariations] = useState(1);
  const [seedLock, setSeedLock] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleGenerate = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: prompt.slice(0, 30) || "Untitled Image",
      status: "queued",
      createdAt: new Date(),
    };
    setJobs(prev => [newJob, ...prev]);
    showToast("Image generation started.");
    
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "processing" } : j));
    }, 1000);
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "done" } : j));
    }, 6000);
  }, [prompt, showToast]);

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
      title="Image Architect"
      subtitle="Visual Design Reactor"
      primaryLabel="Generate Image"
      onPrimary={handleGenerate}
      toast={toast}
    >
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Prompt Core</h2>
        <div className="space-y-4">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe your image..." rows={4} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50" />
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Prompt Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Style Controls</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Style</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
              {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">Detail</label>
              <span className="text-xs text-cyan-400">{detail}</span>
            </div>
            <input type="range" min={1} max={10} value={detail} onChange={(e) => setDetail(Number(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
          </div>
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">Contrast</label>
              <span className="text-xs text-cyan-400">{contrast}</span>
            </div>
            <input type="range" min={1} max={10} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Composition</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Aspect</label>
              <select value={aspect} onChange={(e) => setAspect(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                {ASPECTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Camera</label>
              <select value={camera} onChange={(e) => setCamera(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                {CAMERAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Lighting</label>
            <select value={lighting} onChange={(e) => setLighting(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
              {LIGHTING.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Variations</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">How many</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setVariations(Math.max(1, variations - 1))} className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 text-gray-400 hover:text-white">-</button>
              <span className="text-sm font-medium w-4 text-center">{variations}</span>
              <button onClick={() => setVariations(Math.min(4, variations + 1))} className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 text-gray-400 hover:text-white">+</button>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={seedLock} onChange={(e) => setSeedLock(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50" />
            <span className="text-xs text-gray-400">Seed Lock</span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Output Queue</h2>
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
    </ServicePageShell>
  );
}
