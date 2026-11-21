// The stage the client is playing, from the shared stage registry (approved metadata; no copied coordinates).
import { DEFAULT_STAGE_ID, getStage } from '@cn-trials/shared';

export const stageDef = getStage(DEFAULT_STAGE_ID);
export const stageGeo = stageDef.geometry;
