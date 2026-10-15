import { createHash } from 'node:crypto';
import type { ImagePlan, PreparedReference } from './contracts';
import { ImageError } from './errors';

export type ImagePart = { text: string } | { inlineData: { mimeType: 'image/png'; data: string } };
export interface ImagePayload {
  contents: Array<{ role: 'user'; parts: ImagePart[] }>;
  generationConfig: { responseModalities: ['TEXT', 'IMAGE']; imageConfig: { aspectRatio: string; imageSize: string } };
}
/** The quote shows these exact supplementary parts. The original prompt remains a separate unchanged part. */
export function instructionParts(plan: ImagePlan): string[] {
  return [
    'Requested image operation: ' + plan.request.operation + '.',
    ...plan.request.instructions,
    ...plan.references.map((ref, i) => 'Reference ' + (i + 1) + ': id=' + ref.id + '; role=' + ref.role + '.'),
  ];
}
export function imagePayload(plan: ImagePlan, refs: readonly PreparedReference[]): ImagePayload {
  if (refs.length !== plan.references.length || refs.some((ref, i) => {
    const expected = plan.references[i];
    return !expected || expected.id !== ref.id || expected.role !== ref.role || expected.digest !== ref.digest;
  })) throw new ImageError('reference_changed', 'The prepared references differ from the approved plan.', 409);
  const parts: ImagePart[] = [
    { text: plan.request.originalPrompt },
    { text: 'Requested image operation: ' + plan.request.operation + '.' },
    ...plan.request.instructions.map(text => ({ text })),
  ];
  refs.forEach((ref, i) => {
    parts.push({ text: 'Reference ' + (i + 1) + ': id=' + ref.id + '; role=' + ref.role + '.' });
    parts.push({ inlineData: { mimeType: ref.mime, data: ref.data.toString('base64') } });
  });
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: {
      aspectRatio: plan.request.aspectRatio, imageSize: plan.request.resolution,
    } },
  };
}
export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
