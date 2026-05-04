'use client';

import {
  INTERIOR_COLOR_OPTIONS,
  INTERIOR_GOAL_OPTIONS,
  INTERIOR_LIGHTING_OPTIONS,
  INTERIOR_MATERIAL_OPTIONS,
  buildInteriorDesignBrief,
} from '@/lib/interior/smart-intake';

type SmartIntakeProps = {
  prompt: string;
  values: Record<string, string | number>;
  onChange: (id: string, value: string) => void;
};

function renderOptionRow(input: {
  title: string;
  fieldId: string;
  value: string;
  options: Array<{ value: string; label: string; visual: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium" style={{ color: 'rgba(148,163,184,0.75)' }}>
        {input.title}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {input.options.map((option) => {
          const active = option.value === input.value;
          return (
            <button
              key={`${input.fieldId}_${option.value}`}
              type="button"
              onClick={() => input.onSelect(option.value)}
              className="rounded-lg px-2 py-1.5 text-[11px] text-left transition-colors"
              style={{
                border: active ? '1px solid rgba(0,212,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
                background: active ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.02)',
                color: active ? '#22d3ee' : 'rgba(226,232,240,0.85)',
              }}
            >
              <span className="mr-1">{option.visual}</span>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function InteriorSmartIntake({ prompt, values, onChange }: SmartIntakeProps) {
  const goal = String(values.primary_goal || 'full_renovation');
  const palette = String(values.color_palette || 'neutral_scandi');
  const materials = String(values.materials || 'natural_wood');
  const lighting = String(values.lighting_vibe || 'natural_sunlight');
  const confirmed = String(values.confirm_design_brief || 'false') === 'true';

  const designBrief = buildInteriorDesignBrief({
    userPrompt: prompt,
    answers: {
      primaryGoal: goal,
      colorPalette: palette,
      materials,
      lightingVibe: lighting,
    },
  });

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.14)' }}
    >
      <div>
        <p className="text-xs font-semibold" style={{ color: '#22d3ee' }}>
          AI Consultant — Smart Intake
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'rgba(148,163,184,0.75)' }}>
          Quick guided answers improve 3D spatial quality before credit spend.
        </p>
      </div>

      {renderOptionRow({
        title: '1) Primary Goal',
        fieldId: 'primary_goal',
        value: goal,
        options: INTERIOR_GOAL_OPTIONS,
        onSelect: (value) => onChange('primary_goal', value),
      })}

      {renderOptionRow({
        title: '2) Color Palette',
        fieldId: 'color_palette',
        value: palette,
        options: INTERIOR_COLOR_OPTIONS,
        onSelect: (value) => onChange('color_palette', value),
      })}

      {renderOptionRow({
        title: '3) Materials',
        fieldId: 'materials',
        value: materials,
        options: INTERIOR_MATERIAL_OPTIONS,
        onSelect: (value) => onChange('materials', value),
      })}

      {renderOptionRow({
        title: '4) Lighting Vibe',
        fieldId: 'lighting_vibe',
        value: lighting,
        options: INTERIOR_LIGHTING_OPTIONS,
        onSelect: (value) => onChange('lighting_vibe', value),
      })}

      <div
        className="rounded-lg p-3 space-y-2"
        style={{ background: 'rgba(0,0,0,0.24)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p className="text-[11px] font-medium" style={{ color: '#e2e8f0' }}>
          Final Design Brief (preview before API call)
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.88)' }}>
          {designBrief}
        </p>
        <button
          type="button"
          onClick={() => onChange('confirm_design_brief', confirmed ? 'false' : 'true')}
          className="rounded-md px-2.5 py-1.5 text-[11px] font-medium"
          style={{
            border: confirmed ? '1px solid rgba(34,197,94,0.6)' : '1px solid rgba(255,255,255,0.12)',
            background: confirmed ? 'rgba(20,83,45,0.3)' : 'rgba(255,255,255,0.04)',
            color: confirmed ? '#86efac' : 'rgba(226,232,240,0.86)',
          }}
        >
          {confirmed ? '✓ Brief confirmed' : 'Confirm design brief'}
        </button>
      </div>
    </div>
  );
}
