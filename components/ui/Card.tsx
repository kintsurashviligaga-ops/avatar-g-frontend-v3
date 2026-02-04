"use client";

import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({ children, className = "", hover = false }: CardProps) {
  return (
    <div
      className={
        'bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl ' +
        (hover ? 'hover:bg-white/10 hover:border-cyan-500/40 transition-all duration-300' : '') +
        ' ' + className
      }
    >
      {children}
    </div>
  );
}
