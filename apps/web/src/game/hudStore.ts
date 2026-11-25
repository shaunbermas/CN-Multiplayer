// Values the HUD shows. Written from the render loop, read by React a few times a second
// (avoids React state updates inside useFrame; GDD §7.2).
export const hud = {
  connected: false,
  players: 0,
  name: '',
  progress: 0,
  distance: 0,
  walkTime: 0,
  finishTime: -1,
  status: 'active',
  pingMs: 0,
  /** Name of the player being followed while spectating (Stage 1.5 spectator UI). */
  spectating: '',
  /** Seconds of collision knock-down left for the local player (0 = standing). */
  down: 0,
};
