import { KeyboardEvent } from 'react';

type StepperProps = {
  steps: string[];
  currentStep: number;
  onStepChange: (nextStep: number) => void;
};

export function Stepper({ steps, currentStep, onStepChange }: StepperProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      const next = Math.min(index + 1, steps.length - 1);
      onStepChange(next);
    }
    if (event.key === 'ArrowLeft') {
      const prev = Math.max(index - 1, 0);
      onStepChange(prev);
    }
    if (event.key === 'Home') {
      onStepChange(0);
    }
    if (event.key === 'End') {
      onStepChange(steps.length - 1);
    }
  };

  return (
    <div aria-label="Avatar Builder Progress" role="tablist" className="grid gap-2 md:grid-cols-7">
      {steps.map((step, index) => {
        const isActive = currentStep === index;
        const isPast = index < currentStep;

        return (
          <button
            key={step}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`step-panel-${index}`}
            id={`step-tab-${index}`}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => onStepChange(index)}
            className={`rounded-lg border px-3 py-2 text-left text-xs md:text-sm transition ${
              isActive
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                : isPast
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-white/10 bg-white/5 text-slate-300'
            }`}
          >
            <span className="mr-2 font-semibold">{index}</span>
            {step}
          </button>
        );
      })}
    </div>
  );
}
