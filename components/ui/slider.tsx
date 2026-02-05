interface SliderProps {
  value?: number[]
  onValueChange?: (value: number[]) => void
  max?: number
  step?: number
  className?: string
}

export function Slider({ value, onValueChange, max = 100, step = 1, className = "" }: SliderProps) {
  return (
    <input
      type="range"
      value={value?.[0] || 0}
      onChange={(e) => onValueChange?.([parseInt(e.target.value)])}
      max={max}
      step={step}
      className={`
        w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-400
        ${className}
      `}
    />
  )
}
