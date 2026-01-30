"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";

// Dynamically import the background to avoid SSR issues
const SpaceSingularityBackground = dynamic(
  () => import("@/components/SpaceSingularityBackground"),
  { 
    ssr: false,
    loading: () => <div className="fixed inset-0 bg-[#05070A]" />
  }
);

// Loading fallback
function LoadingFallback() {
  return (
    <div className="fixed inset-0 bg-[#05070A] flex items-center justify-center">
      <div className="text-cyan-400 animate-pulse">Loading...</div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <main className="relative min-h-screen">
      <Suspense fallback={<LoadingFallback />}>
        <SpaceSingularityBackground />
      </Suspense>
      
      {/* Your content goes here */}
      <div className="relative z-10 p-8">
        <h1 className="text-4xl font-bold text-white">
          Avatar G Workspace
        </h1>
      </div>
    </main>
  );
}
