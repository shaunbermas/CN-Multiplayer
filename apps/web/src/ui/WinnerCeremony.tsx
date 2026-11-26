// Winner ceremony (decision 049, owner 26 Nov 2026): only after a match that played all three stages. The game
// "broadcasts" the winner first (a short reveal over confetti and a fanfare), then shows the podium (2nd, 1st, 3rd
// like a ranking game) and, below it, everyone else's stats. Same frosted panels, Barlow Condensed type and brass
// "winners" colour as the rest of the interface; the reveal and confetti respect prefers-reduced-motion.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { colorwayById, type Standing } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';
import { playFanfare } from '../game/audio.ts';

const REVEAL_MS = 4200;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Test hook: ?ceremonyNow=1 skips the reveal (screenshots of the podium). */
const skipReveal = () => new URLSearchParams(location.search).get('ceremonyNow') === '1';

/** Paper confetti on a 2D canvas: a burst from both lower corners and the top, then a gentle fall. */
function Confetti({ bursts }: { bursts: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || reducedMotion()) return;
    const g = c.getContext('2d');
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
    fit();
    addEventListener('resize', fit);
    const colors = ['#c9a35b', '#e9c46a', '#f4e3b5', '#e9e2d4', '#39d98a', '#4f7df2', '#e86be0', '#f28c28', '#2fbf8f'];
    type Bit = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; t: number };
    const bits: Bit[] = [];
    const W = () => c.width, H = () => c.height;
    const spawn = (x: number, y: number, n: number, dir: number, spread: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = dir + (Math.random() - 0.5) * spread;
        const s = speed * (0.55 + Math.random() * 0.6) * dpr;
        bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.3,
          w: (6 + Math.random() * 6) * dpr, h: (3 + Math.random() * 5) * dpr, c: colors[(Math.random() * colors.length) | 0], t: 0 });
      }
    };
    const burst = () => {
      spawn(0, H() * 0.95, 80, -Math.PI / 3, 0.7, 22);
      spawn(W(), H() * 0.95, 80, -Math.PI * 2 / 3, 0.7, 22);
      for (let i = 0; i < 70; i++) spawn(Math.random() * W(), -20, 1, Math.PI / 2, 0.4, 3);
    };
    let fired = 0;
    const timers = Array.from({ length: bursts }, (_, i) => setTimeout(() => { burst(); fired++; }, i * 1600));
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * 60; last = now;
      g.clearRect(0, 0, W(), H());
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.t += dt; b.vy += 0.32 * dpr * dt; b.vx *= 0.985 ** dt; b.vy *= 0.985 ** dt;
        b.vx += Math.sin((b.t + i) * 0.08) * 0.05 * dpr;
        b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
        if (b.y > H() + 30) { bits.splice(i, 1); continue; }
        g.save(); g.translate(b.x, b.y); g.rotate(b.r);
        g.scale(1, Math.cos(b.t * 0.15 + i)); // the paper flips as it falls
        g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        g.restore();
      }
      if (bits.length || fired < bursts) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); removeEventListener('resize', fit); };
  }, [bursts]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" data-testid="confetti" />;
}

function Crest({ room, id, size }: { room: TrialRoom; id: string; size: number }) {
  const c = colorwayById(room.players.get(id)?.colorway);
  return <span className="cer-crest" style={{ width: size, height: size, background: `#${c?.coatSecondary ?? '445'}`, borderColor: `#${c?.identifierAccent ?? 'ccc'}` }} aria-hidden="true" />;
}

const MEDAL = ['gold', 'silver', 'bronze'] as const;

export function WinnerCeremony({ room, standings, table, footer }: { room: TrialRoom; standings: Standing[]; table: ReactNode; footer: ReactNode }) {
  const [revealed, setRevealed] = useState(() => skipReveal() || reducedMotion());
  useEffect(() => {
    playFanfare();
    if (revealed) return;
    const t = setTimeout(() => setRevealed(true), REVEAL_MS);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const top = standings.slice(0, 3);
  const w = top[0];
  const me = standings.find((x) => x.id === room.id);
  const myLine = !me ? null
    : me.rank <= 3 ? `You placed ${ordinal(me.rank)}!${me.rank === 1 ? ' You are the CN Trial champion.' : ' A podium finish.'}`
    : `You finished ${ordinal(me.rank)} of ${standings.length} with ${me.points} ${me.points === 1 ? 'point' : 'points'}.`;
  // Podium order like a ranking game: 2nd on the left, 1st in the middle (tallest), 3rd on the right.
  const order = [1, 0, 2].filter((i) => top[i]);
  return (
    <div className="ceremony" data-testid="ceremony" data-step={revealed ? 'podium' : 'reveal'}>
      <Confetti bursts={2} />
      {!revealed && w && (
        <div className="cer-reveal" data-testid="ceremony-reveal" onClick={() => setRevealed(true)}>
          <span className="eyebrow">CN Trial · all 3 stages complete</span>
          <p className="cer-and">And the winner is</p>
          <h1 className="cer-name">{w.name}</h1>
          <span className="cer-pts num">{w.points} points</span>
        </div>
      )}
      {revealed && (
        <section className="card results final cer-card" data-testid="results" aria-label="Final results">
          <div data-testid="final" className="cer-head">
            <span className="eyebrow">Final results · 3 stages</span>
            <h2>We have a winner!</h2>
            {myLine && <p className={`cer-me${me && me.rank <= 3 ? ' podium' : ''}`} data-testid="ceremony-me">{myLine}</p>}
          </div>
          <div className="cer-podium" data-testid="podium">
            {order.map((i) => {
              const x = top[i];
              return (
                <div key={x.id} className={`cer-step p${i + 1}${x.id === room.id ? ' me' : ''}`} data-testid={`podium-${i + 1}`}
                  style={{ '--delay': `${[0.5, 0.15, 0.8][i]}s` } as CSSProperties}>
                  <div className="cer-who">
                    {i === 0 && <span className="cer-crown" aria-hidden="true">♛</span>}
                    <span className={`cer-medal ${MEDAL[i]}`}>{x.rank}</span>
                    <Crest room={room} id={x.id} size={i === 0 ? 56 : 44} />
                    <b className="cer-pname">{x.name}{x.id === room.id && <em> (you)</em>}</b>
                    <span className="cer-score num">{x.points}<small> pts</small></span>
                    <span className="cer-stats">{x.wins} {x.wins === 1 ? 'stage win' : 'stage wins'} · finished {x.finishes} of 3</span>
                  </div>
                  <div className="cer-pillar"><span>{ordinal(x.rank)}</span><small>place</small></div>
                </div>
              );
            })}
          </div>
          {standings.length > 3 && (
            <div className="cer-rest" data-testid="ceremony-rest">
              <span className="eyebrow">Everyone else</span>
              {table}
            </div>
          )}
          {footer}
        </section>
      )}
    </div>
  );
}
