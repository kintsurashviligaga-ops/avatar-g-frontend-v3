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

const STYLE_PRESETS = ["Neo-Silver", "Cyber Noir", "Classic Business", "Street", "Luxury"];
const GENDERS = ["Neutral", "Male", "Female"];
const HAIR_STYLES = ["Short", "Medium", "Long", "Bald", "Styled", "Buzz"];
const HAIR_COLORS = ["Black", "Brown", "Blonde", "Silver", "White", "Colorful"];
const OUTFITS = ["Founder Suit", "Creative Director", "Engineer", "Musician", "Gamer", "Luxury Noir"];
const BACKGROUNDS = ["Deep Obsidian Studio", "Neon City", "Minimal White", "Space Lab"];
const PACKAGES = ["Image Pack", "Short Intro Video", "Profile Set"];
const QUALITIES = ["Standard", "Pro", "Ultra"];
const ASPECTS = ["1:1", "9:16", "16:9"];

export default function AvatarBuilderPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  
  const [avatarName, setAvatarName] = useState("");
  const [stylePreset, setStylePreset] = useState(STYLE_PRESETS[0]);
  const [gender, setGender] = useState(GENDERS[0]);
  const [age, setAge] = useState(30);
  const [skinTone, setSkinTone] = useState(5);
  const [faceShape, setFaceShape] = useState(5);
  const [hairStyle, setHairStyle] = useState(HAIR_STYLES[0]);
  const [hairColor, setHairColor] = useState(HAIR_COLORS[0]);
  const [outfit, setOutfit] = useState(OUTFITS[0]);
  const [accessories, setAccessories] = useState<string[]>([]);
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [packageType, setPackageType] = useState(PACKAGES[0]);
  const [quality, setQuality] = useState(QUALITIES[0]);
  const [aspect, setAspect] = useState(ASPECTS[0]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const toggleAccessory = useCallback((acc: string) => {
    setAccessories(prev => prev.includes(acc) ? prev.filter(a => a !== acc) : [...prev, acc]);
  }, []);

  const handleGenerate = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: avatarName || "Unnamed Avatar",
      status: "queued",
      createdAt: new Date(),
    };
    setJobs(prev => [newJob, ...prev]);
    showToast("Avatar job created.");
    
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "processing" } : j));
    }, 1000);
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: "done" } : j));
    }, 4000);
  }, [avatarName, showToast]);

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
      title="Avatar Builder"
      subtitle="3D Identity Forge"
      primaryLabel="Generate Avatar"
      onPrimary={handleGenerate}
      toast={toast}
    >
      {/* All sections identical to original, wrapped */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Avatar Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Avatar Name</label>
            <input
              type="text"
              value={avatarName}
              onChange={(e) => setAvatarName(e.target.value)}
              placeholder="Enter name..."
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Style Preset</label>
            <select
              value={stylePreset}
              onChange={(e) => setStylePreset(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {STYLE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Gender Presentation</label>
            <div className="flex gap-2">
              {GENDERS.map(g => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                    gender === g 
                      ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300" 
                      : "bg-black/40 border border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Face & Body section */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Face & Body</h2>
        <div className="space-y-4">
          {[
            { label: "Age", value: age, set: setAge, min: 16, max: 65 },
            { label: "Skin Tone", value: skinTone, set: setSkinTone, min: 1, max: 10 },
            { label: "Face Shape", value: faceShape, set: setFaceShape, min: 1, max: 10 },
          ].map(({ label, value, set, min, max }) => (
            <div key={label}>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs text-gray-500">{label}</label>
                <span className="text-xs text-cyan-400">{value}</span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => set(Number(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Hair Style</label>
              <select
                value={hairStyle}
                onChange={(e) => setHairStyle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
              >
                {HAIR_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Hair Color</label>
              <select
                value={hairColor}
                onChange={(e) => setHairColor(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
              >
                {HAIR_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Outfit & Role */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Outfit & Role</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Outfit</label>
            <select
              value={outfit}
              onChange={(e) => setOutfit(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {OUTFITS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-2 block">Accessories</label>
            <div className="flex flex-wrap gap-2">
              {["Glasses", "Watch", "Ring", "Headphones"].map(acc => (
                <button
                  key={acc}
                  onClick={() => toggleAccessory(acc)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    accessories.includes(acc)
                      ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                      : "bg-black/40 border border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  {acc}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Background</label>
            <select
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {BACKGROUNDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Output Package */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Output Package</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {PACKAGES.map(pkg => (
              <button
                key={pkg}
                onClick={() => setPackageType(pkg)}
                className={`p-3 rounded-xl text-center transition-colors ${
                  packageType === pkg
                    ? "bg-cyan-500/20 border border-cyan-500/50"
                    : "bg-black/40 border border-white/10 hover:border-white/20"
                }`}
              >
                <span className="text-[10px] text-gray-300 leading-tight block">{pkg}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Quality</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
              >
                {QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Aspect</label>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
              >
                {ASPECTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Queue */}
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Generation Queue</h2>
          {jobs.some(j => j.status === "done") && (
            <button
              onClick={clearCompleted}
              className="text-[10px] text-gray-500 hover:text-white transition-colors"
            >
              Clear Completed
            </button>
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
                <span className="text-[10px] text-gray-600">
                  {job.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </ServicePageShell>
  );
}
