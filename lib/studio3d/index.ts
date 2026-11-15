/** lib/studio3d — Phase 8.8 3D Studio (flag STUDIO_3D_V2, off). Pure; server-only parts take their I/O injected. */
export * from './flag';
export * from './spec';
export * from './price';
export * from './prompts';
export * from './pipeline';
export * from './intent';
export * from './labels';
export { engineConfig, buildSpec, encodeSpec, decodeSpec, cloudRunEngine, executionState, parseManifest, EngineError } from './engine';
export type { WorkerSpec, EngineConfig, Studio3dEngine, WorkerState, WorkerManifest, CloudRunExecution } from './engine';
export { readGlb, packGlb, bounds, GlbError } from './export/glb';
export type { GlbMesh, GlbMaterial, GlbTexture } from './export/glb';
export { glbToStl, meshToStl, readStl } from './export/stl';
export { glbToObj, meshToObj } from './export/obj';
