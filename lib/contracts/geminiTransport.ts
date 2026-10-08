/**
 * lib/contracts/geminiTransport.ts — the Google transport contract (PROJECT_MASTER.md Part 1 §8, Section 0 "Vertex
 * phases", R7/R8 and D8).
 *
 * One transport per call, chosen explicitly: `vertex` (Workload Identity → Vertex AI, billed to the project's credit) or
 * `gemini_api` (an API key → the Gemini Developer API, billed to the AI Studio balance). There is NO silent switch from
 * one to the other: a transport that is asked for and not configured throws NotConfiguredError naming the missing
 * variables (names only, never values).
 *
 * The master leaves the method inputs untyped (`input`, `Output`, `Chunk`, `LiveSession`); they are type parameters
 * here, so Part 2 can bind them to the request/response shapes it migrates without editing this contract.
 * lib/veo already implements the Veo slice of this (veoTransport(), vertexAuth.ts); Part 2 generalises it.
 */

export type GeminiTransportKind = 'vertex' | 'gemini_api';

export interface GeminiTransport<In = unknown, Out = unknown, Chunk = unknown, LiveSession = unknown> {
  readonly kind: GeminiTransportKind;
  generateContent(input: In): Promise<Out>;
  streamGenerateContent(input: In): AsyncIterable<Chunk>;
  synthesizeSpeech?(input: In): Promise<Out>;
  generateImage?(input: In): Promise<Out>;
  openLiveSession?(input: In): Promise<LiveSession>;
  /** Names of the variables a call would need and does not have. Never values. */
  checkConfiguration(): { ok: boolean; missing: string[] };
}

export interface GeminiTransportSelector<T extends GeminiTransport = GeminiTransport> {
  /** The transport the environment selects (GEMINI_TRANSPORT). Throws NotConfiguredError, never falls back. */
  select(): T;
  /** That exact transport, or NotConfiguredError. */
  selectFixed(kind: GeminiTransportKind): T;
}

export class NotConfiguredError extends Error {
  readonly code = 'not_configured' as const;
  readonly missingVars: string[];
  readonly transportKind: GeminiTransportKind;

  constructor(transportKind: GeminiTransportKind, missingVars: string[]) {
    super(`${transportKind} transport is not configured: missing ${missingVars.join(', ') || 'configuration'}`);
    this.name = 'NotConfiguredError';
    this.transportKind = transportKind;
    this.missingVars = [...missingVars];
  }
}

export const isNotConfiguredError = (e: unknown): e is NotConfiguredError =>
  e instanceof NotConfiguredError || (typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'not_configured');

/** §8. Workload Identity is the method in use (PROJECT_MASTER Part 0); a service-account key is forbidden by the owner. */
export type VertexTransportConfig = {
  projectId: string;
  projectNumber: string;
  location: string;
  serviceAccountEmail: string;
  workloadIdentityPoolId: string;
  workloadIdentityPoolProviderId: string;
  /** In the master's contract for completeness. Never set: the owner forbids SA JSON keys (2026-10-08). */
  serviceAccountKey?: string;
};

/** The env names behind VertexTransportConfig — what checkConfiguration() reports when they are absent. */
export const VERTEX_TRANSPORT_ENV: Readonly<Record<Exclude<keyof VertexTransportConfig, 'serviceAccountKey'>, string>> = {
  projectId: 'GCP_PROJECT_ID',
  projectNumber: 'GCP_PROJECT_NUMBER',
  location: 'GCP_VEO_LOCATION',
  serviceAccountEmail: 'GCP_SERVICE_ACCOUNT_EMAIL',
  workloadIdentityPoolId: 'GCP_WORKLOAD_IDENTITY_POOL_ID',
  workloadIdentityPoolProviderId: 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
};
