"use client";

import React, { useState, useCallback } from "react";
import { Check, Loader2, X, Upload, FileText, BarChart3, Users } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

type JobStatus = "queued" | "processing" | "done" | "error";

interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: Date;
}

const BATCH_SIZES = ["1", "5", "10", "25", "50"];
const QUALITIES = ["Draft", "Standard", "High", "Ultra"];

export default function AIProductionPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [projectName, setProjectName] = useState("");
  const [batchSize, setBatchSize] = useState(BATCH_SIZES[1]);
  const [quality, setQuality] = useState(QUALITIES[1]);
  const [priority, setPriority] = useState(5);
  const [parallelJobs, setParallelJobs] = useState(3);
  const [autoExport, setAutoExport] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleStartProduction = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: projectName || "Batch Production",
      status: "queued",
      createdAt: new Date(),
    };

    setJobs((prev) => [newJob, ...prev]);
    showToast("პროდაქშენი დაწყებულია");

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, status: "processing" } : j))
      );
    }, 1000);

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, status: "done" } : j))
      );
    }, 15000);
  }, [projectName, showToast]);

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
      title="AI Production"
      titleKa="AI პროდაქშენი"
      subtitle="Media Production"
      subtitleKa="მედია პროდაქშენი"
      primaryLabel="Start Production"
      primaryLabelKa="პროდაქშენის დაწყება"
      onPrimary={handleStartProduction}
      toast={toast}
    >
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          პროექტის დაყენება
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">პროექტის სახელი</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="მაგ: Marketing Campaign Q1"
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">ბეჩის ზომა</label>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
              >
                {BATCH_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} items
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">ხარისხი</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
              >
                {QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          პრიორიტეტი და რესურსები
        </h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">პრიორიტეტი</label>
              <span className="text-xs text-cyan-400">{priority}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">პარალელური ჯობები</label>
              <span className="text-xs text-cyan-400">{parallelJobs}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={parallelJobs}
              onChange={(e) => setParallelJobs(Number(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          იმპორტი და ექსპორტი
        </h2>
        <div className="space-y-4">
          <button className="w-full py-4 rounded-xl border border-dashed border-white/20 bg-black/20 flex flex-col items-center gap-2 hover:border-cyan-500/50 transition-colors">
            <Upload className="w-6 h-6 text-gray-500" />
            <span className="text-xs text-gray-400">ატვირთეთ პროექტის ფაილები</span>
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoExport}
              onChange={(e) => setAutoExport(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50"
            />
            <span className="text-xs text-gray-400">ავტო ექსპორტი დასრულებისას</span>
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
