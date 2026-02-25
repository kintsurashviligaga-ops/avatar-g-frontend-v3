import { AvatarType } from './types';

type TypeStepProps = {
  value: AvatarType;
  onChange: (nextType: AvatarType) => void;
};

const TYPES: Array<{ key: AvatarType; label: string; hint: string }> = [
  { key: 'scan', label: 'Scan', hint: 'რეალისტური იდენტობის მაქსიმალური სიზუსტე' },
  { key: 'studio', label: 'Studio', hint: 'პრემიუმ სტუდიური სტილი კომერციული გამოსაყენებლად' },
  { key: 'stylized', label: 'Stylized', hint: 'სტილიზებული ვიზუალი კრეატიული ბრენდებისთვის' },
  { key: 'fast', label: 'Fast', hint: 'სწრაფი ვერსია სწრაფი ტესტირებისა და MVP-სთვის' },
];

export function TypeStep({ value, onChange }: TypeStepProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {TYPES.map((typeOption) => {
        const selected = value === typeOption.key;

        return (
          <button
            key={typeOption.key}
            type="button"
            onClick={() => onChange(typeOption.key)}
            className={`rounded-xl border p-4 text-left transition ${
              selected ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-white/5 hover:border-cyan-500/40'
            }`}
          >
            <h3 className="text-lg font-semibold text-white">{typeOption.label}</h3>
            <p className="mt-2 text-sm text-slate-300">{typeOption.hint}</p>
          </button>
        );
      })}
    </div>
  );
}
