/** Private server-side evidence. Hashes are fingerprints, never execution/retry authority. */
export interface VeoSubmissionEvidence {
  schema: 1;
  phase: 'prepared' | 'posting';
  transport: 'vertex' | 'gemini';
  model: string;
  /** SHA-256 of normalized request JSON. URL media are locators, not immutable byte hashes. */
  requestSha256: string;
  estimatedUsd: number;
  projectId?: string;
  location?: string;
  outputPrefix?: string;
  /** SHA-256 of the exact serialized POST body, recorded immediately before fetch. */
  bodySha256?: string;
}

/** A server-created function, never accepted from request JSON. False/throw must prevent the POST. */
export type VeoSubmissionJournal = (evidence: Readonly<VeoSubmissionEvidence>) => Promise<boolean>;
