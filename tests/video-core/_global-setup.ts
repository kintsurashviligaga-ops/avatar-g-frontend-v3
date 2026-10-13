import { mkdirSync, rmSync } from 'node:fs';
import { EVIDENCE_DIR, FINDINGS_FILE } from './_shared';

/** One run, one findings file: the specs append to it; a stale one from the last run is dropped first. */
export default function globalSetup(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  rmSync(FINDINGS_FILE, { force: true });
}
