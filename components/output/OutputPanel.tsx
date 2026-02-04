"use client";

import { Download, Copy, Share2, Image as ImageIcon, Video, Music, FileText } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { JobOutput } from "@/lib/types/runtime";

interface OutputPanelProps {
  output?: JobOutput;
  isLoading?: boolean;
  onSendTo?: (service: string) => void;
}

export default function OutputPanel({ output, isLoading, onSendTo }: OutputPanelProps) {
  const { language } = useLanguage();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!output) {
    return (
      <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
        <div className="text-center py-12">
          <p className="text-sm text-slate-500">
            {language === "ka" ? "შედეგი გამოჩნდება აქ..." : "Output will appear here..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
      <h3 className="text-sm font-semibold text-cyan-400">
        {language === "ka" ? "შედეგი" : "Output"}
      </h3>

      {/* Text Output */}
      {output.type === "text" && (
        <div className="space-y-3">
          <div className="bg-[#05070A] rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-sm whitespace-pre-wrap font-sans">{output.text}</pre>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleCopy(output.text!)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm"
            >
              <Copy className="w-4 h-4" />
              {language === "ka" ? "კოპირება" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Image Output */}
      {output.type === "image" && output.files && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {output.files.map((file, i) => (
              <div key={i} className="aspect-square bg-[#05070A] rounded-lg overflow-hidden">
                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {output.files.map((file, i) => (
              <button
                key={i}
                onClick={() => handleDownload(file.url, file.name)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm"
              >
                <Download className="w-4 h-4" />
                {language === "ka" ? "ჩამოტვირთვა" : "Download"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video Output */}
      {output.type === "video" && output.files && output.files[0] && (
        <div className="space-y-3">
          <video src={output.files[0].url} controls className="w-full rounded-lg bg-[#05070A]" />
          <button
            onClick={() => handleDownload(output.files![0].url, output.files![0].name)}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm"
          >
            <Download className="w-4 h-4" />
            {language === "ka" ? "ჩამოტვირთვა" : "Download"}
          </button>
        </div>
      )}

      {/* Audio Output */}
      {output.type === "audio" && output.files && output.files[0] && (
        <div className="space-y-3">
          <audio src={output.files[0].url} controls className="w-full" />
          <button
            onClick={() => handleDownload(output.files![0].url, output.files![0].name)}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm"
          >
            <Download className="w-4 h-4" />
            {language === "ka" ? "ჩამოტვირთვა" : "Download"}
          </button>
        </div>
      )}

      {/* Send To Actions */}
      {onSendTo && (
        <div className="pt-3 border-t border-cyan-500/10">
          <p className="text-xs text-slate-400 mb-2">
            {language === "ka" ? "გაგზავნა სხვა სერვისში" : "Send to Another Service"}
          </p>
          <div className="flex flex-wrap gap-2">
            {output.type === "text" && (
              <>
                <button
                  onClick={() => onSendTo("voice-lab")}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-xs"
                >
                  Voice Lab
                </button>
                <button
                  onClick={() => onSendTo("text-intelligence")}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-xs"
                >
                  Text Intelligence
                </button>
              </>
            )}
            {output.type === "image" && (
              <>
                <button
                  onClick={() => onSendTo("video-generator")}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-xs"
                >
                  Video Generator
                </button>
                <button
                  onClick={() => onSendTo("image-architect")}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-xs"
                >
                  Image Architect
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
