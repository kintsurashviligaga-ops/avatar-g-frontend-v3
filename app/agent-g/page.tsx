"use client";

import React, { useState, useCallback } from "react";
import { Check, Loader2, X, Crown, Sparkles, Zap, Code, MessageSquare } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

type JobStatus = "queued" | "processing" | "done" | "error";

interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: Date;
}

const MODES = ["Chat", "Code", "Analyze", "Create", "Research"];

export default function AgentGPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState(MODES[0]);
  const [complexity, setComplexity] = useState(7);
  const [reasoning, setReasoning] = useState(true);
  const [webSearch, setWebSearch] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleExecute = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: `${mode}: ${prompt.slice(0, 25)}...`,
      status: "queued",
      createdAt: new Date(),
    };

    setJobs((prev) => [newJob, ...prev]);
    showToast("Agent G მუშაობს...");

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, status: "processing" } : j))
      );
    }, 1000);

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, status: "done" } : j))
      );
    }, 5000);
  }, [mode, prompt, showToast]);

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
      title="Agent G"
      titleKa="აგენტი G"
      subtitle="Universal AI Assistant"
      subtitleKa="უნივერსალური AI ასისტენტი"
      primaryLabel="Execute"
      primaryLabelKa="გაშვება"
      onPrimary={handleExecute}
      toast={toast}
      isPremium={true}
    >
      <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-yellow-600/10 backdrop-blur-sm p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-amber-400">Premium Agent</h3>
            <p className="text-[10px] text-gray-400">ულიმიტო შესაძლებლობები</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          მოთხოვნა
        </h2>
        <div className="space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="რაიმე უნივერსალური დავალება..."
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50"
          />
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">რეჟიმი</label>
            <div className="grid grid-cols-5 gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`py-2 px-1 rounded-lg text-[10px] font-medium transition-all ${
                    mode === m
                      ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-400"
                      : "bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          კონფიგურაცია
        </h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">კომპლექსურობა</label>
              <span className="text-xs text-cyan-400">{complexity}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={complexity}
              onChange={(e) => setComplexity(Number(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={reasoning}
                onChange={(e) => setReasoning(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50"
              />
              <div>
                <span className="text-xs text-gray-300">ღრმა მსჯელობა</span>
                <p className="text-[10px] text-gray-500">Step-by-step ანალიზი</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={webSearch}
                onChange={(e) => setWebSearch(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50"
              />
              <div>
                <span className="text-xs text-gray-300">ვებ ძებნა</span>
                <p className="text-[10px] text-gray-500">რეალურ დროში ინფორმაცია</p>
              </div>
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            ისტორია
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
            <p className="text-xs text-gray-600 text-center py-4">ისტორია ცარიელია</p>
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
