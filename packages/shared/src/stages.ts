// Stage registry shared by the server (rules, geometry) and the client (scene module, HUD text).
// Each stage is defined once: its approved metadata (Blender export), its rule set and its player-facing
// text. Adding Stage 02 means adding one entry here plus a client scene module (apps/web/src/stages/).
import stage01Metadata from '../../../blender/exports/STAGE_01_METADATA.json';
import watcherManifest from '../../../blender/exports/THE_WATCHER_ASSET_MANIFEST.json';
import { geometryFromMetadata, parseStageMetadata, type StageMetadata } from './stage-metadata.ts';
import type { StageGeometry } from './stage.ts';
import { buildHuntLayout, huntGeometry, type HuntLayout } from './stage02/layout.ts';
import { buildNavGrid, type NavGrid } from './stage02/nav.ts';
import { STAGE02 } from './stage02/config.ts';

export type StageRuleSet = 'red_light_green_light' | 'hide_and_hunt';

export interface StageDefinition {
  id: string;
  number: number;
  name: string;
  rules: StageRuleSet;
  /** Player-facing briefing (spec S1). */
  briefing: { rule: string; detail: string };
  /** The stage's enemy / figure, for HUD text. */
  figure: string;
  /** Stage 01: approved Blender metadata. Stage 02 is a code greybox (no Blender export yet). */
  metadata: StageMetadata | null;
  geometry: StageGeometry;
  /** Stage 02 only: the greybox layout and the bots' navigation grid (immutable, shared by every room). */
  hunt?: { layout: HuntLayout; nav: NavGrid };
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

function stage02(): StageDefinition {
  const layout = buildHuntLayout();
  return {
    id: STAGE02.id,
    number: 2,
    name: 'The Hunt',
    rules: 'hide_and_hunt',
    briefing: {
      rule: 'Hunters find the hiders. Hiders stay free until the time runs out.',
      detail: 'Hiders get a 15 s head start. Hunters scan with the Pulse Detector (Q) and hold E to capture. Hiders hide with E, sprint with Shift and crouch with C.',
    },
    figure: 'The hunters',
    metadata: null,
    geometry: huntGeometry(layout),
    hunt: { layout, nav: buildNavGrid(layout.walls, layout.bounds) },
  };
}

export const STAGES: Record<string, StageDefinition> = Object.fromEntries([stage01(), stage02()].map((s) => [s.id, s]));
export const DEFAULT_STAGE_ID = 'STAGE_01_RED_LIGHT';
/**
 * The match (decision 042, owner 25 Nov 2026): 01 Red Light, Green Light -> 02 The Hunt -> 03 The Naughty Run.
 * Until Stage 03 is built the third slot replays Stage 01 (owner's choice, 25 Nov 2026).
 */
export const MATCH_ORDER: string[] = [DEFAULT_STAGE_ID, STAGE02.id, DEFAULT_STAGE_ID];
/** Stages a host may start a match from (landing page picker). */
export const STARTABLE_STAGES: string[] = [DEFAULT_STAGE_ID, STAGE02.id];
/** Kept for the older tournament manager (tournament.ts). */
export const TOURNAMENT_ORDER: string[] = MATCH_ORDER;

export function getStage(id: string = DEFAULT_STAGE_ID): StageDefinition {
  const s = STAGES[id];
  if (!s) throw new Error(`Unknown stage ${id}`);
  return s;
}
