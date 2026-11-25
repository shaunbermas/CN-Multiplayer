// The stage the client is playing, from the shared stage registry (approved metadata; no copied coordinates).
// Intelligence doc 09, A2: the client follows the stage the server announces (round.stage) instead of fixing it
// at module load, so a match that moves to another stage draws, predicts and labels that stage. With only
// Stage 01 registered, every lookup resolves to Stage 01 (unknown ids fall back to the default).
import { DEFAULT_STAGE_ID, STAGES, getStage, resolveObstacles, type ResolvedObstacles, type StageDefinition, type StageGeometry } from '@cn-trials/shared';

export interface ClientStage { def: StageDefinition; geo: StageGeometry; obstacles: ResolvedObstacles | null }

const cache = new Map<string, ClientStage>();

/** Stage data for a registry id (cached; immutable). Unknown or empty ids fall back to the default stage. */
export function stageFor(id: string | undefined): ClientStage {
  const key = id && STAGES[id] ? id : DEFAULT_STAGE_ID;
  let s = cache.get(key);
  if (!s) {
    const def = getStage(key);
    s = { def, geo: def.geometry, obstacles: def.rules === 'red_light_green_light' && def.geometry.bounds ? resolveObstacles(def.geometry) : null };
    cache.set(key, s);
  }
  return s;
}

/** The stage the room is on right now (server's round.stage, else the stage from the welcome message). */
export function activeStage(room: { round: { stage: string }; stage: string }): ClientStage {
  return stageFor(room.round.stage || room.stage);
}

// Default-stage aliases for code that runs before any room exists (preload, asset hooks).
const initial = stageFor(DEFAULT_STAGE_ID);
export const stageDef = initial.def;
export const stageGeo = initial.geo;
export const stageObstacles: ResolvedObstacles | null = initial.obstacles;
