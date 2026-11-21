// Player name cleaning (GDD §7.4 basic protection). Message types live in protocol.ts.

export function sanitizeName(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw : '';
  // Letters, numbers, spaces and a few separators only.
  const clean = s.normalize('NFKC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return clean || fallback;
}
