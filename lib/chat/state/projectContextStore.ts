/**
 * lib/chat/state/projectContextStore.ts
 * Project memory — active project, recent assets, continuity.
 */

'use client';

import { createContext, useContext, type Dispatch } from 'react';
import type { ProjectContext, ProjectAssetRef, ProjectChip } from '../types';

// ─── State ───────────────────────────────────────────────────────────────────

export interface ProjectStoreState {
  active: ProjectContext | null;
  recentProjectIds: string[];
}

export const initialProjectState: ProjectStoreState = {
  active: null,
  recentProjectIds: [],
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ProjectAction =
  | { type: 'SET_PROJECT'; project: ProjectContext }
  | { type: 'CLEAR_PROJECT' }
  | { type: 'ADD_ASSET'; asset: ProjectAssetRef }
  | { type: 'ADD_RESULT'; resultId: string }
  | { type: 'SET_WORKFLOW'; workflowId: string }
  | { type: 'SET_NEXT_ACTION'; action: string }
  | { type: 'UPDATE_PROJECT'; updates: Partial<ProjectContext> };

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function projectReducer(
  state: ProjectStoreState,
  action: ProjectAction
): ProjectStoreState {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'SET_PROJECT':
      return {
        active: action.project,
        recentProjectIds: [
          action.project.projectId,
          ...state.recentProjectIds.filter(id => id !== action.project.projectId),
        ].slice(0, 10),
      };

    case 'CLEAR_PROJECT':
      return { ...state, active: null };

    case 'ADD_ASSET':
      if (!state.active) return state;
      return {
        ...state,
        active: {
          ...state.active,
          recentAssets: [action.asset, ...state.active.recentAssets].slice(0, 20),
          updatedAt: now,
        },
      };

    case 'ADD_RESULT':
      if (!state.active) return state;
      return {
        ...state,
        active: {
          ...state.active,
          recentResultIds: [action.resultId, ...state.active.recentResultIds].slice(0, 20),
          updatedAt: now,
        },
      };

    case 'SET_WORKFLOW':
      if (!state.active) return state;
      return {
        ...state,
        active: { ...state.active, activeWorkflowId: action.workflowId, updatedAt: now },
      };

    case 'SET_NEXT_ACTION':
      if (!state.active) return state;
      return {
        ...state,
        active: { ...state.active, nextRecommendedAction: action.action, updatedAt: now },
      };

    case 'UPDATE_PROJECT':
      if (!state.active) return state;
      return {
        ...state,
        active: { ...state.active, ...action.updates, updatedAt: now },
      };

    default:
      return state;
  }
}

// ─── Chip helper ─────────────────────────────────────────────────────────────

export function getProjectChip(project: ProjectContext): ProjectChip {
  return {
    projectId: project.projectId,
    projectName: project.projectName,
    goal: project.goal,
    assetCount: project.recentAssets.length,
    activeStep: project.nextRecommendedAction,
  };
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface ProjectContextValue {
  state: ProjectStoreState;
  dispatch: Dispatch<ProjectAction>;
}

export const ProjectStoreContext = createContext<ProjectContextValue | null>(null);

export function useProjectStore() {
  const ctx = useContext(ProjectStoreContext);
  if (!ctx) throw new Error('useProjectStore must be used within ProjectStoreContext.Provider');
  return ctx;
}
