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

const GENRES = ["Pop", "Hip-Hop", "Cinematic", "House", "Lo-fi", "Rock"];
const MOODS = ["Happy", "Dark", "Energetic", "Chill"];
const VOCALS = ["Male", "Female", "Choir", "None"];
const DURATIONS = ["15s", "30s", "60s"];
const QUALITIES = ["Standard", "Pro"];

export default function MusicStudioPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  
  const [trackName, setTrackName] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [mood, setMood] = useState(MOODS[0]);
  const [lyrics, setLyrics] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [vocals, setVocals] = useState(VOCALS[0]);
  const [vocalIntensity, setVocalIntensity] = useState(7);
  const [duration, setDuration] = useState(DURATIONS[1]);
  const [quality, setQuality] = useState(QUALITIES[0]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleCompose = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: trackName || "Untitled Track",
      status: "queued",
      createdAt: new Date(),
    };
    setJobs(prev => [newJob, ...prev]);
    showToast("Track composition started.");
    
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "processing" } : j));
    }, 1000);
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "done" } : j));
    }, 8000);
  }, [trackName, showToast]);

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
      title="Music Studio"
      subtitle="Neural Audio Lab"
      primaryLabel="Compose Track"
      onPrimary={handleCompose}
      toast={toast}
    >
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Track Setup</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Track Name</label>
            <input type="text" value={trackName} onChange={(e) => setTrackName(e.target.value)} placeholder="My Track" className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Genre</label>
              <select value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Mood</label>
              <select value={mood} onChange={(e) => setMood(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
                {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Lyrics / Idea</h2>
        <div className="space-y-4">
          <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder="Describe your track or paste lyrics..." rows={4} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50" />
            <span className="text-xs text-gray-400">Instrumental Only</span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Vocals</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Vocal Type</label>
            <select value={vocals} onChange={(e) => setVocals(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
              {VOCALS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {!instrumental && (
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs text-gray-500">Vocal Intensity</label>
                <span className="text-xs text-cyan-400">{vocalIntensity}</span>
              </div>
              <input type="range" min={1} max={10} value={vocalIntensity} onChange={(e) => setVocalIntensity(Number(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Output</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Duration</label>
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
              {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Quality</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50">
              {QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
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
    </ServicePageShell>
  );
}
