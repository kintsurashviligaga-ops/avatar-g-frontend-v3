"use client";

import React, { useState, useCallback } from "react";
import { Check, Loader2, X, Upload, UserCircle } from "lucide-react";
import ServicePageShell from "@/components/ServicePageShell";

type JobStatus = "queued" | "processing" | "done" | "error";

interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: Date;
}

const STYLES = ["Realistic", "Anime", "Cartoon", "3D Render", "Pixel Art"];
const ETHNICITIES = ["Any", "Asian", "European", "African", "Latino", "Middle Eastern"];
const AGES = ["Young", "Adult", "Middle Aged", "Elderly"];

export default function AvatarBuilderPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [description, setDescription] = useState("");
  const [style, setStyle] = useState(STYLES[0]);
  const [ethnicity, setEthnicity] = useState(ETHNICITIES[0]);
  const [age, setAge] = useState(AGES[1]);
  const [expression, setExpression] = useState(5);
  const [lighting, setLighting] = useState(5);
  const [usePhoto, setUsePhoto] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleGenerate = useCallback(() => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      name: description.slice(0, 30) || "New Avatar",
      status: "queued",
      createdAt: new Date(),
    };

    setJobs((prev) => [newJob, ...prev]);
    showToast("ავატარის გენერაცია დაიწყო");

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, status: "processing" } : j))
      );
    }, 1000);

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, status: "done" } : j))
      );
    }, 7000);
  }, [description, showToast]);

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
      title="Avatar Builder"
      titleKa="ავატარის შექმნა"
      subtitle="AI Avatar Creation"
      subtitleKa="AI ავატარის შექმნა"
      primaryLabel="Generate Avatar"
      primaryLabelKa="ავატარის გენერაცია"
      onPrimary={handleGenerate}
      toast={toast}
    >
      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          აღწერა
        </h2>
        <div className="space-y-4">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="აღწერეთ ავატარი..."
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm resize-none focus:outline-none focus:border-cyan-500/50"
          />
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">სტილი</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {STYLES.map((s) => (
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
          მახასიათებლები
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">ეთნიკურება</label>
            <select
              value={ethnicity}
              onChange={(e) => setEthnicity(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {ETHNICITIES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">ასაკი</label>
            <select
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50"
            >
              {AGES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">ემოცია</label>
              <span className="text-xs text-cyan-400">{expression}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={expression}
              onChange={(e) => setExpression(Number(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs text-gray-500">განათება</label>
              <span className="text-xs text-cyan-400">{lighting}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={lighting}
              onChange={(e) => setLighting(Number(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          ფოტო რეფერენსი
        </h2>
        <div className="space-y-4">
          <button className="w-full py-4 rounded-xl border border-dashed border-white/20 bg-black/20 flex flex-col items-center gap-2 hover:border-cyan-500/50 transition-colors">
            <Upload className="w-6 h-6 text-gray-500" />
            <span className="text-xs text-gray-400">ატვირთეთ თქვენი ფოტო</span>
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={usePhoto}
              onChange={(e) => setUsePhoto(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/50"
            />
            <span className="text-xs text-gray-400">გამოიყენე ფოტო როგორც რეფერენსი</span>
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
