'use client';

/**
 * Process-wide client EventBroker singleton + a typed publish helper.
 *
 * Same-tab fan-out: the chat runners publish pipeline lifecycle events
 * here and the SwarmStatusPanel subscribes — so the panel reflects real
 * generation progress, not a mock. When a cross-instance transport is
 * provisioned (Kafka / Redis pub-sub), this module is the single place to
 * swap the adapter behind the same EventBroker port.
 */

import { InProcessBroker, makeEvent, type EventBroker, type PipelineTopic } from './events';

let instance: EventBroker | null = null;

export function getBroker(): EventBroker {
  if (!instance) {
    instance = new InProcessBroker({
      onError: (topic, err) => {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[broker] handler error on', topic, err);
        }
      },
    });
  }
  return instance;
}

/** Convenience publisher with the JSON-only payload guard applied. */
export function publishPipeline(
  topic: PipelineTopic,
  pipelineId: string,
  payload: Record<string, string | number | boolean | null> = {},
): void {
  void getBroker().publish(makeEvent(topic, pipelineId, payload));
}
