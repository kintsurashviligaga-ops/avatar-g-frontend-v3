"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  // PHASE 52 TASK 4a — solid Obsidian Black (#0A0A0A) surface with a hairline
  // Metallic Gold (#D4AF37) border and a gold shimmer light-sweep.
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-[#0A0A0A] border border-[#D4AF37]/25 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-[#D4AF37]/15 before:to-transparent',
        className
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="relative p-6 border border-white/[0.12] bg-[linear-gradient(155deg,rgba(12,22,46,0.85),rgba(7,14,32,0.72))] rounded-2xl space-y-4 overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.40)]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      <Skeleton className="h-12 w-12 rounded-xl" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-transparent pt-20 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    </div>
  );
}

