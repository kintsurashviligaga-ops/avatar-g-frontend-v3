"use client";

import { Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { JobRecord } from "@/lib/types/runtime";

interface HistoryPanelProps {
  history: JobRecord[];
  onRerun?: (job: JobRecord) => void;
}

export default function HistoryPanel({ history, onRerun }: HistoryPanelProps) {
  const { language } = useLanguage();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-400" />;
      case "running":
        return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    if (hours === 0) {
      return language === "ka" ? minutes + " წთ წინ" : minutes + "m ago";
    }
    if (hours < 24) {
      return language === "ka" ? hours + " სთ წინ" : hours + "h ago";
    }
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-cyan-400">
          {language === "ka" ? "ისტორია" : "History"}
        </h3>
        <Clock className="w-4 h-4 text-slate-400" />
      </div>

      {history.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">
            {language === "ka" ? "ისტორია ცარიელია" : "No history yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {history.map((job) => (
            <div
              key={job.id}
              className="flex items-start gap-3 p-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg transition-colors"
            >
              <div className="flex-shrink-0 mt-1">{getStatusIcon(job.status)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm line-clamp-2">{job.prompt}</p>
                <p className="text-xs text-slate-400 mt-1">{formatTime(job.createdAt)}</p>
              </div>
              {onRerun && job.status === "done" && (
                <button
                  onClick={() => onRerun(job)}
                  className="flex-shrink-0 px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 rounded text-xs text-cyan-400"
                >
                  {language === "ka" ? "კვლავ" : "Rerun"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
