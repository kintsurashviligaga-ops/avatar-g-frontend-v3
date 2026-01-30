"use client";

import React, { useState, useCallback } from "react";
import { Check, Loader2, X, Upload, Mic } from "lucide-react";
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
  const [pitch, setPitch] = useState(5);
  const [volume, setVolume] = useState(7);
  const [cloneVoice, setCloneVoice] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleGenerate = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: text.slice(0, 30) || "Voice Sample",
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
    }, 8000);
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
      titleKa="ხმის ლაბორატორია"
      subtitle="Voice Synthesis"
      subtitleKa="ხმის სინთეზი"
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
            placeholder="ჩაწერეთ ტექსტი რომელიც უნდა წაიკითხონ..."
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50"
          />
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
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          ემოცია და ტემპი
        </h2>
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
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          აუდიო კონტროლი
        </h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">ტონი</label>
              <span className="text-xs text-cyan-400">{pitch}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">ხმის სიმაღლე</label>
              <span className="text-xs text-cyan-400">{volume}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          ხმის კლონირება
        </h2>
        <div className="space-y-4">
          <button className="w-full py-4 rounded-xl border border-dashed border-white/20 bg-black/20 flex flex-col items-center gap-2 hover:border-cyan-500/50 transition-colors">
            <Mic className="w-6 h-6 text-gray-500" />
            <span className="text-xs text-gray-400">ატვირთეთ ხმის ნიმუში</span>
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cloneVoice}
              onChange={(e) => setCloneVoice(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50"
            />
            <span className="text-xs text-gray-400">გამოიყენე კლონირებული ხმა</span>
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
                    <p className="text-[10px] text-gray-500 capitalize">
                      {job.status === "queued" ? "რიგშია" : 
                       job.status === "processing" ? "მუშავდება" : 
                       job.status === "done" ? "დასრულებული" : "შეცდომა"}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-gray-600">
                  {job.createdAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </ServicePageShell>
  );
}
