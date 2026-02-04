"use client";

import { useCallback, useState } from "react";
import { Upload, X, FileText, Image as ImageIcon } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

interface FileUploadZoneProps {
  accept?: string;
  maxFiles?: number;
  onFilesSelected: (files: File[]) => void;
  labelKa?: string;
  labelEn?: string;
}

export default function FileUploadZone({
  accept = "image/*",
  maxFiles = 5,
  onFilesSelected,
  labelKa = "ფაილების ატვირთვა",
  labelEn = "Upload Files",
}: FileUploadZoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { language } = useLanguage();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files).slice(0, maxFiles);
      setFiles(droppedFiles);
      onFilesSelected(droppedFiles);
    },
    [maxFiles, onFilesSelected]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).slice(0, maxFiles);
      setFiles(selectedFiles);
      onFilesSelected(selectedFiles);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onFilesSelected(newFiles);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
          isDragging
            ? "border-cyan-400 bg-cyan-500/10"
            : "border-cyan-500/30 bg-white/5 hover:border-cyan-500/50"
        }`}
      >
        <input
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-500/20 rounded-full">
            <Upload className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">
              {language === "ka" ? labelKa : labelEn}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {language === "ka"
                ? "გადმოიტანეთ ფაილები აქ ან დააჭირეთ არჩევისთვის"
                : "Drag files here or click to select"}
            </p>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {files.map((file, index) => (
            <div
              key={index}
              className="relative bg-white/5 border border-cyan-500/20 rounded-lg p-3"
            >
              <button
                onClick={() => removeFile(index)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>

              <div className="flex flex-col items-center gap-2">
                {file.type.startsWith("image/") ? (
                  <>
                    <ImageIcon className="w-8 h-8 text-cyan-400" />
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-20 object-cover rounded"
                    />
                  </>
                ) : (
                  <FileText className="w-8 h-8 text-cyan-400" />
                )}
                <p className="text-xs text-center truncate w-full">
                  {file.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
