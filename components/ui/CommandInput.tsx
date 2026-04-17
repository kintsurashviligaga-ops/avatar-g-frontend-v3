'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface CommandInputProps {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  className?: string
  loading?: boolean
}

export function CommandInput({ placeholder, value, onChange, onSubmit, className, loading }: CommandInputProps) {
  const [localValue, setLocalValue] = React.useState(value ?? '')
  const inputRef = React.useRef<HTMLTextAreaElement>(null)

  const controlledValue = value !== undefined ? value : localValue

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setLocalValue(v)
    onChange?.(v)
  }, [onChange])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (controlledValue.trim() && !loading) {
        onSubmit?.(controlledValue.trim())
      }
    }
  }, [controlledValue, loading, onSubmit])

  return (
    <div
      className={cn(
        'relative rounded-2xl border transition-all duration-300',
        'bg-white/[0.03] border-[rgba(0,212,255,0.12)]',
        'focus-within:border-[rgba(0,212,255,0.35)] focus-within:shadow-[0_0_24px_rgba(0,212,255,0.1)]',
        className,
      )}
    >
      <textarea
        ref={inputRef}
        value={controlledValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={loading}
        className={cn(
          'w-full bg-transparent resize-none px-5 py-4 pr-14 text-sm text-[var(--color-text)]',
          'placeholder:text-[var(--color-muted)] outline-none',
          'disabled:opacity-60',
        )}
        style={{ minHeight: 56, maxHeight: 160 }}
        data-testid="command-bar-input"
      />
      <button
        onClick={() => controlledValue.trim() && !loading && onSubmit?.(controlledValue.trim())}
        disabled={!controlledValue.trim() || loading}
        className={cn(
          'absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center',
          'bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] text-white',
          'transition-all duration-200 hover:brightness-110 active:scale-95',
          'disabled:opacity-30 disabled:cursor-not-allowed',
        )}
      >
        {loading ? (
          <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
        )}
      </button>
    </div>
  )
}
