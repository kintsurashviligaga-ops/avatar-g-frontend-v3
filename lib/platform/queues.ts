import { redisGetString, redisSetString, getRedisClient } from '@/lib/platform/redis';

export type QueueName = 'webhooks_ingest' | 'processing_jobs' | 'billing_events';

export type QueueItem<T = Record<string, unknown>> = {
  id: string;
  queue: QueueName;
  enqueued_at: string;
  payload: T;
};

const memoryQueues = new Map<QueueName, QueueItem[]>();

function queueKey(name: QueueName): string {
  return `queue:${name}`;
}

function queueMetricsKey(name: QueueName): string {
  return `queue:metrics:${name}`;
}

function ensureMemoryQueue(name: QueueName): QueueItem[] {
  const existing = memoryQueues.get(name);
  if (existing) return existing;
  const created: QueueItem[] = [];
  memoryQueues.set(name, created);
  return created;
}

async function incrementQueueProcessed(name: QueueName): Promise<void> {
  const key = queueMetricsKey(name);
  const current = Number((await redisGetString(key)) ?? '0');
  await redisSetString(key, String(current + 1), 60 * 60 * 24);
}

export async function enqueueQueueItem<T = Record<string, unknown>>(name: QueueName, payload: T): Promise<QueueItem<T>> {
  const item: QueueItem<T> = {
    id: crypto.randomUUID(),
    queue: name,
    enqueued_at: new Date().toISOString(),
    payload,
  };

  const redis = getRedisClient();
  if (redis) {
    await redis.lpush(queueKey(name), JSON.stringify(item));
    return item;
  }

  ensureMemoryQueue(name).push(item as QueueItem);
  return item;
}

export async function dequeueQueueItems<T = Record<string, unknown>>(name: QueueName, maxItems = 1): Promise<Array<QueueItem<T>>> {
  const redis = getRedisClient();
  if (redis) {
    const items: Array<QueueItem<T>> = [];
    for (let index = 0; index < maxItems; index += 1) {
      const raw = await redis.rpop<string>(queueKey(name));
      if (!raw) {
        break;
      }

      try {
        items.push(JSON.parse(String(raw)) as QueueItem<T>);
        await incrementQueueProcessed(name);
      } catch {
        continue;
      }
    }
    return items;
  }

  const queue = ensureMemoryQueue(name);
  const items: Array<QueueItem<T>> = [];
  while (items.length < maxItems && queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    items.push(next as QueueItem<T>);
  }
  return items;
}

export async function getQueueSnapshot(): Promise<Record<QueueName, { pending: number; processed_24h: number }>> {
  const redis = getRedisClient();
  const queueNames: QueueName[] = ['webhooks_ingest', 'processing_jobs', 'billing_events'];

  if (redis) {
    const snapshot: Record<QueueName, { pending: number; processed_24h: number }> = {
      webhooks_ingest: { pending: 0, processed_24h: 0 },
      processing_jobs: { pending: 0, processed_24h: 0 },
      billing_events: { pending: 0, processed_24h: 0 },
    };

    for (const name of queueNames) {
      const pending = Number((await redis.llen(queueKey(name))) ?? 0);
      const processedRaw = await redisGetString(queueMetricsKey(name));
      snapshot[name] = {
        pending,
        processed_24h: Number(processedRaw ?? '0'),
      };
    }

    return snapshot;
  }

  return {
    webhooks_ingest: { pending: ensureMemoryQueue('webhooks_ingest').length, processed_24h: 0 },
    processing_jobs: { pending: ensureMemoryQueue('processing_jobs').length, processed_24h: 0 },
    billing_events: { pending: ensureMemoryQueue('billing_events').length, processed_24h: 0 },
  };
}
