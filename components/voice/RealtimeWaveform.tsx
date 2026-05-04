'use client';

import { useEffect, useRef } from 'react';

import type { RealtimeVoiceState } from '@/types/voice';

type RealtimeWaveformProps = {
  analyserNode: AnalyserNode | null;
  state: RealtimeVoiceState;
};

const STATE_COLORS: Record<RealtimeVoiceState, [string, string]> = {
  idle: ['#164e63', '#0e7490'],
  listening: ['#0ea5e9', '#22d3ee'],
  processing: ['#f59e0b', '#f97316'],
  speaking: ['#22c55e', '#14b8a6'],
  error: ['#dc2626', '#f43f5e'],
};

function drawIdleWave(context: CanvasRenderingContext2D, width: number, height: number, time: number, state: RealtimeVoiceState): void {
  const [from, to] = STATE_COLORS[state];
  const centerY = height * 0.5;
  const amplitude = height * 0.09;

  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);

  context.lineWidth = 2;
  context.strokeStyle = gradient;
  context.beginPath();

  for (let x = 0; x <= width; x += 3) {
    const y = centerY + Math.sin((x + time * 180) / 52) * amplitude * 0.35;
    if (x === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
}

export function RealtimeWaveform({ analyserNode, state }: RealtimeWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    let frequencyData: Uint8Array<ArrayBuffer> | null = null;

    const draw = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const context = canvas.getContext('2d');
      if (!context) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const parentWidth = canvas.clientWidth || 320;
      const parentHeight = canvas.clientHeight || 128;
      const ratio = window.devicePixelRatio || 1;
      const targetWidth = Math.max(1, Math.floor(parentWidth * ratio));
      const targetHeight = Math.max(1, Math.floor(parentHeight * ratio));

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (!analyserNode || state === 'idle' || state === 'processing' || state === 'error') {
        drawIdleWave(context, parentWidth, parentHeight, timestamp / 1000, state);
        rafId = requestAnimationFrame(draw);
        return;
      }

      const bins = analyserNode.frequencyBinCount;
      if (!frequencyData || frequencyData.length !== bins) {
        frequencyData = new Uint8Array(new ArrayBuffer(bins));
      }

      analyserNode.getByteFrequencyData(frequencyData);

      context.clearRect(0, 0, parentWidth, parentHeight);

      const [from, to] = STATE_COLORS[state];
      const gradient = context.createLinearGradient(0, 0, parentWidth, parentHeight);
      gradient.addColorStop(0, from);
      gradient.addColorStop(1, to);

      const barCount = 64;
      const barWidth = parentWidth / barCount;
      const maxHeight = parentHeight * 0.82;

      for (let index = 0; index < barCount; index += 1) {
        const sourceIndex = Math.min(frequencyData.length - 1, Math.floor((index / barCount) * frequencyData.length));
        const value = (frequencyData[sourceIndex] ?? 0) / 255;
        const eased = Math.pow(value, 1.45);
        const barHeight = Math.max(2, eased * maxHeight);
        const x = index * barWidth;
        const y = (parentHeight - barHeight) * 0.5;

        context.fillStyle = gradient;
        context.fillRect(x + 1, y, Math.max(1, barWidth - 2), barHeight);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [analyserNode, state]);

  return (
    <canvas
      ref={canvasRef}
      className="h-28 w-full rounded-2xl border border-cyan-200/20 bg-gradient-to-br from-slate-950/60 via-slate-900/70 to-slate-950/85"
      aria-label="Realtime voice waveform"
    />
  );
}

export default RealtimeWaveform;
