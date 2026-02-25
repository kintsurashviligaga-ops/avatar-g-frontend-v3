import { OutputOptionsState } from './types';

type OutputOptionsProps = {
  value: OutputOptionsState;
  onChange: (next: OutputOptionsState) => void;
};

export function OutputOptions({ value, onChange }: OutputOptionsProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-white">Full Body</span>
          <button
            type="button"
            role="switch"
            aria-checked={value.fullBody}
            onClick={() => onChange({ ...value, fullBody: !value.fullBody })}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              value.fullBody ? 'bg-cyan-500/30 text-cyan-100' : 'bg-white/10 text-slate-300'
            }`}
          >
            {value.fullBody ? 'ON' : 'OFF'}
          </button>
        </label>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="mb-2 text-sm font-semibold text-white">Background</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['transparent', 'studio', 'none'] as const).map((background) => (
            <button
              key={background}
              type="button"
              onClick={() => onChange({ ...value, background })}
              className={`rounded-lg border px-3 py-2 text-sm ${
                value.background === background
                  ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                  : 'border-white/10 bg-white/5 text-slate-300'
              }`}
            >
              {background}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-white">Rigging</span>
          <button
            type="button"
            role="switch"
            aria-checked={value.rigging}
            onClick={() => onChange({ ...value, rigging: !value.rigging })}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              value.rigging ? 'bg-cyan-500/30 text-cyan-100' : 'bg-white/10 text-slate-300'
            }`}
          >
            {value.rigging ? 'ON' : 'OFF'}
          </button>
        </label>
      </div>
    </div>
  );
}
