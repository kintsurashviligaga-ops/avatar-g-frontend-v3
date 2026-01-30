"use client";

import React, { useState, useCallback } from "react";
import { Check, Loader2, X, Upload, Mic, Play } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

type JobStatus = "queued" | "processing" | "done" | "error";

interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: Date;
}

const VOICES = ["Male Deep", "Male Young", "Female Soft", "Female Energetic", "Neutral"];
const EMOTIONS = ["Neutral", "Happy", "Sad", "Angry", "Excited", "Calm"];
const SPEEDS = ["Slow", "Normal", "Fast"];

export default function VoiceLabPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [text, setText] = useState("");
  const [voice, setVoice] = useState(VOICES[0]);
  const [emotion, setEmotion] = useState(EMOTIONS[0]);
  const [speed, setSpeed] = useState(SPEEDS[1]);
  const [pitch, setPitch] = useState(50);
  const [useClone, setUseClone] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleGenerate = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: text.slice(0, 30) || "Voice Generation",
      status: "queued",
      createdAt: new Date(),
    };

    setJobs((prev) => [newJob, ...prev]);
    showToast("ხმის გენერაცია დაიწყო");

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, status: "processing" } : j))
      );
    }, 1000);

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, status: "done" } : j))
      );
    }, 6000);
  }, [text, showToast]);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status !== "done"));
  }, []);

  const getStatusIcon = (status: JobStatus) => {
    switch (status) {
      case "queued":
        return <div className="w-4 h-4 rounded-full border-2 border-yellow-500/50" />;
      case "processing":
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case "done":
        return <Check className="w-4 h-4 text-green-400" />;
      case "error":
        return <X className="w-4 h-4 text-red-400" />;
    }
  };

  return (
    <ServicePageShell
      title="Voice Lab"
      titleKa="ხმა"
      subtitle="AI Voice Generation"
      subtitleKa="AI ხმის გენერაცია"
      primaryLabel="Generate Voice"
      primaryLabelKa="ხმის გენერაცია"
      onPrimary={handleGenerate}
      toast={toast}
    >
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          ტექსტი
        </h2>
        <div className="space-y-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="შეიყვანეთ ტექსტი..."
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50 placeholder:text-gray-600"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          ხმის პარამეტრები
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">ხმის ტიპი</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">ემოცია</label>
              <select
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
              >
                {EMOTIONS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">სიჩქარე</label>
              <select
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          ტონი
        </h2>
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="text-xs text-gray-500">Pitch</label>
            <span className="text-xs text-cyan-400">{pitch}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pitch}
            onChange={(e) => setPitch(Number(e.target.value))}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          Voice Clone
        </h2>
        <div className="space-y-4">
          <button className="w-full py-4 rounded-xl border border-dashed border-white/20 bg-black/20 flex flex-col items-center gap-2 hover:border-cyan-500/50 transition-colors">
            <Mic className="w-6 h-6 text-gray-500" />
            <span className="text-xs text-gray-400">ატვირთეთ ხმის ნიმუში</span>
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useClone}
              onChange={(e) => setUseClone(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50"
            />
            <span className="text-xs text-gray-400">Voice Clone-ის გამოყენება</span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            რიგი
          </h2>
          {jobs.some((j) => j.status === "done") && (
            <button
              onClick={clearCompleted}
              className="text-[10px] text-gray-500 hover:text-white transition-colors"
            >
              გასუფთავება
            </button>
          )}
        </div>

        <div className="space-y-2">
          {jobs.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">რიგი ცარიელია</p>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="text-xs font-medium text-white truncate max-w-[150px]">
                      {job.name}
                    </p>
                    <p className="text-[10px] text-gray-500 capitalize">{job.status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {job.status === "done" && (
                    <button className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                      <Play className="w-3 h-3" />
                    </button>
                  )}
                  <span className="text-[10px] text-gray-600">
                    {job.createdAt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </ServicePageShell>
  );
}
