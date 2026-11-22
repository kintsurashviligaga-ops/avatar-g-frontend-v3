/**
 * lib/services/montage/smart — the Smart Editor layer of Montage (Phase 8.7, flag MONTAGE_SMART_EDITOR, off).
 * Pure modules only; the routes (PR B) and Agent G (PR C) build on these.
 */
export * from './flag';
export * from './timeline';
export * from './captions';
export { SENSITIVITIES, SENSITIVITY, MIN_KEEP_SEC, MIN_PIECE_SEC, normalizeSpans, keptSpans, silenceCuts, FILLERS, isFiller, fillerCuts, planSilenceRemoval, applyToClip, masterCuts, type Sensitivity, type SilencePlan } from './silence';
export * from './effects';
export * from './templates';
export * from './price';
export * from './ops';
export * from './beat';
export * from './captionSvg';
