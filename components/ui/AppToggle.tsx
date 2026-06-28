'use client';

/**
 * AppToggle — a bulletproof on/off switch using INLINE styles only.
 *
 * Why inline (not Tailwind): toggles repeatedly rendered "wrong" in production
 * because the OFF-state relied on theme tokens / arbitrary Tailwind classes whose
 * contrast (or JIT/purge behaviour) differed from dev. Inline styles remove every
 * one of those failure modes — no purge, no CSS-var resolution, no dark/light
 * conflict. Guaranteed: ON → knob RIGHT + cyan track; OFF → knob LEFT + grey track,
 * identical in every theme and environment.
 */

interface AppToggleProps {
  on: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  /** Accessible name (screen readers); no visible text is rendered. */
  label?: string;
}

export function AppToggle({ on, onChange, disabled, label }: AppToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexShrink: 0,
        width: 44,
        height: 24,
        padding: 0,
        border: 'none',
        borderRadius: 9999,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        backgroundColor: on ? '#06b6d4' /* cyan-500 */ : '#475569' /* slate-600 */,
        transition: 'background-color 200ms ease',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 23 : 3, // RIGHT when ON, LEFT when OFF (knob is 18px in a 44px track)
          width: 18,
          height: 18,
          borderRadius: 9999,
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          transition: 'left 200ms ease',
          display: 'block',
        }}
      />
    </button>
  );
}

export default AppToggle;
