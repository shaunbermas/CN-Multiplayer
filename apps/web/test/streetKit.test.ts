// The Agawan street is built once and cached across scene mounts. Owner report (26 Nov 2026): after switching from
// Stage 01 to Stage 02 the street came up empty because Kit.build() emptied itself on the first call.
import { describe, expect, it } from 'vitest';
import { buildStreet, Kit } from '../src/stages/agawan/streetKit';

describe('Agawan street kit', () => {
  it('Kit.build() returns the full merged geometry on every call', () => {
    const k = new Kit().box(0, 0, 0, 1, 1, 1, '#ffffff').box(2, 0, 0, 1, 1, 1, '#ff0000');
    const a = k.build();
    const b = k.build();
    expect(a.getAttribute('position').count).toBe(72);
    expect(b.getAttribute('position')?.count).toBe(72);
  });

  it('a cached street still has its houses and windows when the scene mounts a second time', () => {
    const s = buildStreet({ skyline: false });
    for (let mount = 1; mount <= 3; mount++) {
      expect(s.solid.build().getAttribute('position')?.count ?? 0, `solid, mount ${mount}`).toBeGreaterThan(1000);
      expect(s.glow.build().getAttribute('position')?.count ?? 0, `glow, mount ${mount}`).toBeGreaterThan(100);
    }
  });
});
