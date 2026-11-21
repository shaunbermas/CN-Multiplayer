# CN Trials: notes for Claude

CN Trials is the Creative Nomads team's browser multiplayer game: a quick icebreaker at standups and a
seven-round tournament for team events (up to 30 players). It is a separate project from `shaun-game`:
do not copy code or assets between them unless the owner asks.

Start with `README.md`, `docs/DECISIONS.md` (what is decided and what is open) and
`docs/GAME_DESIGN_DOCUMENT.md` (the canonical rules). Never change an APPROVED item in the GDD without
the owner's decision, recorded in `docs/DECISIONS.md`.

## Workflow after every change (the owner asked for this)

1. Run the checks that cover what you changed:
   - `npm run typecheck` and `npm test`
   - `npm run test:load` and `npm run test:e2e` (both build the client and run the Worker under
     `wrangler dev`; in the cloud container run them with `NODE_PATH=$(npm root -g)` so Playwright resolves)
   - Blender or stage spec changes: `bash blender/scripts/run_stage.sh STG01` (installs `bpy==5.3.0`
     if missing; no Blender window needed)
2. Commit on a branch and push. Never push to `main` directly.
3. Open a pull request into `main`, watch its Checks (`app` and `test`), fix any failure at its root
   cause, and **merge it yourself once both checks pass**. The owner asked for merges to happen
   automatically after checks pass; GitHub auto-merge is not usable because `main` has no required
   checks, so you do the merge.
4. Merging into `main` deploys: `.github/workflows/deploy.yml` builds and runs `wrangler deploy`
   (repository secret `CLOUDFLARE_API_TOKEN`). After merging, check the Deploy run and tell the owner
   whether https://cn-trials.shaun-bermas.workers.dev is live.
5. Hosting is Cloudflare and GitHub only (decision 015). Do not add other hosting services.

## Conventions

- Rules and tuning: stage numbers live in the stage spec (`docs/STAGE_01_SPEC.md`) and the build spec
  (`blender/scripts/specs/*.json`); shared constants in `packages/shared/src/constants.ts`.
- The server owns movement and results; clients only send inputs (GDD §7.3). Movement code in
  `packages/shared` is used by both the room (`apps/server`) and client prediction (`apps/web`).
- Blender: pinned 5.3.0, conventions in `docs/BLENDER_PIPELINE.md`. Scripts own the `STG01_*`
  collections. `.blend`, `.glb` and images are stored with Git LFS.
- Tone is playful (decision 008): suspense and comedy, no horror imagery or harm.
- Name players and stage figures by the decided names: the Stage 01 enemy is The Watcher (`THE_WATCHER`, `Watcher_` bones and clips; decision 023, which retired The Shepherd).
- Game-design guidance: the owner's `shaun-game` and `game-feel` skills apply.
