# ADR 0002: Hosting for the game server

Status: **ACCEPTED: option D, Durable Objects** (owner decision, 21 November 2026). Implemented in `apps/server`.

## Owner constraint (decision 015)

Hosting uses **Cloudflare and GitHub only**: everything is managed in the browser and deployed by
GitHub Actions, with no other hosting vendor. This rules out a separate Node host and Colyseus Cloud
(former options B and C).

## Context

- The web client is static files, served by a Cloudflare Worker (as `shaun-game` does).
- The game server must hold WebSocket connections for every player of a room in one place and run a
  30 Hz loop during a match.
- The current server is Colyseus on Node.js (GDD §7.1). A Cloudflare Worker alone cannot run it.
- Audience: the Creative Nomads team, about 20+ people, usually one room at a time, mostly short
  standup sessions.

## The two Cloudflare options

| | **A. Cloudflare Containers running Colyseus** | **D. Cloudflare Durable Objects (one per room), no Colyseus** |
|---|---|---|
| How | A Worker serves the client and forwards matchmaking and WebSocket traffic to a container running the existing Node server | A Worker serves the client; each room is a Durable Object holding the room's WebSockets and running the game loop |
| Code changes | None to the server | Port the room (join, inputs, 30 Hz tick, finish) from Colyseus to a Durable Object. Movement, stage data and messages in `packages/shared` are reused unchanged |
| Cloudflare plan | Workers Paid plan required ($5/month) | Works on the Free plan (SQLite-backed Durable Objects); Paid plan adds headroom |
| Deploy | Wrangler builds and pushes a Docker image from GitHub Actions | Plain `wrangler deploy` from GitHub Actions (same as `shaun-game`) |
| Maturity | Containers are a newer product; each container also runs behind its own Durable Object | Durable Objects are mature and already used in `shaun-game` |
| Moving parts | Worker + container + Durable Object | Worker + Durable Object |
| What we lose | Nothing | Colyseus features: schema state sync, matchmaker, built-in reconnection. Replaced by a small custom protocol (snapshots at 20 Hz, input acks, reconnect token) |
| GDD impact | Matches GDD §7.1 (Colyseus) | Changes GDD §7.1 and §7.3: needs the owner's approval (GDD §15.1 rule 1) |

### Free-plan fit for option D (estimate, to verify after deploy)

Free plan limits (Cloudflare docs, checked 21 November 2026): 100,000 Durable Object requests per day
(incoming WebSocket messages count at 20:1), 13,000 GB-seconds of duration per day.

- A 22-player round of 120 s with inputs at 30 Hz is about 79,000 incoming messages, about 4,000
  billed requests. That allows roughly 25 rounds per day; sending inputs at 20 Hz raises that to about
  37. A standup uses 1 to 3 rounds.
- Duration: an active room at 128 MB uses 0.125 GB-s per second; 13,000 GB-s is about 29 hours of active
  room time per day.

## Recommendation

**Option D, Durable Objects.** It fits the constraint most simply: one Worker, one deploy step, free
to run at standup scale, and the same pattern already proven in `shaun-game`. The server is still small
(one room class), and the shared movement code, stage data and tests carry over, so the port is cheap
now and gets more expensive with every Colyseus feature we adopt.

Choose **A** instead if keeping Colyseus matters more than cost and simplicity.

## What changed when D was adopted

1. `apps/server` becomes a Cloudflare Worker with a `TrialRoom` Durable Object (same rules: 30 players,
   token-bucket input limit, server-owned movement and finish).
2. `apps/web` swaps `colyseus.js` for a small WebSocket client; prediction and reconciliation stay.
3. `wrangler.jsonc` serves `apps/web/dist` and routes `/api/*` to the Worker; `.github/workflows/deploy.yml`
   deploys `main` with the `CLOUDFLARE_API_TOKEN` secret already saved in this repository.
4. The load test, two-browser test and walk timing run against `wrangler dev` locally and in CI.
5. GDD §7.1 and §7.3 and ADR 0003 are updated; `docs/DECISIONS.md` records the change.

Sources: [Containers pricing](https://developers.cloudflare.com/containers/pricing/),
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing),
[Durable Objects on the Free plan](https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier),
[Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits).
