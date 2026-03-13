/**
 * lib/chat/types/project.types.ts
 * Project memory model — enables continuity of work across sessions.
 */

import type { LocaleCode, Platform, StylePreset } from '@/types/core';

export interface ProjectAssetRef {
  assetId: string;
  type: 'image' | 'video' | 'audio' | 'document' | '3d-model' | 'text';
  label: string;
  preview?: string;
  createdAt: string;
}

export interface ProjectContext {
  projectId: string;
  projectName: string;
  projectType: string;
  goal?: string;
  language: LocaleCode;
  targetPlatform?: Platform;
  selectedBrand?: string;
  selectedStyle?: StylePreset;
  recentAssets: ProjectAssetRef[];
  recentResultIds: string[];
  activeWorkflowId?: string;
  nextRecommendedAction?: string;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight project chip for header display */
export interface ProjectChip {
  projectId: string;
  projectName: string;
  goal?: string;
  assetCount: number;
  activeStep?: string;
}
