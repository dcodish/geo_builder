# 03 — Non-Functional Requirements

_Last updated: 2026-07-11._

Quality attributes and constraints. IDs are stable references (`NFR-<area>-<n>`). Each is phrased to be checkable.

## Usability

- **NFR-US-1** — Usable by a high-school student with **no training or documentation**. Core actions (add a fact, cycle alternative, undo, clear) are discoverable on first use.
- **NFR-US-2** — Hebrew, right-to-left, is the default and a first-class experience (not a translation afterthought). Layout, input, and labels all respect RTL.
- **NFR-US-3** — Errors and contradictions are explained in plain student language, never as stack traces or jargon.
- **NFR-US-4** — Works on a typical school desktop/laptop browser and is usable on a **tablet** (touch: pinch-zoom, tap-to-focus, +/− buttons — hardening F2, [ADR-207](06-decisions.md#adr-207)). **Phones are explicitly out of scope for this phase** (operator ruling 2026-07-03, reaffirmed 2026-07-11: "I don't want to support mobile phones at this phase, but tablets should be").

## Stability (a hard requirement, not a nice-to-have)

- **NFR-ST-1** — When a new fact is added, objects already on screen **must not visibly jump or rearrange** beyond what the new constraint strictly requires. Visual continuity between steps is essential to the product (see [Vision](01-vision.md)).
- **NFR-ST-2** — Cycling alternatives changes only the affected branch; unrelated parts of the figure stay put.
- **NFR-ST-3** — Stability is achieved structurally (persistent degrees-of-freedom and branch indices), and is regression-tested (a test asserts bounded per-object movement between steps).

## Performance

- **NFR-PF-1** — A parsed step renders in well under a perceptible delay for typical figures (target: < ~200 ms engine + render, excluding any network call).
- **NFR-PF-2** — Inputs handled by the local grammar parser incur **no network latency** (instantaneous).
- **NFR-PF-3** — When the API fallback is used, the round trip should feel responsive (target: typically < ~2 s) and never block the rest of the UI.

## Correctness

- **NFR-CO-1** — Rendered figures are geometrically correct to display precision for all supported constructions.
- **NFR-CO-2** — Contradictory inputs are detected rather than rendered as wrong-but-plausible figures.
- **NFR-CO-3** — Measures shown (lengths, angles) match the constraints that produced them.

## Offline & availability

- **NFR-AV-1** — The app's core (parsing of common inputs, engine, rendering) works **fully offline**; only the optional LLM fallback needs the network.
- **NFR-AV-2** — Loss of network degrades gracefully: the local parser still handles what it can; unsupported phrasings simply ask the user to rephrase.

## Cost (operator-facing)

- **NFR-CT-1** — Distribution must not impose a per-user cost barrier; the common case (local parser) is free.
- **NFR-CT-2** — Total LLM API spend is **bounded and cannot surprise the operator**: enforced via a prepaid credit ceiling, a Console monthly spend limit, and usage alerts.
- **NFR-CT-3** — The LLM model for parsing is the cheapest sufficient one (`claude-haiku-4-5`); `max_tokens` and prompt size are kept minimal.

## Feature gating & tiers

For capabilities that are expensive (extra LLM spend) or commercial (premium/paid), the build must be able to **ship with the feature visibly present but closed**, while the same code path is **fully usable in local development**. Introduced for the textbook-statement export (FR-HS-9); the mechanism is general.

- **NFR-FG-1** — A capability can be gated by a single **feature flag** resolved at build/runtime (e.g. an env-driven config such as `VITE_FEATURE_<NAME>` baked at build, optionally overridable per-deployment). The flag has two effects that must always agree: it controls whether the feature **does any work** (no gated LLM/API call may fire when the flag is off) **and** how the UI presents it.
- **NFR-FG-2** — When a **premium** feature is **off** (the default production build), the UI must **indicate it is a paid option** (a clear, non-deceptive affordance — e.g. a disabled control with an "upgrade / paid feature" label), never silently hide it and never fail with an error on click. When **on** (local development, or a licensed build), the feature works normally.
- **NFR-FG-3** — A gated premium feature must **not increase cost or attack surface when off**: its server endpoint (if any) is not reachable / does nothing in a build where the flag is off, so toggling visibility can never leak paid functionality or run up API spend (composes with NFR-CT-2 and NFR-SE-2).

## Security & privacy

- **NFR-SE-1** — The Claude API key is **never shipped to the browser**; all API calls go through a server-side proxy that holds the key.
- **NFR-SE-2** — The proxy is gated (e.g. a per-class access code) and rate-limited per client, so an exposed endpoint cannot be abused to run up cost.
- **NFR-SE-3** — No accounts, no names, no student personal identifiers. The server keeps a **minimal usage-event log** for product improvement ([ADR-179](06-decisions.md#adr-179), [ADR-278](06-decisions.md#adr-278)): the typed utterance (math text only), locale/outcome, and a salted-HMAC **visitor hash — never the raw IP**. Retention is **finite by default** (`EVENTS_RETENTION_DAYS`; default 7 days, operator ladder 7→~30 with real traffic) and the salt never falls back to a committed constant (unset ⇒ random per-boot). A short privacy note is shown **in-app** (2-D About modal, 3-D footer). Figure persistence (FR-HS-4) is local to the browser; verbose debug logs (figure snapshots) are dev-only, never written in production.

## Accessibility

- **NFR-AC-1** — Sufficient color contrast and legible label sizes for classroom/projector use.
- **NFR-AC-2 (Should)** — Keyboard operability for primary actions.

## Compatibility

- **NFR-CP-1** — Targets current evergreen browsers (Chrome, Edge, Firefox, Safari). No IE.
- **NFR-CP-2** — No native install; runs as a web app.

## Maintainability

- **NFR-MT-1** — The renderer is a swappable layer: it consumes engine output and can be replaced without changing the engine.
- **NFR-MT-2** — The input layer is behind a single `utterance → command[]` boundary, so the parser and the LLM fallback can each evolve independently.
- **NFR-MT-3** — TypeScript throughout; the design documents in `docs/` and the decision log are kept current as the system evolves.
