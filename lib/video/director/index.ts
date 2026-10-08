/**
 * lib/video/director — the Video Pipeline V1–V6 domain layer (PROJECT_MASTER.md Section B, Objective A).
 *
 *   types              the master's contracts (Shot, ConsistencyLock, Storyboard, FrozenStoryboard, ShotError, …)
 *   storyboard         validateStoryboard · freeze · isFrozen · draftFromFrozen
 *   googleVeoProvider  GoogleVeoProvider — the only VideoGenProvider — over an injected VeoEnginePort
 *   director           createVideoDirector — plan (draft) → freeze → execute, halting on the first ShotError
 *   planner            createGeminiStoryboardPlanner over an injected text generator
 *
 * Everything exported here is pure: no 'server-only', no network, no keys. The live engine port and the default
 * Gemini planner live in ./server (import '@/lib/video/director/server' from server code), so a client component that
 * validates a draft does not pull the Veo engine or an LLM client into its bundle.
 */
export * from './types';
export * from './storyboard';
export * from './googleVeoProvider';
export * from './director';
export * from './planner';
