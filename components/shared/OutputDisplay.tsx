"use client";

import { Download, Copy, Share2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

interface OutputDisplayProps {
  type: "image" | "video" | "audio" | "text";
  content: string | null;
  isLoading?: boolean;
}

export default function OutputDisplay({
  type,
  content,
  isLoading = false,
}: OutputDisplayProps) {
  const { language } = useLanguage();

  const handleDownload = () => {
    if (!content) return;
    console.log("Download:", content);
  };

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
  };

  const handleShare = () => {
    if (!content) return;
    console.log("Share:", content);
  };

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-cyan-400">
          {language === "ka" ? "შედეგი" : "Output"}
        </h3>

        {content && !isLoading && (
          <div className="flex gap-2">
            {type === "text" && (
              <button
                onClick={handleCopy}
                className="p-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg transition-colors"
                title={language === "ka" ? "კოპირება" : "Copy"}
              >
                <Copy className="w-4 h-4 text-cyan-400" />
              </button>
            )}
            <button
              onClick={handleDownload}
              className="p-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg transition-colors"
              title={language === "ka" ? "ჩამოტვირთვა" : "Download"}
            >
              <Download className="w-4 h-4 text-cyan-400" />
            </button>
            <button
              onClick={handleShare}
              className="p-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg transition-colors"
              title={language === "ka" ? "გაზიარება" : "Share"}
            >
              <Share2 className="w-4 h-4 text-cyan-400" />
            </button>
          </div>
        )}
      </div>

      <div className="min-h-[300px] bg-[#05070A] rounded-lg p-4 flex items-center justify-center">
        {isLoading ? (
          <div className="text-center space-y-3">
            <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-400">
              {language === "ka" ? "გენერაცია..." : "Generating..."}
            </p>
          </div>
        ) : content ? (
          <div className="w-full">
            {type === "image" && (
              <img
                src={content}
                alt="Generated"
                className="w-full h-auto rounded-lg"
              />
            )}
            {type === "video" && (
              <video src={content} controls className="w-full rounded-lg" />
            )}
            {type === "audio" && (
              <audio src={content} controls className="w-full" />
            )}
            {type === "text" && (
              <div className="prose prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-sm">{content}</pre>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {language === "ka"
              ? "შედეგი გამოჩნდება აქ..."
              : "Output will appear here..."}
          </p>
        )}
      </div>
    </div>
  );
}
