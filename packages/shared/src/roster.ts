// Stage 1.5: the contestant roster. The owner's final 30 characters are locked, but the six supplied boards
// show six different rosters and the project had no canonical list (docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md).
// Until the owner names the canonical roster this list stays EMPTY: no character is invented, merged or
// guessed. The character-selection screen reads this module and shows the pending state.
export interface ContestantEntry {
  /** Stable id, e.g. "CHR_01". */
  id: string;
  /** Slot number 1..30. */
  slot: number;
  name: string;
  /** Path of the approved selection thumbnail rendered from the final 3D model. */
  thumbnail?: string;
}

export const ROSTER_SIZE = 30;
export const ROSTER_STATUS: 'pending-owner-decision' | 'approved' = 'pending-owner-decision';
export const CONTESTANT_ROSTER: ContestantEntry[] = [];
