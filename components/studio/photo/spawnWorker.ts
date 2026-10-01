/**
 * The one line that creates the culling worker, kept in a file of its own: `new URL(…, import.meta.url)` is the
 * pattern webpack recognises and emits as a same-origin worker chunk, and `import.meta` is syntax the jest
 * transform does not take — tests replace this module instead of loading it.
 */
export function spawnCullWorker(): Worker {
  return new Worker(new URL('./cull.worker.ts', import.meta.url), { name: 'photo-cull' });
}
