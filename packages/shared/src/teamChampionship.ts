// Team championship (owner's decision, 25 Nov 2026, from the Stage 02 handoff pack 07_TWO_STAGE_SCORING_AND_PROGRESSION):
// the overall winner of a match with teams is a TEAM. Every stage gives the three teams 3 / 2 / 1 championship points.
//   Stage 01 Red Light and Stage 03 The Hunt: teams ranked by the AVERAGE of their members' unchanged individual points
//     for that stage. The denominator is the team's roster for that stage (everyone the stage started with, including
//     anyone who later disconnected): a missing or zero score counts as zero.
//   Stage 02 Agawan Base: teams ranked by their gameplay score (the engine's team placement, which already settles
//     sudden death and its tie-breaks).
// Ties share the placement and skip the next one (two teams tied first: 3, 3, 1).
// Overall: most championship points; then the higher Agawan Base score; then the higher Stage 01 team average; then
// joint champions (no hidden metrics). The individual board stays as the secondary leaderboard.
// Pure and server-owned; the Match records each stage once.
import { AGAWAN } from './agawan/config.ts';
import type { StageScore } from './match.ts';
import type { Placing } from './round.ts';
import { AGAWAN_STAGE_ID, DEFAULT_STAGE_ID } from './stages.ts';
import { TEAM_SLOTS, type TeamSlot } from './teams.ts';

export interface TeamStageResult {
  stage: string;
  /** How teams were ranked in this stage. */
  by: 'average' | 'score';
  /** Team average individual points (2 decimals) or team gameplay score. */
  value: Record<TeamSlot, number>;
  place: Record<TeamSlot, number>;
  points: Record<TeamSlot, number>;
  /** Roster size the average divided by (or players in the team for Agawan). */
  roster: Record<TeamSlot, number>;
}

export interface TeamStanding {
  slot: TeamSlot;
  /** 1-based rank; joint champions share rank 1. */
  rank: number;
  points: number;
  /** Championship points per stage in match order (null = stage not played yet). */
  perStage: (number | null)[];
  /** Tie-break values. */
  agawanScore: number;
  redLightAverage: number;
}

/** 1-based placements for values where higher is better; ties share the place and skip the next. */
export function placeTeams(value: Record<TeamSlot, number>): Record<TeamSlot, number> {
  const out = {} as Record<TeamSlot, number>;
  for (const s of TEAM_SLOTS) out[s] = 1 + TEAM_SLOTS.filter((o) => value[o] > value[s]).length;
  return out;
}

export const championshipPoints = (place: number): number => AGAWAN.placementPoints[place - 1] ?? 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

export class TeamChampionship {
  readonly order: string[];
  readonly stages: (TeamStageResult | null)[];

  constructor(order: string[]) { this.order = order; this.stages = order.map(() => null); }

  /**
   * One stage's team result from its scores. `roster` is player id -> team for everyone the stage started with.
   * Recording the same stage index again replaces nothing (the Match guards duplicates by roundId).
   */
  record(stageIndex: number, stageId: string, scores: StageScore[], placings: Placing[], roster: Record<string, TeamSlot>): TeamStageResult {
    const size = { A: 0, B: 0, C: 0 } as Record<TeamSlot, number>;
    for (const t of Object.values(roster)) if (size[t] !== undefined) size[t]++;
    let res: TeamStageResult;
    const agawan = placings.find((p) => p.teamPlace);
    if (stageId === AGAWAN_STAGE_ID && agawan) {
      const value = { A: 0, B: 0, C: 0 } as Record<TeamSlot, number>;
      const place = { A: 3, B: 3, C: 3 } as Record<TeamSlot, number>;
      const seen = new Set<TeamSlot>();
      for (const p of placings) {
        if (!p.team || seen.has(p.team)) continue;
        seen.add(p.team);
        value[p.team] = p.teamScore ?? 0;
        place[p.team] = p.teamPlace ?? 3;
      }
      // A team with no player in the results (cannot happen with 3+ players) ranks by score among the rest.
      for (const s of TEAM_SLOTS) if (!seen.has(s)) place[s] = placeTeams(value)[s];
      res = { stage: stageId, by: 'score', value, place, points: mapTeams((s) => championshipPoints(place[s])), roster: size };
    } else {
      const pts = new Map(scores.map((x) => [x.id, x.points]));
      const sum = { A: 0, B: 0, C: 0 } as Record<TeamSlot, number>;
      for (const [id, t] of Object.entries(roster)) sum[t] += pts.get(id) ?? 0;
      const value = mapTeams((s) => (size[s] ? r2(sum[s] / size[s]) : 0));
      const place = placeTeams(value);
      res = { stage: stageId, by: 'average', value, place, points: mapTeams((s) => championshipPoints(place[s])), roster: size };
    }
    if (stageIndex >= 0 && stageIndex < this.stages.length) this.stages[stageIndex] = res;
    return res;
  }

  standings(): TeamStanding[] {
    const rows = TEAM_SLOTS.map((slot) => {
      const perStage = this.stages.map((s) => (s ? s.points[slot] : null));
      return {
        slot, rank: 0, perStage,
        points: perStage.reduce<number>((n, x) => n + (x ?? 0), 0),
        agawanScore: this.stages.reduce((n, s) => n + (s && s.by === 'score' ? s.value[slot] : 0), 0),
        redLightAverage: this.stages.find((s) => s?.stage === DEFAULT_STAGE_ID)?.value[slot] ?? 0,
      };
    });
    const cmp = (a: TeamStanding, b: TeamStanding) => b.points - a.points || b.agawanScore - a.agawanScore || b.redLightAverage - a.redLightAverage;
    rows.sort((a, b) => cmp(a, b) || TEAM_SLOTS.indexOf(a.slot) - TEAM_SLOTS.indexOf(b.slot));
    rows.forEach((r, i) => { r.rank = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].rank : i + 1; });
    return rows;
  }

  /** Which rule separated the top two teams (for the champion card); null when points differ or they are joint. */
  static tieBreak(a: TeamStanding, b: TeamStanding | undefined): string | null {
    if (!b || a.points !== b.points) return null;
    if (a.agawanScore !== b.agawanScore) return 'a higher Agawan Base score';
    if (a.redLightAverage !== b.redLightAverage) return 'a higher Stage 01 team average';
    return null;
  }
}

function mapTeams(f: (s: TeamSlot) => number): Record<TeamSlot, number> {
  return { A: f('A'), B: f('B'), C: f('C') };
}
