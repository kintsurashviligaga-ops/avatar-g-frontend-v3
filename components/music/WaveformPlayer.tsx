// Component: WaveformPlayer - Audio player with waveform visualization

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface WaveformPlayerProps {
  audioUrl?: string;
  waveformData?: number[];
  duration: number;
  title?: string;
  onTimeChange?: (time: number) => void;
  className?: string;
  autoPlay?: boolean;
}

export function WaveformPlayer({
  audioUrl,
  waveformData,
  duration,
  title,
  onTimeChange,
  className,
  autoPlay = false
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData || waveformData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    const samples = waveformData;
    const barCount = Math.min(samples.length, width / 2);
    const barWidth = width / barCount;

    ctx.fillStyle = 'rgba(34, 197, 94, 0.6)'; // Green color

    for (let i = 0; i < barCount; i++) {
      const sample = samples[Math.floor((i / barCount) * samples.length)];
      const barHeight = Math.max(2, (sample || 0) * height * 0.8);
      const x = i * barWidth + 1;
      const y = (height - barHeight) / 2;

      ctx.fillRect(x, y, barWidth - 2, barHeight);
    }

    // Draw progress line
    if (duration > 0) {
      const progressX = (currentTime / duration) * width;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.8)'; // Cyan color
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, height);
      ctx.stroke();
    }

    // Draw hover indicator
    if (hoveredTime !== null && duration > 0) {
      const hoverX = (hoveredTime / duration) * width;
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [waveformData, currentTime, duration, hoveredTime]);

  // Update audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Animation loop for playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      onTimeChange?.(audio.currentTime);

      if (!audio.ended) {
        animationRef.current = requestAnimationFrame(updateTime);
      } else {
        setIsPlaying(false);
      }
    };

    animationRef.current = requestAnimationFrame(updateTime);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, onTimeChange]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newTime = (x / rect.width) * duration;

    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(newTime, duration));
      setCurrentTime(audioRef.current.currentTime);
      onTimeChange?.(audioRef.current.currentTime);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoveredTime((x / rect.width) * duration);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Title */}
      {title && (
        <div className="text-sm font-medium text-slate-200 truncate">
          {title}
        </div>
      )}

      {/* Canvas/Waveform */}
      <canvas
        ref={canvasRef}
        width={400}
        height={80}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={() => setHoveredTime(null)}
        className="w-full h-20 bg-slate-800/50 rounded-lg cursor-pointer border border-slate-700/40 hover:border-cyan-400/40 transition"
      />

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={!audioUrl}
          className={cn(
            'p-1.5 rounded-lg transition',
            audioUrl
              ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/40'
              : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
          )}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>

        {/* Time display */}
        <div className="flex items-center gap-1 text-xs text-slate-400 font-mono min-w-max">
          <span>{formatTime(currentTime)}</span>
          <span>/</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Progress bar */}
        <div className="flex-1">
          <Slider
            min={0}
            max={duration}
            value={[currentTime]}
            onValueChange={(value) => {
              const newTime = value[0];
              setCurrentTime(newTime);
              if (audioRef.current) {
                audioRef.current.currentTime = newTime;
                onTimeChange?.(newTime);
              }
            }}
            step={0.1}
            disabled={!audioUrl}
            className="cursor-pointer"
          />
        </div>

        {/* Volume control */}
        <div className="flex items-center gap-2">
          {volume === 0 ? (
            <VolumeX size={16} className="text-slate-400" />
          ) : (
            <Volume2 size={16} className="text-slate-400" />
          )}
          <Slider
            min={0}
            max={1}
            value={[volume]}
            onValueChange={(value) => setVolume(value[0])}
            step={0.01}
            className="w-16 cursor-pointer"
          />
        </div>
      </div>

      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          crossOrigin="anonymous"
          onEnded={() => setIsPlaying(false)}
        />
      )}
    </div>
  );
}
