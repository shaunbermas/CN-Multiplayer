import type { TrialRoom } from './room.ts';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ROOMS: DurableObjectNamespace<TrialRoom>;
  /** "1" only in local tests (wrangler dev --var CN_TEST:1): enables /metrics/reset. */
  CN_TEST?: string;
}
