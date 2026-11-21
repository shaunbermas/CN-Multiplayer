# ADR 0002: Hosting for the game server

Status: **PROPOSED, owner decision needed** before anything goes live (plan D7).

## Context

- The web client is static files. The repository's original plan deploys static sites to Cloudflare
  through GitHub Actions (as `shaun-game` does).
- The game server is Colyseus on Node.js (GDD §7.1). It needs a long-running process holding WebSocket
  connections, with every player of one room connected to the same process.
- A Cloudflare Worker alone cannot run a Colyseus server.
- Audience: the Creative Nomads team (about 20+ people), mostly one room at a time, US business hours.

## Options

Prices and limits change; none are quoted here. Check them before choosing.

| Option | How it works | For | Against |
|--------|--------------|-----|---------|
| **A. Cloudflare Workers (client) + Cloudflare Containers (Colyseus)** | Worker serves the client and routes `/matchmake` and WebSocket traffic to a container running the existing server | One vendor and one deploy workflow; keeps Colyseus | Newer product; room-to-container routing must be designed (one container, or one per room); needs a spike to confirm long-lived WebSocket behaviour |
| **B. Cloudflare Workers (client) + a separate Node host** (for example Fly.io, Render, Railway or a small VPS) | Standard Colyseus deployment on one always-on instance | Simplest and most documented path; no code changes | Second vendor and account; choose a region close to the team |
| **C. Colyseus Cloud** | Managed hosting from the Colyseus team | Built for this server; scaling and monitoring included | Vendor lock-in; cost |
| **D. Rewrite the server on Cloudflare Durable Objects** | One Durable Object per room, no Colyseus | One vendor; matches the approach already used in `shaun-game` | Changes the GDD's approved server technology; lose Colyseus state sync, matchmaking and reconnection; more custom networking code |

## Recommendation

Spike **A** first (keeps everything on Cloudflare and the existing auto-deploy habit). If the spike shows
WebSocket or routing problems, fall back to **B** with a single small instance, which needs no code
changes. Option D only if the owner prefers to drop Colyseus.

Until then, everything runs and is tested locally and in CI.
