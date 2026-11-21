// Stage registry shared by the server (rules, geometry) and the client (scene module, HUD text).
// Each stage is defined once: its approved metadata (Blender export), its rule set and its player-facing
// text. Adding Stage 02 means adding one entry here plus a client scene module (apps/web/src/stages/).
import stage01Metadata from '../../../blender/exports/STAGE_01_METADATA.json';
import watcherManifest from '../../../blender/exports/THE_WATCHER_ASSET_MANIFEST.json';
import { geometryFromMetadata, parseStageMetadata, type StageMetadata } from './stage-metadata.ts';
import type { StageGeometry } from './stage.ts';

export type StageRuleSet = 'red_light_green_light';

export interface StageDefinition {
  id: string;
  number: number;
  name: string;
  rules: StageRuleSet;
  /** Player-facing briefing (spec S1). */
  briefing: { rule: string; detail: string };
  /** The stage's enemy / figure, for HUD text. */
  figure: string;
  metadata: StageMetadata;
  geometry: StageGeometry;
}

function stage01(): StageDefinition {
  const metadata = parseStageMetadata(stage01Metadata);
  return {
    id: metadata.stageId,
    number: 1,
    name: metadata.stageName,
    rules: 'red_light_green_light',
    briefing: { rule: 'Move on GO. Freeze when The Watcher turns.', detail: 'Reach the finish line before time runs out. Moving while it watches gets you spotted.' },
    figure: 'The Watcher',
    metadata,
    geometry: geometryFromMetadata(metadata, { watcherHeight: Number(watcherManifest.height_m) }),
  };
}

export const STAGES: Record<string, StageDefinition> = Object.fromEntries([stage01()].map((s) => [s.id, s]));
export const DEFAULT_STAGE_ID = 'STAGE_01_RED_LIGHT';
/** Stage order for a full tournament (GDD §3); only Stage 01 exists so far. */
export const TOURNAMENT_ORDER: string[] = [DEFAULT_STAGE_ID];

export function getStage(id: string = DEFAULT_STAGE_ID): StageDefinition {
  const s = STAGES[id];
  if (!s) throw new Error(`Unknown stage ${id}`);
  return s;
}
