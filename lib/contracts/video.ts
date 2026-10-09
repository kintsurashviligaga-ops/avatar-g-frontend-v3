/**
 * lib/contracts/video.ts — the Video Pipeline V1–V6 contracts (PROJECT_MASTER.md Part 1 §9, Section B).
 *
 * They already exist, with the master's names, in lib/video/director/types.ts (the director that implements them);
 * re-exported here so every Part 1 contract has one import path. Type-only.
 */
export type {
  CancellationToken,
  Clip,
  ConsistencyLock,
  FrozenStoryboard,
  Shot,
  ShotError,
  ShotErrorReason,
  ShotGenerationResult,
  ShotMetadata,
  ShotProgressEvent,
  Storyboard,
  VideoDirector,
  VideoGenProvider,
  VideoParams,
  VideoPipelineInput,
  VideoPipelineOutput,
} from '@/lib/video/director/types';
