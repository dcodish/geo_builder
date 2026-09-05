# 04s — Design: the shared server (`server/`)

_How the one shared backend is built. Registered in [`DOCS.json`](../DOCS.json) as the `server` product's
design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**Its requirements live elsewhere, deliberately.** What the admin surface must promise is
[`FR-AD-1…4`](02w-requirements-workspace.md); the key-handling, cost, rate-limiting and privacy posture
are [`NFR-SE-1…3`](03-nonfunctional-requirements.md) and `NFR-CT-*`. A separate requirements doc would be
a third copy of promises that already have a home. This document is the *how*.

Operating procedures — deploying, verifying, rolling back — are [RUNBOOK](RUNBOOK.md) and
[`deploy/README.md`](../deploy/README.md); this is the architecture behind them.

## The shape: one process, one file, no database

The whole backend is a single Node `http` service. `server/build.mjs` bundles it with esbuild into
**one self-contained `dist-server/proxy.mjs`** — the Anthropic SDK included — so the deploy artifact
needs only Node and an environment file. No `npm install` on the server, no database, no runtime
dependencies to drift. The admin dashboard's HTML (inline CSS, inline SVG bars) is emitted as one
string for the same reason.

```
Browser ──/geo-builder/*────────► httpdocs/geo-builder/   (static SPA, dist/)
        ├─ /…/api/parse ──► Apache ──► 127.0.0.1:8788 ──► Anthropic  (key in env, never in the bundle)
        ├─ /…/api/log   ──► Apache ──► 127.0.0.1:8788 ──► events.jsonl  (hashed visitor, never raw IP)
        ├─ /…/api/config──► Apache ──► 127.0.0.1:8788 ──► operator config
        └─ /…/admin     ──► Apache ──► 127.0.0.1:8788 ──► usage dashboard (login)
```

The SPA is static and separate; the service exists only for what a browser must not do — hold a key,
write a file, and aggregate other people's traffic.

## Module map

| Module | Role |
|---|---|
| `standalone.ts` | The production host: a Node `http` server mounting the shared handlers |
| `llmProxy.ts` · `logProxy.ts` · `configProxy.ts` | The **dev** hosts of the same handlers, as Vite plugins |
| `parseHandler.ts` | The shared LLM-fallback handler both hosts call |
| `eventLog.ts` | The usage-event sink: validate → hash the visitor → append one JSON line |
| `admin.ts` | The password-protected dashboard over `events.jsonl` |
| `adminConfig.ts` | Operator-editable per-tool config, validated at save time |
| `http.ts` | Client IP and rate-limiter helpers, shared by every handler |

**Dev and prod run the same handler.** `llmProxy.ts` (Vite middleware) and `standalone.ts` (production)
are two *hosts* of `parseHandler.ts`, not two implementations — so a behaviour that works in development
is the behaviour that ships. `configProxy.ts` exists for exactly this reason: without it the dev server
would degrade differently from prod when no config file is present.

## The key boundary

`ANTHROPIC_API_KEY` lives **only** in this process's environment, from a root-only systemd
`EnvironmentFile`. It is never in a client bundle, never in a repo file, and no browser code path can
reach it — which is why the product trees are **forbidden** from importing `server/`
([`BOUNDARIES.json`](../BOUNDARIES.json)): an import would pull the key-handling path into a browser
bundle. A product talks to the proxy over HTTP or not at all.

## One proxy, parameterized — never forked

The request body carries a `tool:` field, and the handler selects that product's prompt builder. This is
**the one deliberate sharing point in the workspace**: `server/` is allowed to import
`src/parser/llmShared` and `src3d/parser/llmShared3` (an explicitly-allowed edge in `BOUNDARIES.json`,
listed so the coupling is visible rather than folklore).

**Currently two of the four builders use this lane.** 2-D posts without a `tool` (the default) and 3-D
posts `tool: '3d'`. **Complex and analytic do not call it at all** — they ship deterministic parsers with
no LLM fallback, so nothing in those trees posts to `/api/parse`. The parameterization is what keeps
adding a lane cheap; it is not evidence that all four use one.

`adminConfig.ts` is the other direction: it *imports a product's parser* (the complex grammar, which is
context-free and therefore safe to run server-side) to validate quick commands at save time.

## Cost and abuse controls

Layered, because a single throttle is bypassable:

- **Per-client rate limiting** on every handler (`http.ts`), with `TRUSTED_PROXY_HOPS` so the client IP
  is read correctly from behind Apache rather than seeing the reverse proxy's address.
- **A global daily ceiling** — `LLM_DAILY_MAX`, read per request so it can be changed without a restart —
  plus `LLM_MAX_CONCURRENT`. The ceiling is global rather than per-IP because a per-class access code in
  an SPA bundle is only a speed bump, and because the failure it guards is a bot, not a class.
- **Body and field caps** in the event sink (`MAX_BODY`, `MAX_UTTERANCE`, `MAX_PER_WINDOW`).
- **The cheapest sufficient model** (`NFR-CT-3`).

When the ceiling is hit the message must say so plainly — never "couldn't understand", which blames the
student for an operator's budget.

## The event sink and the dashboard

The SPA fire-and-forgets one lean event per action (a `session` marker per page load, a `submit` per
utterance). The service validates it, **hashes the visitor with a salt, and appends one JSON line**; the
raw IP is never stored. Retention is finite by default. The privacy posture itself is
[`NFR-SE-3`](03-nonfunctional-requirements.md) and is not restated here.

`admin.ts` reads and aggregates that file into a Hebrew-RTL report — traffic, parse-outcome breakdown,
language split, top utterances, and per-session timelines in entry order. Auth is a **stateless signed
cookie** (`base64(exp).hmacSHA256(secret, base64(exp))`, verified timing-safe on every request): one
admin needs no session store, and no store means no state to deploy or corrupt.

**`adminConfig.ts`'s bounding rule** is [`FR-AD-3`](02w-requirements-workspace.md): config may *choose
among* what the code supports, never *assert* support it lacks. A product id absent from
[`products.json`](../products.json) is refused, and a featured quick command is run through that tool's
own grammar at save time and refused by name if it does not parse.

## Boundaries

Declared in [`BOUNDARIES.json`](../BOUNDARIES.json) and enforced by `server/__tests__/isolation.test.ts`:

- **allowed:** `server → src`, `server → src3d`, `server → src-complex` — the binding points above.
- **forbidden:** every product tree `→ server` (the key path), and `server ↔ shell` in both directions
  (the proxy has no UI; browser chrome must not pull in key handling).

The shared `server/` tests run in **every** product CI lane, which is why the cross-product guards live
here: a violation introduced by any product fails that product's own lane.

## The type gate — closed 2026-09-05

For most of this tree's life it was **not typechecked**: absent from [`tsconfig.json`](../tsconfig.json)'s
`include`, and `build.mjs` uses esbuild, which strips types without checking them — so the one tree
running as a long-lived production service was the only one `tsc -b` never saw.

Closed in #904 Phase 4: `server` is in `include`, and the three errors that had accumulated are fixed at
their seams. The interesting one is [`parseHandler.ts`](../server/parseHandler.ts): the prompt builders
own the request as plain data and deliberately import no SDK types (they ship in browser bundles), so
their `as const` makes every array readonly where the SDK wants mutable `string[]`. That mismatch is a
**boundary** concern, so the widening lives at the seam that knows this data is an SDK request — typed as
`MessageCreateParamsNonStreaming`, which both widens and pins the non-streaming overload, rather than
pulling SDK types into a product tree.
