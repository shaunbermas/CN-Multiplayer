// Stage 01 fog (owner feedback, 22 Nov 2026; decision 031): a misty night yard where the far end and the
// obstacles only appear as you approach, and The Watcher is a dim silhouette. Its red eye, searchlight and
// the floodlight beams are drawn without fog, so they pierce the mist. The same on every quality tier.
//
// Exponential-squared fog: share of the fog colour at distance d = 1 - exp(-(density * d)^2).
// At density 0.0085: 20 m 3 %, 40 m 11 %, 60 m 23 %, 100 m 51 %, 150 m 80 %, The Watcher (about 185 m) 92 %.
import * as THREE from 'three';

export const FOG = {
  density: 0.0085,
  /** Misty blue-grey, lit by the floodlights: reads as fog, not as darkness. */
  color: new THREE.Color(0.115, 0.15, 0.168),
  /** How far the painted backdrop and the low sky fade into the fog colour (they are not fogged by depth). */
  backdropMix: 0.6,
  horizonMix: 0.92,
};

/** Share of fog at a distance (for tests and docs). */
export const fogAmount = (d: number) => 1 - Math.exp(-((FOG.density * d) ** 2));
