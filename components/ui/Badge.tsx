"use client";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "error" | "warning" | "info";
  size?: "sm" | "md";
}

export default function Badge({ 
  children, 
  variant = "default",
  size = "md" 
}: BadgeProps) {
  const variants = {
    default: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    success: "bg-green-500/20 text-green-400 border-green-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
    warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    info: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  };
  
  const sizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
  };

  return (
    <span
      className={
        'inline-flex items-center rounded-full border font-medium ' +
        variants[variant] + ' ' + sizes[size]
      }
    >
      {children}
    </span>
  );
}
