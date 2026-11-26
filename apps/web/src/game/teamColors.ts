// Team colours for the current room (decision 047): dealt at random per match by the server and sent in the team
// view, so nothing on the client hardcodes teal / purple / pink any more. TEAMS.colors is only the fallback.
import { useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { TEAM_SLOTS, teamColor, type TeamSlot } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';

export type TeamColors = Record<TeamSlot, string>;

export const colorOf = (room: TrialRoom, slot: TeamSlot): string => teamColor(room.teams, slot);
export const readTeamColors = (room: TrialRoom): TeamColors =>
  Object.fromEntries(TEAM_SLOTS.map((s) => [s, colorOf(room, s)])) as TeamColors;

/** Inside the 3D canvas: the room's team colours, re-rendering only when they change. */
export function useTeamColors(room: TrialRoom): TeamColors {
  const [c, setC] = useState(() => readTeamColors(room));
  useFrame(() => {
    if (TEAM_SLOTS.some((s) => colorOf(room, s) !== c[s])) setC(readTeamColors(room));
  });
  return c;
}
