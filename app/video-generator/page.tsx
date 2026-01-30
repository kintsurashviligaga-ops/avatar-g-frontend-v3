"use client";

import React, { useState, useCallback } from "react";
import { Check, Loader2, X, Video } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

type JobStatus = "queued" | "processing" | "done" | "error";

interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: Date;
}

const FORMATS = ["Shorts 9:16", "TikTok 9:16", "Reels 9:16", "YouTube 16:9"];
const DURATIONS = ["15s", "30s", "60s"];

export default function VideoGeneratorPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState(FORMATS[0]);
  const [duration, setDuration] = useState(DURATIONS[0]);
  const [motion, setMotion] = useState(5);
  const [addCaptions, setAddCaptions] = useState(true);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleGenerate = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: prompt.slice(0, 30) || "Quick Video",
      status: "queued",
      createdAt: new Date(),
    };

    setJobs((prev) => [newJob, ...prev]);
    showToast("ვიდეოს გენერაცია...");

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
  }, [prompt, showToast]);

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
      title="Video Generator"
      titleKa="ვიდეო გენერატორი"
      subtitle="Quick Video"
      subtitleKa="სწრაფი ვიდეო"
      primaryLabel="Generate Video"
      primaryLabelKa="ვიდეოს გენერაცია"
      onPrimary={handleGenerate}
      toast={toast}
    >
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          აღწერა
        </h2>
        <div className="space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="აღწერეთ ვიდეო..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          ფორმატი
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">პლატფორმა</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">ხანგრძლივობა</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-1.5">
            <label className="text-xs text-gray-500">მოძრაობა</label>
            <span className="text-xs text-cyan-400">{motion}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={motion}
            onChange={(e) => setMotion(Number(e.target.value))}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          ოპციები
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={addCaptions}
            onChange={(e) => setAddCaptions(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50"
          />
          <div>
            <span className="text-xs text-gray-300">სუბტიტრების დამატება</span>
            <p className="text-[10px] text-gray-500">ავტომატური AI სუბტიტრები</p>
          </div>
        </label>
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
