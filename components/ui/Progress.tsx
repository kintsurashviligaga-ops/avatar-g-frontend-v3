"use client";

interface ProgressProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function Progress({ 
  value, 
  max = 100, 
  showLabel = true,
  size = "md" 
}: ProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);
  
  const heights = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  return (
    <div className="space-y-2">
      {showLabel && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Progress</span>
          <span className="text-cyan-400 font-medium">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={'w-full bg-white/5 rounded-full overflow-hidden ' + heights[size]}>
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
