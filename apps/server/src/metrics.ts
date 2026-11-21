// Process-wide counters for /health and the load test report.
export const metrics = {
  startedAt: Date.now(),
  rooms: 0,
  clients: 0,
  ticks: 0,
  tickMsTotal: 0,
  tickMsMax: 0,
  recentTickMs: [] as number[],
  inputsAccepted: 0,
  inputsDropped: 0,
};

export function recordTick(ms: number): void {
  metrics.ticks++;
  metrics.tickMsTotal += ms;
  if (ms > metrics.tickMsMax) metrics.tickMsMax = ms;
  metrics.recentTickMs.push(ms);
  if (metrics.recentTickMs.length > 3000) metrics.recentTickMs.shift();
}

export function snapshot() {
  const sorted = [...metrics.recentTickMs].sort((a, b) => a - b);
  const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  return {
    ok: true,
    uptimeS: Math.round((Date.now() - metrics.startedAt) / 1000),
    rooms: metrics.rooms,
    clients: metrics.clients,
    ticks: metrics.ticks,
    tickMs: {
      avg: metrics.ticks ? +(metrics.tickMsTotal / metrics.ticks).toFixed(4) : 0,
      p95: +pct(0.95).toFixed(4),
      max: +metrics.tickMsMax.toFixed(4),
    },
    inputs: { accepted: metrics.inputsAccepted, dropped: metrics.inputsDropped },
  };
}

export function resetTickStats(): void {
  metrics.ticks = 0;
  metrics.tickMsTotal = 0;
  metrics.tickMsMax = 0;
  metrics.recentTickMs = [];
}
