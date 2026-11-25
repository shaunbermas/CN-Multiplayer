import { describe, expect, it } from 'vitest';
import { SIM_DT } from '@cn-trials/shared';
import { Predictor } from '../src/game/predictor.ts';

const right = { mx: 1, mz: 0 };

/** Walk sideways for `frames` frames of `frameDt` and record the drawn x each frame. */
function walk(p: Predictor, frames: number, frameDt: number): number[] {
  let acc = 0;
  const xs: number[] = [];
  for (let i = 0; i < frames; i++) {
    acc += frameDt;
    while (acc >= SIM_DT) { acc -= SIM_DT; p.apply(right); }
    xs.push(p.updateRender(acc / SIM_DT, frameDt).x);
  }
  return xs;
}

describe('Predictor presentation smoothing', () => {
  it('draws evenly spaced positions at 60 fps once at walking speed (no stair steps)', () => {
    const p = new Predictor({ x: 0, z: 0, vx: 4, vz: 0 }, []);
    const xs = walk(p, 120, 1 / 60);
    const deltas = xs.slice(61).map((x, i) => x - xs[60 + i]);
    const min = Math.min(...deltas), max = Math.max(...deltas);
    // At 4 m/s and 60 fps each frame moves about 6.7 cm. Before the fix, every other frame moved 0 cm.
    expect(min).toBeGreaterThan(0.05);
    expect(max - min).toBeLessThan(0.01);
  });

  it('blends a small server correction out over a few frames instead of snapping', () => {
    const p = new Predictor({ x: 0, z: 0, vx: 0, vz: 0 }, []);
    p.updateRender(0, 1 / 60);
    p.reconcile({ x: 0.3, z: 0, vx: 0, vz: 0, ack: 0 });
    const first = p.updateRender(1, 1 / 60).x;
    expect(first).toBeLessThan(0.1); // still near where it was drawn
    for (let i = 0; i < 30; i++) p.updateRender(1, 1 / 60);
    expect(p.render.x).toBeCloseTo(0.3, 3); // and settled on the server position after half a second
    expect(p.state.x).toBeCloseTo(0.3, 6); // the simulated state took the correction at once
  });

  it('snaps large corrections (respawn, knock-back)', () => {
    const p = new Predictor({ x: 0, z: 0, vx: 0, vz: 0 }, []);
    p.reconcile({ x: 5, z: 0, vx: 0, vz: 0, ack: 0 });
    expect(p.updateRender(1, 1 / 60).x).toBeCloseTo(5, 6);
  });
});
