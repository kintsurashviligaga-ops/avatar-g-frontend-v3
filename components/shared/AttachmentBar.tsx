"use client";

import { useState, useRef } from "react";
import { Upload, Camera, Video, Mic } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

interface AttachmentBarProps {
  onAttachmentsChange?: (files: File[]) => void;
}

export default function AttachmentBar({ onAttachmentsChange }: AttachmentBarProps) {
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { language } = useLanguage();

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    setAttachments([...attachments, ...newFiles]);
    if (onAttachmentsChange) onAttachmentsChange([...attachments, ...newFiles]);
  };

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
      <h3 className="text-sm font-semibold text-cyan-400">
        {language === "ka" ? "დანართები" : "Attachments"}
      </h3>
      <div className="grid grid-cols-4 gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFileAdd(e.target.files)}
          className="hidden"
          multiple
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm"
        >
          <Upload className="w-4 h-4 text-cyan-400" />
        </button>
      </div>
    </div>
  );
}
