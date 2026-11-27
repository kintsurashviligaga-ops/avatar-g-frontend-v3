/**
 * lib/image/artDirector/grid.ts — run a variation grid (1, 2 or 4 images) with fair billing. Pure orchestration; every
 * side effect is injected so tests mock it.
 *
 * Billing rule (the one GG approved for the Director's Workflow, 2026-11-14): the TOTAL is checked against the balance
 * before anything starts (hold), each image is charged only when it is delivered, and a failed image is never charged
 * (or is refunded if a charge already landed). At most 2 calls run at once (Vertex allows only a few image calls a minute).
 */
export interface GridSlot<T> { index: number; status: 'done' | 'failed'; result?: T; error?: string; charged: number; refunded: number }

export interface GridDeps<T> {
  /** Balance check for the whole grid. false = nothing starts. */
  hold(total: number): Promise<boolean>;
  /** Make image `index`. Throws or returns null on failure. */
  render(index: number, signal: AbortSignal): Promise<T | null>;
  /** Charge one delivered image. Returns false when the debit did not land. */
  charge(index: number, credits: number): Promise<boolean>;
  /** Refund `credits` for image `index` (used only when a charge landed but delivery then failed). */
  refund(index: number, credits: number): Promise<void>;
  /** Persist a delivered image (Library); runs after the charge. Throws on failure. */
  deliver?(index: number, result: T): Promise<void>;
  onSlot?(slot: GridSlot<T>): void;
}

export interface GridResult<T> { started: boolean; slots: GridSlot<T>[]; charged: number; refunded: number }

export const GRID_CONCURRENCY = 2;

export async function runGrid<T>(count: number, perImage: number, deps: GridDeps<T>, signal: AbortSignal = new AbortController().signal): Promise<GridResult<T>> {
  if (![1, 2, 4].includes(count)) throw new Error('count must be 1, 2 or 4');
  if (!(perImage > 0)) throw new Error('price must be positive');
  if (!(await deps.hold(count * perImage))) return { started: false, slots: [], charged: 0, refunded: 0 };
  const slots: GridSlot<T>[] = new Array(count);
  let next = 0;
  const one = async (index: number) => {
    let charged = 0;
    let refunded = 0;
    try {
      if (signal.aborted) throw new Error('cancelled');
      const result = await deps.render(index, signal);
      if (result == null) throw new Error('no_image');
      if (!(await deps.charge(index, perImage))) throw new Error('billing_unavailable');
      charged = perImage;
      try {
        await deps.deliver?.(index, result);
      } catch {
        await deps.refund(index, perImage);
        refunded = perImage;
        throw new Error('save_failed');
      }
      slots[index] = { index, status: 'done', result, charged, refunded };
    } catch (e) {
      slots[index] = { index, status: 'failed', error: e instanceof Error ? e.message : 'failed', charged, refunded };
    }
    deps.onSlot?.(slots[index] as GridSlot<T>);
  };
  const worker = async () => {
    while (next < count) {
      const i = next++;
      await one(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(GRID_CONCURRENCY, count) }, worker));
  return {
    started: true,
    slots,
    charged: slots.reduce((s, x) => s + x.charged, 0),
    refunded: slots.reduce((s, x) => s + x.refunded, 0),
  };
}
