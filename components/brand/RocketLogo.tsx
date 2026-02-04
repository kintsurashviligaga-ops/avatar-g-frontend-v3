"use client";

import { Rocket } from "lucide-react";

interface RocketLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
}

const SIZE_MAP = {
  sm: "w-6 h-6",
  md: "w-10 h-10",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
};

export default function RocketLogo({ 
  size = "md", 
  className = "",
  showText = true 
}: RocketLogoProps) {
  return (
    <div className={'flex items-center gap-3 ' + className}>
      <div className={'relative rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 backdrop-blur-xl border border-cyan-500/30 flex items-center justify-center p-2 ' + SIZE_MAP[size]}>
        <Rocket className={'text-cyan-400 ' + (size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-16 h-16')} />
      </div>
      {showText && size !== 'sm' && (
        <div>
          <h1 className={'font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent ' + (size === 'xl' ? 'text-4xl' : size === 'lg' ? 'text-2xl' : 'text-xl')}>
            Avatar G
          </h1>
          {size !== 'md' && (
            <p className="text-xs text-slate-400">AI Production Platform</p>
          )}
        </div>
      )}
    </div>
  );
}
