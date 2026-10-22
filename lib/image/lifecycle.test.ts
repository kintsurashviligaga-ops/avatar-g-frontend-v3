import { IMAGE_LIFECYCLE_REPLACEMENT, imageLifecycleRefusal } from './lifecycle';

describe('imageLifecycleRefusal — Imagen 3 is discontinued on Vertex AI (MASTER TASK v3.1, PR 8)', () => {
  it.each([
    'imagen-3.0-generate-001',
    'imagen-3.0-generate-002',
    'imagen-3.0-fast-generate-001',
    'imagen-3.0-capability-001',
    'models/imagen-3.0-generate-002',
    '  IMAGEN-3.0-generate-002 ',
  ])('%s is refused by name, with the replacement', (id) => {
    const why = imageLifecycleRefusal(id);
    expect(why).toContain(id.trim());
    expect(why).toContain('discontinued');
    expect(why).toContain(IMAGE_LIFECYCLE_REPLACEMENT);
  });

  it.each([
    'gemini-3.1-flash-image',
    'gemini-2.5-flash-image',
    'gemini-3-pro-image',
    'imagen-4.0-generate-001',
    'imagen-30-generate',
    '',
    undefined,
    42,
  ])('%p is not a lifecycle refusal', (id) => {
    expect(imageLifecycleRefusal(id)).toBeNull();
  });

  it('the replacement is the model GG chose (2026-10-22)', () => {
    expect(IMAGE_LIFECYCLE_REPLACEMENT).toBe('gemini-3.1-flash-image');
  });
});
