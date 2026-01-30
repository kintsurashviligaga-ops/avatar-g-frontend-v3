"use client";

import React, { useState, useCallback } from "react";
import { Check, Loader2, X, FileText, BarChart3, Users } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

type JobStatus = "queued" | "processing" | "done" | "error";

interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: Date;
}

const TASKS = ["Market Analysis", "Report Generation", "Data Processing", "Forecasting", "Presentation"];

export default function BusinessAgentPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [task, setTask] = useState(TASKS[0]);
  const [company, setCompany] = useState("");
  const [dataRange, setDataRange] = useState("Last 30 days");
  const [depth, setDepth] = useState(5);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleAnalyze = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: `${task} - ${company || "General"}`,
      status: "queued",
      createdAt: new Date(),
    };

    setJobs((prev) => [newJob, ...prev]);
    showToast("ანალიზი დაწყებულია");

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
  }, [task, company, showToast]);

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
      title="Business Agent"
      titleKa="ბიზნეს აგენტი"
      subtitle="Business AI"
      subtitleKa="ბიზნეს AI"
      primaryLabel="Start Analysis"
      primaryLabelKa="ანალიზის დაწყება"
      onPrimary={handleAnalyze}
      toast={toast}
    >
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          დავალება
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">ტიპი</label>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {TASKS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">კომპანია/პროექტი</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="მაგ: TechCorp Inc."
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          მონაცემები და სიღრმე
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">დროის შუალედი</label>
            <select
              value={dataRange}
              onChange={(e) => setDataRange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last Quarter</option>
              <option>Last Year</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">ანალიზის სიღრმე</label>
              <span className="text-xs text-cyan-400">{depth}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          ანგარიშის პარამეტრები
        </h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCharts}
              onChange={(e) => setIncludeCharts(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50"
            />
            <div>
              <span className="text-xs text-gray-300">ჩართეთ გრაფიკები</span>
              <p className="text-[10px] text-gray-500">ვიზუალური მონაცემთა წარმოდგენა</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSummary}
              onChange={(e) => setIncludeSummary(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50"
            />
            <div>
              <span className="text-xs text-gray-300">ეგზეკუტიური შეჯამება</span>
              <p className="text-[10px] text-gray-500">მთავარი დასკვნების მოკლე ვერსია</p>
            </div>
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
