'use client';

import { useState, useCallback } from 'react';

interface UseFileUploadReturn {
  file: File | null;
  preview: string | null;
  isUploading: boolean;
  error: string | null;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleCameraCapture: (event: React.ChangeEvent<HTMLInputElement>) => void;
  clearFile: () => void;
  uploadFile: (language?: string) => Promise<{ success: boolean; description?: string; error?: string }>;
}

export function useFileUpload(): UseFileUploadReturn {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('Invalid file type. Please upload an image or PDF.');
        return;
      }

      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File too large. Maximum size is 10MB.');
        return;
      }

      setFile(selectedFile);
      setError(null);

      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setPreview(null);
      }
    }
  }, []);

  const handleCameraCapture = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const capturedFile = event.target.files?.[0];
    if (capturedFile) {
      setFile(capturedFile);
      setError(null);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(capturedFile);
    }
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError(null);
  }, []);

  const uploadFile = useCallback(async (language: string = 'ka') => {
    if (!file) {
      return { success: false, error: 'No file selected' };
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('language', language);

      const response = await fetch('/api/vision', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      return { 
        success: true, 
        description: data.description 
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsUploading(false);
    }
  }, [file]);

  return {
    file,
    preview,
    isUploading,
    error,
    handleFileSelect,
    handleCameraCapture,
    clearFile,
    uploadFile
  };
}
