/**
 * lib/agent/sandbox/budget.ts — the runner's own spend cap (GG 2026-10-31 16:17Z: „ლიმიტი 20$“).
 *
 * Vercel's Spend Management is the outer cap; this is the inner one, so a mistake on either side still stops at $20.
 * Every job RESERVES its worst case (all of its CPU and memory for its whole wall clock, plus the creation fee) before
 * a sandbox is created, and is SETTLED to what it really used afterwards. A reservation that would cross the cap is
 * refused: the cap fails closed, never open.
 *
 * Prices are Vercel Sandbox's published list prices (USD), kept here so a change is a reviewed diff. Rounded UP.
 */
import type { SandboxLimits } from './policy';

export const SANDBOX_CAP_USD = 20;

export const SANDBOX_PRICE = {
  /** Per vCPU-hour of active CPU. */
  cpuHour: 0.128,
  /** Per GB-hour of provisioned memory. */
  memGbHour: 0.0212,
  /** Per sandbox created. */
  creation: 0.000_001,
} as const;

/** Vercel gives every vCPU 2048 MB whatever is asked, so memory is billed at no less than that. */
export const SANDBOX_MB_PER_VCPU = 2048;

/** Worst case for a job: every vCPU busy and all memory held for the whole wall clock. */
export function worstCaseUsd(limits: Pick<SandboxLimits, 'cpus' | 'memoryMb' | 'wallSec'>): number {
  const hours = limits.wallSec / 3600;
  const memGb = Math.max(limits.memoryMb, limits.cpus * SANDBOX_MB_PER_VCPU) / 1024;
  return round(hours * (limits.cpus * SANDBOX_PRICE.cpuHour + memGb * SANDBOX_PRICE.memGbHour) + SANDBOX_PRICE.creation);
}

/** What a finished job cost, from the time it actually ran. */
export function usedUsd(limits: Pick<SandboxLimits, 'cpus' | 'memoryMb'>, wallMs: number): number {
  return worstCaseUsd({ cpus: limits.cpus, memoryMb: limits.memoryMb, wallSec: Math.max(0, wallMs) / 1000 });
}

function round(usd: number): number {
  return Math.ceil(usd * 1_000_000) / 1_000_000;
}

/** Where the running total lives. The store must make reserve atomic (check and add in one step). */
export interface SandboxSpendStore {
  /**
   * Add `usd` to the total only if the total stays at or under `cap`. Returns a ticket for the reservation, or null
   * (and adds nothing) when the cap would be passed or the store cannot answer: fail closed.
   */
  reserve(usd: number, cap: number): Promise<string | null>;
  /** Replace the reservation `ticket` (of `reserved`) with the real `used` amount. */
  settle(ticket: string, reserved: number, used: number): Promise<void>;
  total(): Promise<number>;
}

/** In-process store: tests and the fake host. Not shared between instances, so never the production store. */
export function memorySpendStore(start = 0): SandboxSpendStore {
  let spent = start;
  let seq = 0;
  return {
    async reserve(usd, cap) {
      if (spent + usd > cap + 1e-9) return null;
      spent += usd;
      return `mem-${++seq}`;
    },
    async settle(_ticket, reserved, used) {
      spent = Math.max(0, spent - reserved + used);
    },
    async total() {
      return spent;
    },
  };
}
