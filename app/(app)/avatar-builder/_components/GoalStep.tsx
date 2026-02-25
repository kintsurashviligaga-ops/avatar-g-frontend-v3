import { AvatarGoal } from './types';

type GoalStepProps = {
  value: AvatarGoal;
  onChange: (goal: AvatarGoal) => void;
};

const GOALS: Array<{ key: AvatarGoal; label: string; hint: string }> = [
  { key: 'personal', label: 'Personal', hint: 'პერსონალური ბრენდინგი და ინდივიდუალური გამოყენება' },
  { key: 'business', label: 'Business', hint: 'კომერციული კამპანიები და მარკეტინგული კონტენტი' },
  { key: 'team', label: 'Team', hint: 'გუნდური სამუშაო, მრავალროლიანი გამოყენება' },
];

export function GoalStep({ value, onChange }: GoalStepProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {GOALS.map((goal) => {
        const selected = value === goal.key;
        return (
          <button
            key={goal.key}
            type="button"
            onClick={() => onChange(goal.key)}
            className={`rounded-xl border p-4 text-left transition ${
              selected ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-white/5 hover:border-cyan-500/40'
            }`}
          >
            <h3 className="text-lg font-semibold text-white">{goal.label}</h3>
            <p className="mt-2 text-sm text-slate-300">{goal.hint}</p>
          </button>
        );
      })}
    </div>
  );
}
