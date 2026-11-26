// Stage registry shared by the server (rules, geometry) and the client (scene module, HUD text).
// Each stage is defined once: its approved metadata (Blender export), its rule set and its player-facing
// text. A new stage = one entry here, its place in OFFICIAL_ORDER, plus a client scene module (apps/web/src/stages/).
// Stage order (decision 045, owner 25 Nov 2026): 01 Red Light, Green Light, 02 Agawan Base, 03 The Hunt.
import stage01Metadata from '../../../blender/exports/STAGE_01_METADATA.json';
import watcherManifest from '../../../blender/exports/THE_WATCHER_ASSET_MANIFEST.json';
import { geometryFromMetadata, parseStageMetadata, type StageMetadata } from './stage-metadata.ts';
import type { StageGeometry } from './stage.ts';
import { buildHuntLayout, huntGeometry, type HuntLayout } from './hunt/layout.ts';
import { buildNavGrid, type NavGrid } from './hunt/nav.ts';
import { HUNT } from './hunt/config.ts';
import { AGAWAN_ENABLED } from './constants.ts';
import { AGAWAN } from './agawan/config.ts';
import { agawanGeometry, buildAgawanLayout, type AgawanLayout } from './agawan/layout.ts';

export type StageRuleSet = 'red_light_green_light' | 'hide_and_hunt' | 'agawan_base';

export interface StageDefinition {
  id: string;
  number: number;
  name: string;
  rules: StageRuleSet;
  /** Player-facing briefing (spec S1). */
  briefing: { rule: string; detail: string };
  /** The stage's enemy / figure, for HUD text. */
  figure: string;
  /** Stage 01: approved Blender metadata. The Hunt is a code greybox (no Blender export). */
  metadata: StageMetadata | null;
  geometry: StageGeometry;
  /** The Hunt only: the greybox layout and the bots' navigation grid (immutable, shared by every room). */
  hunt?: { layout: HuntLayout; nav: NavGrid };
  /** Agawan Base only: the street greybox and the bots' navigation grid (immutable, shared by every room). */
  agawan?: { layout: AgawanLayout; nav: NavGrid };
}

function stage01(): StageDefinition {
  const metadata = parseStageMetadata(stage01Metadata);
  return {
    id: metadata.stageId,
    number: stageNumber(metadata.stageId),
    name: metadata.stageName,
    rules: 'red_light_green_light',
    briefing: { rule: 'Move on GO. Freeze when The Watcher turns.', detail: 'Reach the finish line before time runs out. Moving while it watches gets you spotted.' },
    figure: 'The Watcher',
    metadata,
    geometry: geometryFromMetadata(metadata, { watcherHeight: Number(watcherManifest.height_m) }),
  };
}

function theHunt(): StageDefinition {
  const layout = buildHuntLayout();
  return {
    id: HUNT.id,
    number: stageNumber(HUNT.id),
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

function agawanBase(): StageDefinition {
  const layout = buildAgawanLayout();
  return {
    id: AGAWAN.id,
    number: stageNumber(AGAWAN.id),
    name: 'Agawan Base',
    rules: 'agawan_base',
    briefing: {
      rule: 'Three teams. Tag rivals, rescue your teammates, raid the other bases.',
      detail: 'Hold E near a rival to tag them into your pen. Hold E beside a captured teammate to free them. Hold E at an enemy base marker to raid it for 5 points.',
    },
    figure: 'The other teams',
    metadata: null,
    geometry: agawanGeometry(layout),
    agawan: { layout, nav: buildNavGrid(layout.walls, layout.bounds) },
  };
}

/** Stage 01's registry id (from its approved Blender metadata). */
export const DEFAULT_STAGE_ID = 'STAGE_01_RED_LIGHT';
/** Stage 02 · AGAWAN BASE: registered once it is built and switched on (AGAWAN_ENABLED). */
export const AGAWAN_STAGE_ID = 'STAGE_02_AGAWAN_BASE';
/**
 * The official stage order (decision 045, owner 25 Nov 2026). A stage's player-facing number is its place here, so
 * numbers never drift from the order: 01 Red Light, Green Light, 02 Agawan Base, 03 The Hunt.
 */
export const OFFICIAL_ORDER: string[] = [DEFAULT_STAGE_ID, AGAWAN_STAGE_ID, HUNT.id];
/** Player-facing stage number (1-based) of a stage id. */
export function stageNumber(id: string): number { return OFFICIAL_ORDER.indexOf(resolveStageId(id)) + 1; }

/**
 * Ids used before decision 045 (The Hunt was Stage 02). A browser's saved menu pick or a request from an older page
 * may still send them; they resolve to the stage's current id.
 */
export const LEGACY_STAGE_IDS: Record<string, string> = { STAGE_02_THE_HUNT: HUNT.id };
export function resolveStageId(id: string): string { return LEGACY_STAGE_IDS[id] ?? id; }

export const STAGES: Record<string, StageDefinition> = Object.fromEntries([stage01(), agawanBase(), theHunt()].map((s) => [s.id, s]));
/** The match plays every registered (and switched-on) stage in the official order. */
export const MATCH_ORDER: string[] = OFFICIAL_ORDER.filter((id) => id in STAGES && (id !== AGAWAN_STAGE_ID || AGAWAN_ENABLED));
/** Every built stage in the official order, switched on or not (test rooms may play Agawan Base before it is switched on). */
export const REGISTERED_ORDER: string[] = OFFICIAL_ORDER.filter((id) => id in STAGES);
/** Stages a host may start a match from (main menu picker). */
export const STARTABLE_STAGES: string[] = MATCH_ORDER;
/** Kept for the older tournament manager (tournament.ts). */
export const TOURNAMENT_ORDER: string[] = MATCH_ORDER;

export function getStage(id: string = DEFAULT_STAGE_ID): StageDefinition {
  const s = STAGES[resolveStageId(id)];
  if (!s) throw new Error(`Unknown stage ${id}`);
  return s;
}
