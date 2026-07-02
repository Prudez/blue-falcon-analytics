# Code Prompts — Build Phases

Prompts for Claude Code. These stay short because Claude Code reads the repo: the brief at `docs/phases/README.md`, the latest phase handoff, and `shared/contract.js` carry the context.

Page mockups live in `prompts-design.md` and are made in Claude Design. When a mockup is approved, use the design-to-code handoff prompt below so the built page matches it.

---

## Phase 0 kickoff (repo does not exist yet)

```
This is a new full-stack app. The project brief is committed at
docs/phases/README.md — read it first. It defines the app, the stack, the
conventions, and the phased roadmap.

Build Phase 0 (Walking skeleton) exactly as the brief specifies:
- Scaffold the repo: Node/Express backend on 3001, Vite/React frontend on
  3000, run together with `npm run dev`.
- Connect the backend to the existing PropIQ Supabase project via the
  Transaction pooler on 6543, node-postgres, $1 params, propiq schema.
- Create shared/contract.js as the single source of truth, with one endpoint:
  GET /api/health that queries the DB and returns ok plus a timestamp.
- Set up secrets with the api-keys skill: a committed .env.example and a
  startup env validator. No real key values in the repo — I fill my local .env.
- Wire the health endpoint through the contract on both sides and render its
  result on a bare frontend page.

Use the api-contract and api-keys skills. When it renders end to end, close the
phase: write docs/phases/phase-0.md with the phase-handoff skill and tick the
Phase 0 box in the brief.
```

## Steady state (every phase after 0, fresh chat)

```
Continue the project. Build the next phase.
```

Explicit version if preferred:

```
Read docs/phases/README.md and the latest docs/phases/phase-N.md, then build
the next unchecked phase. Surface any open issues from the last phase before
starting, and close the phase with a handoff when done.
```

## Design-to-code handoff (building a page to match an approved mockup)

```
Build the [Overview] page frontend to match the approved Claude Design mockup
for this page. Keep the shell, card style, and chart palette from the design.
Wire each widget to the contract: contract entry, backend query, frontend card.
Use Recharts for the charts.
```

Replace [Overview] with the page being built. If Code cannot see the mockup,
paste a screenshot of it into the chat alongside this prompt.

## Closing a phase deliberately

```
Wrap up this phase. Write the handoff to docs/phases/phase-N.md, put anything
unfinished or broken in the open-issues section, and update the roadmap.
```

## Porting from PropIQ (phases 2 to 4)

```
This phase reuses PropIQ code. The PropIQ repo is at [path]. Port the [schema /
the four platform fetchers] into this app, matching this project's conventions.
Do not copy instagram.js blindly — fix its known issues while porting: the
deprecated field names, the wrong endpoint, and the shortcode-to-media-ID
mapping. Reuse the existing Meta "PropIQ Sync" app; do not re-register it.
```
