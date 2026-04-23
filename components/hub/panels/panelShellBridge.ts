import type { PanelRunCallbacks, ServiceMode, WorkspaceResult } from '@/types/dashboard';

type PanelShellRun = {
  progress: (value: number) => void;
  complete: (detail: string, preview: WorkspaceResult, title?: string) => void;
  fail: (message: string) => void;
};

export function beginPanelShellRun(
  callbacks: PanelRunCallbacks | undefined,
  service: ServiceMode,
  label: string,
  initialProgress: number,
): PanelShellRun {
  const jobId = callbacks?.onJobStart(service, label) ?? null;
  if (jobId) {
    callbacks?.onJobProgress(jobId, initialProgress);
  }

  return {
    progress: (value) => {
      if (jobId) {
        callbacks?.onJobProgress(jobId, value);
      }
    },
    complete: (detail, preview, title = label) => {
      if (jobId) {
        callbacks?.onJobComplete(jobId, service, title, detail, preview);
      }
    },
    fail: (message) => {
      if (jobId) {
        callbacks?.onJobError(jobId, message);
      }
    },
  };
}

export function createTextPreview(title: string, detail: string, text: string): WorkspaceResult {
  return {
    kind: 'text',
    title,
    detail,
    text,
  };
}