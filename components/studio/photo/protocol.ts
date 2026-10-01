/** Messages between the culling workspace and its worker (./cull.worker.ts). `seq` pairs a reply with its request. */
import type { Grade } from '@/lib/photo/grade';
import type { AnalyzeResult, RenderResult } from './pipeline';

export type CullRequest =
  | { type: 'analyze'; seq: number; file: File }
  | { type: 'render'; seq: number; file: File; grade: Grade; mime: 'image/jpeg' | 'image/png' };

export type CullResponse =
  | { type: 'analyzed'; seq: number; ok: true; result: AnalyzeResult }
  | { type: 'rendered'; seq: number; ok: true; result: RenderResult }
  | { type: 'analyzed' | 'rendered'; seq: number; ok: false; error: string };
