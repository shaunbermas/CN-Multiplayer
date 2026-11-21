// Cloudflare Worker: serves the web client (static assets) and routes /api/* to rooms.
//   GET  /api/health                        Worker is up
//   GET  /api/room/<code>/ws  (WebSocket)    join the room
//   GET  /api/room/<code>/health             room stats (players, tick timing)
// M0 uses the room code "default"; private invite codes arrive in M2.
import type { Env } from './env.ts';

export { TrialRoom } from './room.ts';

const ROOM_CODE = /^[a-z0-9-]{1,32}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ ok: true, service: 'cn-trials' });
    const m = url.pathname.match(/^\/api\/room\/([^/]+)\/(ws|health|metrics\/reset)$/);
    if (m) {
      const code = m[1].toLowerCase();
      if (!ROOM_CODE.test(code)) return new Response('Bad room code', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const forward = new URL(request.url);
      forward.searchParams.set('room', code);
      return stub.fetch(new Request(forward.toString(), request));
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
