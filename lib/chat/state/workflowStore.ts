/**
 * lib/chat/state/workflowStore.ts
 * Workflow state machine — tracks active workflow progress.
 */

'use client';

import { createContext, useContext, type Dispatch } from 'react';
import type { WorkflowState, WorkflowAction, WorkflowSnapshot } from '../types';

// ─── State ───────────────────────────────────────────────────────────────────

export interface WorkflowStoreState {
  active: WorkflowState | null;
  history: string[]; // recent workflow IDs
}

export const initialWorkflowState: WorkflowStoreState = {
  active: null,
  history: [],
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function workflowReducer(
  state: WorkflowStoreState,
  action: WorkflowAction
): WorkflowStoreState {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'START_WORKFLOW':
      return {
        active: action.workflow,
        history: [action.workflow.workflowId, ...state.history].slice(0, 20),
      };

    case 'ADVANCE_STEP': {
      if (!state.active || state.active.workflowId !== action.workflowId) return state;
      const next = state.active.currentStep + 1;
      if (next >= state.active.steps.length) {
        return { ...state, active: { ...state.active, status: 'complete', currentStep: next, updatedAt: now } };
      }
      const steps = state.active.steps.map((s, i) =>
        i === next ? { ...s, status: 'running' as const } : s
      );
      return { ...state, active: { ...state.active, currentStep: next, steps, updatedAt: now } };
    }

    case 'COMPLETE_STEP': {
      if (!state.active || state.active.workflowId !== action.workflowId) return state;
      const steps = state.active.steps.map((s, i) =>
        i === action.stepIndex
          ? { ...s, status: 'completed' as const, resultId: action.resultId }
          : s
      );
      return {
        ...state,
        active: {
          ...state.active,
          steps,
          completedSteps: [...state.active.completedSteps, action.stepIndex],
          updatedAt: now,
        },
      };
    }

    case 'FAIL_STEP': {
      if (!state.active || state.active.workflowId !== action.workflowId) return state;
      const steps = state.active.steps.map((s, i) =>
        i === action.stepIndex
          ? { ...s, status: 'failed' as const, error: action.error }
          : s
      );
      return {
        ...state,
        active: {
          ...state.active,
          steps,
          failedSteps: [...state.active.failedSteps, action.stepIndex],
          status: 'blocked',
          updatedAt: now,
        },
      };
    }

    case 'SKIP_STEP': {
      if (!state.active || state.active.workflowId !== action.workflowId) return state;
      const steps = state.active.steps.map((s, i) =>
        i === action.stepIndex ? { ...s, status: 'skipped' as const } : s
      );
      return { ...state, active: { ...state.active, steps, updatedAt: now } };
    }

    case 'PAUSE_WORKFLOW':
      if (!state.active || state.active.workflowId !== action.workflowId) return state;
      return { ...state, active: { ...state.active, status: 'waiting_input', updatedAt: now } };

    case 'RESUME_WORKFLOW':
      if (!state.active || state.active.workflowId !== action.workflowId) return state;
      return {
        ...state,
        active: { ...state.active, status: 'running', currentStep: action.fromStep, updatedAt: now },
      };

    case 'CANCEL_WORKFLOW':
      return { ...state, active: null };

    case 'RETRY_STEP': {
      if (!state.active || state.active.workflowId !== action.workflowId) return state;
      const steps = state.active.steps.map((s, i) =>
        i === action.stepIndex ? { ...s, status: 'running' as const, error: undefined } : s
      );
      return {
        ...state,
        active: {
          ...state.active,
          steps,
          failedSteps: state.active.failedSteps.filter(i => i !== action.stepIndex),
          status: 'running',
          updatedAt: now,
        },
      };
    }

    case 'CLEAR_WORKFLOW':
      return { active: null, history: state.history };

    default:
      return state;
  }
}

// ─── Snapshot helper ─────────────────────────────────────────────────────────

export function getWorkflowSnapshot(wf: WorkflowState): WorkflowSnapshot {
  const completed = wf.steps.filter(s => s.status === 'completed').length;
  const total = wf.steps.length;
  return {
    workflowId: wf.workflowId,
    workflowType: wf.workflowType,
    steps: wf.steps,
    currentStep: wf.currentStep,
    status: wf.status,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface WorkflowContextValue {
  state: WorkflowStoreState;
  dispatch: Dispatch<WorkflowAction>;
}

export const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function useWorkflowStore() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflowStore must be used within WorkflowContext.Provider');
  return ctx;
}
