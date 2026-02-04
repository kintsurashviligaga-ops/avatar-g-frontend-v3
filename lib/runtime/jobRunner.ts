import { JobRecord, ServiceId, Attachment } from "@/lib/types/runtime";
import { pushHistory, updateHistory } from "./storage";

export function createJob(
  serviceId: ServiceId,
  prompt: string,
  params: Record<string, any>,
  attachments: Attachment[],
  projectId?: string
): JobRecord {
  const job: JobRecord = {
    id: "job_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    serviceId,
    projectId,
    status: "queued",
    progress: 0,
    prompt,
    params,
    attachments,
    createdAt: new Date().toISOString(),
  };
  pushHistory(serviceId, job);
  return job;
}

export async function runJob(job: JobRecord, language: "ka" | "en" = "ka"): Promise<JobRecord> {
  updateHistory(job.serviceId, job.id, {
    status: "running",
    startedAt: new Date().toISOString(),
  });

  // Simulate progress
  await simulateProgress(job);

  try {
    const response = await fetch("/api/" + job.serviceId + "/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: job.serviceId,
        prompt: job.prompt,
        params: job.params,
        language: language,
        attachments: job.attachments.map((a) => ({
          name: a.name,
          type: a.type,
          size: a.size,
        })),
      }),
    });

    const result = await response.json();

    updateHistory(job.serviceId, job.id, {
      status: "done",
      progress: 100,
      output: result.output,
      finishedAt: new Date().toISOString(),
    });

    return { ...job, status: "done", output: result.output };
  } catch (error: any) {
    updateHistory(job.serviceId, job.id, {
      status: "error",
      error: { message: error.message || "Unknown error" },
      finishedAt: new Date().toISOString(),
    });
    throw error;
  }
}

async function simulateProgress(job: JobRecord) {
  const delays = [
    { progress: 10, delay: 400 },
    { progress: 35, delay: 1200 },
    { progress: 70, delay: 2400 },
  ];

  for (const step of delays) {
    await new Promise((resolve) => setTimeout(resolve, step.delay));
    updateHistory(job.serviceId, job.id, { progress: step.progress });
  }
}

export function cancelJob(serviceId: ServiceId, jobId: string) {
  updateHistory(serviceId, jobId, {
    status: "canceled",
    finishedAt: new Date().toISOString(),
  });
}
