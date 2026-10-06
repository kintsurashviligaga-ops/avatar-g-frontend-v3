import { hasGeminiImagenProvider } from '@/lib/ai/geminiImagen';
/**
 * Which catalogue models THIS deployment can run right now — the server half of the model picker (lib/providers/catalogue).
 *
 * Every answer is derived from the same gate the runner itself applies, never restated:
 *   studio → registry.isModelEnabled (HF_ENABLED_MODELS) · studioV2Enabled (STUDIO_V2) · hfAuthHeaderFromEnv (HF keys)
 *   film   → a Veo transport (lib/veo/engine), or VIDEO_GOOGLE_ONLY off (the multi-vendor fallbacks render)
 *   music  → lib/ai/musicEnginesStatus (keys + each engine's circuit breaker)
 *   image  → always: the route's own cascade refunds a miss
 *
 * Ids, booleans and a reason word only — never a key, an env value, an endpoint or a price.
 */
import 'server-only';
import { musicEnginesStatus } from '@/lib/ai/musicEnginesStatus';
import {
  CATALOGUE,
  availabilityOf,
  type Availability,
  type CatalogueService,
  type DeploymentProbe,
} from '@/lib/providers/catalogue';
import type { MusicEnginesStatus } from '@/lib/studio/musicEngines';
import { veoTransport } from '@/lib/veo/engine';

export interface CatalogueStatusRow extends Availability {
  id: string;
}

export interface CatalogueStatusDeps {
  image?: () => boolean;
  film?: () => boolean;
  music?: () => Promise<MusicEnginesStatus | null>;
}

const filmReady = (): boolean => veoTransport() !== null;

export async function catalogueStatus(
  service: CatalogueService | undefined,
  env: NodeJS.ProcessEnv = process.env,
  deps: CatalogueStatusDeps = {},
): Promise<CatalogueStatusRow[]> {
  const rows = CATALOGUE.filter((e) => !service || e.service === service);
  // The breakers are a Redis read per engine: only when a music row is actually asked about.
  const wantsMusic = rows.some((e) => e.wire.runner === 'music');
  const music = wantsMusic ? await (deps.music ?? (() => musicEnginesStatus(env)))().catch(() => null) : null;
  const probe: DeploymentProbe = {
    image: rows.some((e) => e.wire.runner === 'image') ? (deps.image ?? hasGeminiImagenProvider)() : false,
    higgsfield: false,
    studioV2: false,
    hfEnabled: () => false,
    film: rows.some((e) => e.wire.runner === 'film') ? (deps.film ?? filmReady)() : false,
    music: music ? music.engines : null,
  };
  return rows.map((e) => ({ id: e.id, ...availabilityOf(e, probe) }));
}
