// The stage the client is playing, from the shared stage registry (approved metadata; no copied coordinates).
import { DEFAULT_STAGE_ID, getStage, resolveObstacles, type ResolvedObstacles } from '@cn-trials/shared';

export const stageDef = getStage(DEFAULT_STAGE_ID);
export const stageGeo = stageDef.geometry;
/** Stage 1.5 obstacle twist resolved against this stage's course (shown and collided only when a round enables it). */
export const stageObstacles: ResolvedObstacles | null = stageGeo.bounds ? resolveObstacles(stageGeo) : null;
