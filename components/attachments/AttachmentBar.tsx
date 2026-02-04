"use client";

import { useState, useRef } from "react";
import { Upload, Camera, Mic, X, FileText, Image as ImageIcon, Film } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { Attachment } from "@/lib/types/runtime";

interface AttachmentBarProps {
  serviceId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  acceptTypes?: string[];
  maxFiles?: number;
  maxSizeMB?: number;
}

const SERVICE_ACCEPT_TYPES: Record<string, string> = {
  "image-generator": "image/*",
  "image-architect": "image/*",
  "video-generator": "image/*,video/*",
  "video-cine-lab": "image/*,video/*",
  "music-studio": "audio/*",
  "voice-lab": "audio/*",
  "text-intelligence": ".txt,.md,.pdf,.doc,.docx",
  "business-agent": ".txt,.pdf,.csv",
  "game-forge": ".txt,.pdf,image/*",
  "prompt-builder": ".txt,image/*",
};

export default function AttachmentBar({
  serviceId,
  attachments,
  onAttachmentsChange,
  maxFiles = 6,
  maxSizeMB = 25,
}: AttachmentBarProps) {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const accept = SERVICE_ACCEPT_TYPES[serviceId] || "image/*";
  const supportsCamera = accept.includes("image");
  const supportsAudio = accept.includes("audio");

  const handleFileAdd = (files: FileList | null, source: "upload" | "camera" | "mic") => {
    if (!files || files.length === 0) return;

    const maxBytes = maxSizeMB * 1024 * 1024;
    const newAttachments: Attachment[] = [];

    Array.from(files).forEach((file) => {
      if (file.size > maxBytes) {
        alert(language === "ka" 
          ? "ფაილი ძალიან დიდია: " + file.name 
          : "File too large: " + file.name);
        return;
      }

      if (attachments.length + newAttachments.length >= maxFiles) {
        alert(language === "ka" 
          ? "მაქსიმუმ " + maxFiles + " ფაილი" 
          : "Maximum " + maxFiles + " files");
        return;
      }

      const attachment: Attachment = {
        id: "att_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.type,
        size: file.size,
        source,
        objectUrl: URL.createObjectURL(file),
        createdAt: new Date().toISOString(),
      };

      newAttachments.push(attachment);
    });

    onAttachmentsChange([...attachments, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    const attachment = attachments.find((a) => a.id === id);
    if (attachment) {
      URL.revokeObjectURL(attachment.objectUrl);
    }
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const getIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    if (type.startsWith("video/")) return <Film className="w-4 h-4" />;
    if (type.startsWith("audio/")) return <Mic className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
      <h3 className="text-sm font-semibold text-cyan-400">
        {language === "ka" ? "დანართები" : "Attachments"}
      </h3>

      <div className="grid grid-cols-3 gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={(e) => handleFileAdd(e.target.files, "upload")}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-xs transition-colors"
        >
          <Upload className="w-5 h-5 text-cyan-400" />
          {language === "ka" ? "ატვირთვა" : "Upload"}
        </button>

        {supportsCamera && (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileAdd(e.target.files, "camera")}
              className="hidden"
            />
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-xs transition-colors"
            >
              <Camera className="w-5 h-5 text-cyan-400" />
              {language === "ka" ? "კამერა" : "Camera"}
            </button>
          </>
        )}

        {supportsAudio && (
          <button
            disabled
            className="flex flex-col items-center justify-center gap-2 px-4 py-3 bg-white/5 border border-cyan-500/20 rounded-lg text-xs opacity-50"
          >
            <Mic className="w-5 h-5 text-cyan-400" />
            {language === "ka" ? "მიკრო" : "Mic"}
          </button>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 p-3 bg-white/5 border border-cyan-500/20 rounded-lg"
            >
              <div className="flex-shrink-0 text-cyan-400">{getIcon(att.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{att.name}</p>
                <p className="text-xs text-slate-400">{formatSize(att.size)}</p>
              </div>
              <button
                onClick={() => removeAttachment(att.id)}
                className="flex-shrink-0 p-1 hover:bg-red-500/20 rounded text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        {language === "ka" 
          ? "მაქსიმუმ " + maxFiles + " ფაილი, თითო " + maxSizeMB + "MB-მდე"
          : "Max " + maxFiles + " files, " + maxSizeMB + "MB each"}
      </p>
    </div>
  );
}
