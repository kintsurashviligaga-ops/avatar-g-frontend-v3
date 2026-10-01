/**
 * components/studio/scene/webgl.ts — can this browser draw the scene at all?
 *
 * Without WebGL (disabled by policy, a blocklisted GPU, some privacy modes) three.js throws while creating its
 * renderer, and R3F's Canvas re-throws that into the page. The scene asks first and shows a sentence instead.
 *
 * ⚠️ THE PROBE CONTEXT IS RELEASED AT ONCE. Browsers keep only ~16 live WebGL contexts per page and silently kill the
 * OLDEST when another is made — a leaked probe could cost a live viewer its canvas (the 3D panel's GlbViewer).
 */
export function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
