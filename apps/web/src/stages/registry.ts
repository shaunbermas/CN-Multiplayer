// Client side of the stage registry: stage id (packages/shared/src/stages.ts) -> scene module.
// The generic game scene (players, camera, input) stays the same for every stage; each stage brings its
// own environment, figure and presentation. Stage 02+ adds one entry here.
import type { ComponentType } from 'react';
import type { TrialRoom } from '../net.ts';
import { Stage01Scene, preloadStage01, stage01Assets } from './stage01/Stage01Scene.tsx';
import { Stage02Scene, preloadStage02, stage02Assets } from './stage02/Stage02Scene.tsx';

export interface StageSceneModule {
  Scene: ComponentType<{ room: TrialRoom }>;
  preload: () => void;
  /** Load status and asset problems for tests and the error screen. */
  assets: { problems: string[] } & Record<string, unknown>;
}

export const STAGE_SCENES: Record<string, StageSceneModule> = {
  STAGE_01_RED_LIGHT: { Scene: Stage01Scene, preload: preloadStage01, assets: stage01Assets },
  STAGE_02_THE_HUNT: { Scene: Stage02Scene, preload: preloadStage02, assets: stage02Assets },
};
