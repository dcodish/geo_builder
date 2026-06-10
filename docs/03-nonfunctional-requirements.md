# 03 — Non-Functional Requirements

_Last updated: 2026-06-10._

Quality attributes and constraints. IDs are stable references (`NFR-<area>-<n>`). Each is phrased to be checkable.

## Usability

- **NFR-US-1** — Usable by a high-school student with **no training or documentation**. Core actions (add a fact, cycle alternative, undo, clear) are discoverable on first use.
- **NFR-US-2** — Hebrew, right-to-left, is the default and a first-class experience (not a translation afterthought). Layout, input, and labels all respect RTL.
- **NFR-US-3** — Errors and contradictions are explained in plain student language, never as stack traces or jargon.
- **NFR-US-4** — Works on a typical school desktop/laptop browser; **should** be usable on a tablet/phone (mobile-friendly layout).

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

## Security & privacy

- **NFR-SE-1** — The Claude API key is **never shipped to the browser**; all API calls go through a server-side proxy that holds the key.
- **NFR-SE-2** — The proxy is gated (e.g. a per-class access code) and rate-limited per client, so an exposed endpoint cannot be abused to run up cost.
- **NFR-SE-3** — No student personal data is collected or stored server-side. Any persistence (FR-HS-4) is local to the browser.

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
