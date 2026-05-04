export type InteriorIntakeValue =
  | 'full_renovation'
  | 'furniture_layout'
  | 'lighting_update'
  | 'staging'
  | 'warm_earth'
  | 'cold_industrial'
  | 'vibrant_bold'
  | 'neutral_scandi'
  | 'natural_wood'
  | 'concrete_steel'
  | 'luxury_marble'
  | 'glass_metal'
  | 'natural_sunlight'
  | 'cozy_dimmable'
  | 'studio_bright'
  | 'ambient_layered';

export type InteriorIntakeAnswers = {
  primaryGoal: string;
  colorPalette: string;
  materials: string;
  lightingVibe: string;
};

export type InteriorIntakeOption = {
  value: InteriorIntakeValue;
  label: string;
  visual: string;
};

export const INTERIOR_GOAL_OPTIONS: InteriorIntakeOption[] = [
  { value: 'full_renovation', label: 'Full Renovation', visual: '🛠️' },
  { value: 'furniture_layout', label: 'Furniture Layout', visual: '🛋️' },
  { value: 'lighting_update', label: 'Lighting Update', visual: '💡' },
  { value: 'staging', label: 'Real-Estate Staging', visual: '🏠' },
];

export const INTERIOR_COLOR_OPTIONS: InteriorIntakeOption[] = [
  { value: 'warm_earth', label: 'Warm Earth Tones', visual: '🟤' },
  { value: 'cold_industrial', label: 'Cold Industrial', visual: '⚙️' },
  { value: 'vibrant_bold', label: 'Vibrant / Bold', visual: '🎨' },
  { value: 'neutral_scandi', label: 'Neutral Scandi', visual: '🤍' },
];

export const INTERIOR_MATERIAL_OPTIONS: InteriorIntakeOption[] = [
  { value: 'natural_wood', label: 'Natural Wood', visual: '🪵' },
  { value: 'concrete_steel', label: 'Concrete & Steel', visual: '🏗️' },
  { value: 'luxury_marble', label: 'Luxury Marble', visual: '🪨' },
  { value: 'glass_metal', label: 'Glass & Metal', visual: '🔩' },
];

export const INTERIOR_LIGHTING_OPTIONS: InteriorIntakeOption[] = [
  { value: 'natural_sunlight', label: 'Natural Sunlight', visual: '☀️' },
  { value: 'cozy_dimmable', label: 'Cozy Dimmable', visual: '🕯️' },
  { value: 'studio_bright', label: 'Studio Bright', visual: '🔦' },
  { value: 'ambient_layered', label: 'Layered Ambient', visual: '✨' },
];

const LABEL_LOOKUP = new Map<string, string>(
  [...INTERIOR_GOAL_OPTIONS, ...INTERIOR_COLOR_OPTIONS, ...INTERIOR_MATERIAL_OPTIONS, ...INTERIOR_LIGHTING_OPTIONS]
    .map((option) => [option.value, option.label]),
);

function resolveLabel(value: string, fallback: string): string {
  return LABEL_LOOKUP.get(value) || fallback;
}

export function buildInteriorDesignBrief(input: {
  userPrompt: string;
  answers: InteriorIntakeAnswers;
}): string {
  const userPrompt = String(input.userPrompt || '').trim();
  const goal = resolveLabel(input.answers.primaryGoal, 'Full Renovation');
  const palette = resolveLabel(input.answers.colorPalette, 'Neutral Scandi');
  const materials = resolveLabel(input.answers.materials, 'Natural Wood');
  const lighting = resolveLabel(input.answers.lightingVibe, 'Natural Sunlight');

  const directive = userPrompt || 'Transform this space into a refined, practical interior concept.';

  return [
    directive,
    `Design objective: ${goal}.`,
    `Palette direction: ${palette}.`,
    `Material strategy: ${materials}.`,
    `Lighting mood: ${lighting}.`,
    'Architectural-grade interior visualization, realistic spatial proportions, premium furniture composition.',
    'Hyper-realistic textures, volumetric lighting, high-fidelity material grain, 8k spatial detail.',
    'Preserve structural constraints from source photo while maximizing flow and usability.',
  ].join(' ');
}
