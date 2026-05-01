'use client';

import React, { useRef, useCallback } from 'react';
import { X, FileText, Image, Paperclip } from 'lucide-react';

export interface UploadedFile {
  name: string;
  type: string;
  size: number;
  preview?: string;
  data: string; // base64 without prefix
}

interface FileUploadProps {
  files: UploadedFile[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function readFileAsBase64(file: File): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:<type>;base64, prefix
      const base64Data = result.split(',')[1] ?? '';
      const preview = file.type.startsWith('image/') ? result : undefined;
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        preview,
        data: base64Data,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function processFiles(rawFiles: File[]): Promise<UploadedFile[]> {
  const results = await Promise.all(rawFiles.map(readFileAsBase64));
  return results;
}

export default function FileUpload({ files, onAdd, onRemove }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleFiles = useCallback(
    (raw: FileList | null) => {
      if (!raw) return;
      const arr = Array.from(raw);
      onAdd(arr);
    },
    [onAdd]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  if (files.length === 0) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.txt"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="p-2 rounded-xl text-white/40 hover:text-cyan-400 hover:bg-white/[0.05] transition-colors"
          title="ფაილის დამატება"
        >
          <Paperclip className="w-5 h-5" />
        </button>
      </>
    );
  }

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,application/pdf,.doc,.docx,.txt"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Drop zone with previews */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          flex flex-wrap gap-2 p-2 rounded-xl border transition-colors
          ${isDragging
            ? 'border-cyan-400/50 bg-cyan-500/5'
            : 'border-white/10 bg-white/[0.02]'
          }
        `}
      >
        {files.map((file, idx) => (
          <div
            key={idx}
            className="relative flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1.5 max-w-[160px]"
          >
            {/* Preview or icon */}
            {file.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={file.preview}
                alt={file.name}
                className="w-8 h-8 object-cover rounded"
              />
            ) : (
              <div className="w-8 h-8 flex items-center justify-center bg-white/10 rounded">
                {file.type === 'application/pdf' ? (
                  <FileText className="w-4 h-4 text-red-400" />
                ) : (
                  <Image className="w-4 h-4 text-cyan-400" />
                )}
              </div>
            )}

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-xs truncate leading-tight">{file.name}</p>
              <p className="text-white/40 text-[10px]">{formatBytes(file.size)}</p>
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white/20 hover:bg-red-500/60 rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-2.5 h-2.5 text-white" />
            </button>
          </div>
        ))}

        {/* Add more button */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center w-10 h-10 border border-dashed border-white/20 rounded-lg text-white/30 hover:text-cyan-400 hover:border-cyan-400/40 transition-colors"
        >
          <Paperclip className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
