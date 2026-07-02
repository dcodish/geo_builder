# 15 — Hardening Plan (Fable review, 2026-07-02)

_A step-by-step implementation plan turning the 2026-07-02 multi-area review (engine, parser, store/UX, renderer, testing, server/security) into sequenced, gated work. Produced by five deep reviews that **read and executed the actual code** — findings are grounded, not speculative unless marked._

**How to use this doc.** Work top-to-bottom by phase. Each step has a stable ID (e.g. `PAR-1`), a **root cause** (per the repo's root-cause-over-symptom rule), the **fix**, **files**, the **ADR** to add, the **regression test/scenario** required, and the **gate** (tests green + `tsc`/build clean). Check off with the ADR number once landed. Nothing here is a patch — each fixes the layer where the defect originates.

## Sequencing rationale

1. **Phase A — Test safety nets first.** Cheap, high-leverage, and they catch regressions from *everything after*. The shadow-matrix (PAR-11) and seed-sweep (TST-1) guard the exact escape classes the later phases touch. Do these before the parser/engine/store refactors.
2. **Phase B — Security.** Independent (server + deploy only), gates the pending production proxy deploy. Can run in parallel with Phase A.
3. **Phase C — Parser correctness** (the silent-mis-parse class). Now guarded by the shadow matrix.
4. **Phase D — Engine anti-pattern** (kind-whitelist duplication; under-published solver output).
5. **Phase E — Store robustness** (replay cost, freeze, async race, undo granularity). Guarded by seed-sweep + store PBT.
6. **Phase F — Renderer / UX for the real audience** (RTL, touch, export, view-stability, a11y).

Dependency notes: PAR-11 (shadow matrix) should land before Phase C. TST-1 (seed-sweep) before Phase E. ENG-2 (publish solved radii) unblocks REN-6 (delete `pointOnCircleId`). TST-2 (de-triplicate `parseCtx`) also fixes a live triage bug and should precede other parser-context work.

---

## Phase A — Test safety nets (do first)

### A1 · PAR-11 — Structural shadow-detection test for the parser
- **Root cause.** `parse()` is first-match-wins over a flat `RULES` array ([parse.ts:3550](../src/parser/parse.ts#L3550)); ordering is defended only by hand-written cases. Every silent mis-parse in Phase C (and historically ADR-119/077/166's parser halves) is the same shape: an earlier coarse rule claims a fragment a later, more specific rule should own. There is no structural guard.
- **Fix.** Export `RULES` (test-only). New test: corpus = catalog en+he examples + `parser-coverage` PARSES + scenario utterances + a mined slice of `logs/debug-log.jsonl`; context variants = `{}`, one-circle-with-members, rich-points. For each utterance run **all** rules, record every non-null matcher by `fn.name`, diff the winner's JSON against each later matcher's output, and assert the set of `(winner → shadowed-rule)` pairs equals a checked-in allowlist. A new shadow fails CI with named rule pairs.
- **Files.** `src/parser/parse.ts` (export RULES), new `src/parser/__tests__/shadow-matrix.test.ts`, a checked-in `shadow-allowlist.json`.
- **ADR.** New ADR: "structural shadow-detection guard for the first-match parser."
- **Gate.** Test green; allowlist reviewed so every current shadow is intentional; build clean.
- **Effort.** ~½ day. **Risk.** Low (test-only, zero runtime change). **Value.** Highest single item — turns the dominant parser escape class from "one session → one ADR" into a CI gate.

### A2 · TST-1 — Seed-sweep verifier oracle over existing scenarios
- **Root cause.** Tests validate at seed 0 (`replay(facts, firstSatisfyingSeed(...))`); the dominant historical escape is *wrong-configuration-at-other-seeds* (ADR-085/098/127/166 all shipped past seed-0 suites). The one universal oracle for the under-determined ~89% — "every sampled config satisfies every given" — is only ever run at one seed.
- **Fix.** Export the `SCENARIOS` array. New test iterates each scenario over seeds 0–7 and asserts, per seed, EITHER `meetsRequirements(facts, s)` is false (config legitimately rejected) OR `replay(facts, s).violations === []` with `lastError === null`. Add a `SEED_SWEEP_MULT` env for CI depth.
- **Files.** `src/__tests__/scenarios.test.ts` (export SCENARIOS), new `src/__tests__/seed-sweep.test.ts`.
- **ADR.** New ADR: "seed-sweep oracle — every sampled config must honour the givens."
- **Gate.** Green across the sweep (fixing any figure it exposes as seed-fragile, as its own step); build clean.
- **Effort.** ~½ day + fallout triage. **Risk.** Low (may surface real latent seed bugs — that's the point). **Value.** Very high.

### A3 · TST-2 — De-triplicate `parseCtx` / `submit` (also fixes a live triage bug)
- **Root cause.** The parse-context builder and the submit/classify pipeline are re-implemented three times: real in [App.tsx:229](../src/App.tsx#L229), scenario mirror `ctxOf` ([scenarios.test.ts:42](../src/__tests__/scenarios.test.ts#L42)), triage harness `ctxFrom` ([replaySession.ts:59](../src/validation/replaySession.ts#L59)). The triage mirror is **missing `parallels: parallelEdgePairs(...)`** (ADR-169) — so it misclassifies every trapezoid-altitude utterance as a coverage gap, a false signal in the exact tool built to find real gaps.
- **Fix.** Extract `buildParseCtx(construction, positions)` and `classifySubmit(facts, utterance, seed)` into one pure module; import from App, scenarios, and replaySession. Deletes ~80 lines of mirrors.
- **Files.** new `src/parser/context.ts` (or `src/store/`), `App.tsx`, `scenarios.test.ts`, `replaySession.ts`.
- **ADR.** New ADR: "single parse-context/submit builder — retire the drifting mirrors."
- **Gate.** All existing tests green (behaviour-preserving); a test asserting the triage harness now parses a trapezoid-altitude utterance; build clean.
- **Effort.** ~1–2 h. **Risk.** Low-med (touches the App pipeline; guarded by existing scenarios). **Value.** High (fixes a real bug + removes a drift generator).

### A4 · TST-6 — Verifier tolerance-pinning test
- **Root cause.** The verifier's incidence checks are ~100× looser than the solver (`max(0.05, 2%·r)` in [verify.ts:91](../src/engine/verify.ts#L91) vs `max(1e-6, 2e-4·scale)` in [solve.ts:236](../src/engine/solve.ts#L236)). On the under-determined figures only the verifier guards, a point can drift visibly and still read green. Nothing pins the ladder against tolerance rot.
- **Fix.** Build a verified figure, displace an on-circle point by 0.5×tol and 2×tol, assert green vs flagged respectively (the coord-campaign "catches a perturbed coordinate" pattern applied to the verifier).
- **Files.** new `src/engine/__tests__/verify-tolerance.test.ts`.
- **ADR.** Fold into the ADR that (optionally) tightens the incidence tolerance; otherwise a standalone "pin the verifier tolerance ladder" note.
- **Gate.** Test green; build clean. **Effort.** ~½ h. **Risk.** Low.

### A5 · TST-5 — Replay-count perf canary
- **Root cause.** Two documented perf incidents (the ~136-replay freeze; the ~1.5 s coupled replay), no structural guard. Vitest's default 5 s is the only implicit ceiling; a 100 ms→4 s per-replay regression ships silently.
- **Fix.** Export a module-level `replayCount` counter incremented in `replay`. Canary test runs the 3 heaviest scenarios through the store `execute` path and asserts total replays < N (≈2× current measured) + a generous elapsed ceiling. Count, don't time (CI-stable).
- **Files.** `src/store/geoStore.ts` (counter), new `src/store/__tests__/perf-canary.test.ts`.
- **ADR.** Fold into STO-1/STO-2 ADRs. **Gate.** Green; build clean. **Effort.** ~½ h. **Risk.** Low.

### A6 · TST-7 — Hygiene: scenario-doc parity + stray file
- **Root cause.** 124 scenarios in code vs 98 `###` entries in `docs/test-scenarios.md`; the doc is the operator audit trail (repo rule) and is ~26 behind. A stray `collinear.test.ts.tmp.*` sits in the tests dir.
- **Fix.** 12-LOC test asserting the doc's backticked ids are a superset of `SCENARIOS` ids (allow marked unit-only). Delete the stray temp file; add `*.tmp.*` to the test glob ignore.
- **Files.** `docs/test-scenarios.md`, new tiny parity test, `.gitignore`/vitest config.
- **Gate.** Green. **Effort.** ~½ h. **Risk.** None.

---

## Phase B — Security (gates the production deploy)

> Assumes the planned Apache→loopback topology (`/geo-builder/api/parse` → 8788). All are pre-deploy, so there is time — but SEC-1/2/3 must land **before** the proxy goes live.

### B1 · SEC-1 — Trust the correct X-Forwarded-For hop (HIGH)
- **Root cause.** [http.ts:19](../server/http.ts#L19) trusts `xff.split(',')[0]` (first entry), but Apache `mod_proxy_http` **appends** the real peer, so the trustworthy value is the **last** hop. The inline comment's "loopback ⇒ safe" reasoning is wrong: Apache forwards the client's spoofed header verbatim.
- **Attack (this deployment).** A student sends a fresh random first XFF per request → each lands in its own rate-limit bucket → the cap never trips → unbounded Haiku calls on prepaid credit; also poisons the dashboard's unique-visitor hashing.
- **Fix.** Take the **last** XFF element (`parts[parts.length - 1]`), or configure `mod_remoteip` and read `req.socket.remoteAddress`. Drop the `X-Real-IP` fallback (SEC-8 — Apache never sets it; 100% client-supplied).
- **Files.** `server/http.ts`; note the Apache/`mod_remoteip` option in `deploy/`.
- **ADR.** New ADR: "trust the last XFF hop behind Apache." **Test.** `server/__tests__` unit: multi-value XFF → last hop chosen; spoofed first entry ignored.
- **Gate.** Test green; build clean. **Effort.** ~1 h. **Risk.** Low. **Priority.** Do first — it's the only implemented throttle and it's defeated.

### B2 · SEC-2 — Build the cost gate (HIGH)
- **Root cause.** NFR-SE-2 / ADR-023 specify a per-class access code; the client posts only `{utterance, context}` ([llm.ts:88](../src/parser/llm.ts#L88)) — no gate exists. With SEC-1 defeated there is no effective cost control at all.
- **Fix (decision point — pick when we reach it).** Layered:
  - (a) a **server-side global daily call ceiling** (hard cap, unconditional) — minimum viable, do regardless;
  - (b) a **per-class shared access code** checked constant-time (`timingSafeEqual`) from a header, plus a per-code/day quota;
  - (c) accept the code is a low-value speed-bump if shipped in the SPA bundle — the daily ceiling is the real backstop.
- **Files.** `server/parseHandler.ts`, `server/standalone.ts`, `src/parser/llm.ts` (send header), `deploy/geo-proxy.env` (code + ceiling).
- **ADR.** New ADR: "cost gate — global daily ceiling + per-class code." **Test.** handler unit: over-ceiling → 429; missing/wrong code → 401; constant-time compare.
- **Gate.** Green; build clean. **Effort.** ~½ day. **Risk.** Low.

### B3 · SEC-3 — Admin cookie secret must not fall back to a committed constant (HIGH)
- **Root cause.** [standalone.ts:34](../server/standalone.ts#L34) derives `ADMIN_COOKIE_SECRET` from `IP_HASH_SALT` and ultimately the committed `'geo-builder-default-salt'`; the dashboard guard ([admin.ts:582](../server/admin.ts#L582)) never checks a password is configured. A forged cookie reads the dashboard through the public proxy even when a blank password is assumed to "lock" it.
- **Fix.** Refuse to start (or refuse to serve `/admin`) when `ADMIN_COOKIE_SECRET` is unset or equals the default; do NOT derive it from the IP salt; treat "no password configured" as deny-all in the guard.
- **Files.** `server/standalone.ts`, `server/admin.ts`.
- **ADR.** New ADR: "fail-closed admin auth." **Test.** unit: unset/default secret → start refused / `/admin` denied; blank password → deny-all.
- **Gate.** Green; build clean. **Effort.** ~1–2 h. **Risk.** Low.

### B4 · SEC-4/5/6 — Rate-limiter memory, upstream timeouts, admin brute-force (MED)
- **SEC-4.** [http.ts:33](../server/http.ts#L33) `makeRateLimiter` never evicts stale keys → unbounded `Map` growth (amplified by SEC-1). Fix: cap size / sweep keys whose newest timestamp is past the window (keying on the corrected single-hop IP from SEC-1 already bounds this).
- **SEC-5.** [parseHandler.ts:66](../server/parseHandler.ts#L66) calls `messages.create` with no `timeout`, no `maxRetries`, no concurrency cap → a hung upstream holds sockets for minutes and retries multiply spend. Fix: explicit ~10–15 s timeout, `maxRetries: 0–1`, an in-process concurrency semaphore returning 429/503 past a small ceiling.
- **SEC-6.** [admin.ts:558](../server/admin.ts#L558) login POST isn't rate-limited (the compare is constant-time — good). Fix: apply the limiter + short lockout/backoff.
- **ADR.** One combined ADR: "server robustness — bounded limiter, upstream timeout/concurrency, login throttle." **Tests.** limiter eviction unit; timeout/concurrency handler unit; login-limit unit.
- **Gate.** Green; build clean. **Effort.** ~½ day total. **Risk.** Low.

### B5 · SEC-7 — Privacy / data-handling for a minors' school tool (MED)
- **Root cause.** `events.jsonl` retains student utterances + hashed IPs indefinitely (rotation bounds size, not age); the dev debug sink writes full figure snapshots + utterances to `logs/`, which is inside the Dropbox-synced tree (the `conflicted copy` files prove student text is replicating to a personal Dropbox account).
- **Fix.** Time-based retention/rotation for `events.jsonl`; a short written privacy note (what's stored, how long); move `logs/` out of the Dropbox tree (or Dropbox selective-sync ignore); confirm the debug sink is DEV-only (pairs with STO-1).
- **Files.** `server/eventLog.ts`, `server/logProxy.ts`, `docs/` (privacy note), Dropbox config (operator).
- **ADR.** New ADR: "student-data retention + keep logs off personal cloud." **Effort.** ~2 h + ops. **Risk.** Low.

### B6 · SEC-9 — Deploy guide durability + systemd hardening (LOW)
- **Root cause.** `deploy/README.md` leads with the fragile `vhost_ssl.conf` append (the Plesk-regeneration footgun from the workspace CLAUDE.md); systemd unit lacks `ProtectSystem=strict`, `ProtectHome`, explicit `ReadWritePaths`, env-file perms in prose only.
- **Fix.** Make "add via Plesk *Additional directives for HTTPS*" the primary step; tighten the unit; note `geo-proxy.env` must be `600 root:root`.
- **Files.** `deploy/README.md`, `deploy/geo-proxy.service`, `deploy/apache-geo-builder.conf`.
- **ADR.** Optional (deploy doc change). **Effort.** ~1 h. **Risk.** None.

---

## Phase C — Parser correctness (the silent mis-parse class)

> Each fixes a case where a plausible student utterance MATCHES a rule but produces semantically wrong commands — worse than an error because `droppedNewLabels` ([parse.ts:3789](../src/parser/parse.ts#L3789)) only escalates on a **new** dropped label, so any mis-parse reusing existing labels commits silently. **Land PAR-11 (A1) first** so these are caught. Every step adds an end-to-end scenario per repo rule.

### C1 · PAR-7 — Orthography normalization at the boundary (do early — kills a class)
- **Root cause.** `parse()` normalizes only whitespace ([parse.ts:3768](../src/parser/parse.ts#L3768)). Maqaf `־` (U+05BE — what Word/PDF paste for `-`) and invisible bidi controls (U+200E/F, U+202A–E) break the optional `ל-?`/`ב-?`/`מ-?` suffix groups and `\s*` adjacency. `נקודה E על AC ב־40%` silently drops the ratio (parses without `t`).
- **Fix.** One normalization pass beside `normalizeGreek`: map `־`→`-`, strip Cf bidi controls, normalize niqqud if present. Kills the whole class at the boundary rather than per-regex.
- **Files.** `src/parser/parse.ts`.
- **ADR.** New ADR: "orthography normalization (maqaf, bidi controls) at the parse boundary." **Test.** unit: maqaf ratio parses `t:0.4`; bidi-wrapped input parses identically to clean; scenario for the pasted-given case.
- **Gate.** Green + shadow-matrix still clean; build clean. **Effort.** ~1 h. **Risk.** Low.

### C2 · PAR-3 — Hebrew final-ך inflections (מאונכים…)
- **Root cause.** Perpendicular keywords are `מאונך|אנך` (singular) at 5 sites (e.g. [parse.ts:3400](../src/parser/parse.ts#L3400)); plurals swap final ך→כ (מאונכ**ים**/אנכ**ים**) — different code points, so plural ⟂ matches nothing and re-triggers the ADR-119 dropped-membership bug in plural form. You already solved this shape with `חות[כך]`.
- **Fix.** One shared stem constant `מאונ[כך]|אנ[כך]` substituted at all five sites (and `SHAPE_LEFTOVER`). Audit sibling Hebrew keywords for the same final-letter inflection gap (משיק/משיקים, חוצה, etc.).
- **Files.** `src/parser/parse.ts`.
- **ADR.** New ADR: "Hebrew final-letter inflection stems in keyword sets." **Test.** unit enumerating singular+plural inflections; scenario for the plural parallel-chords sentence.
- **Gate.** Green + shadow-matrix clean; build clean. **Effort.** ~1–2 h. **Risk.** Low-med (touch several sites).

### C3 · PAR-1 — `chord`/`diameter` swallow a `=`/relation tail
- **Root cause.** `chord` ([parse.ts:2142](../src/parser/parse.ts#L2142)) and `diameter` run before every measure rule, grab the first label pair, and discard the rest — no relation guard, though the sibling `radiusSegment` already bails on `=`/`⊥`/`∥` ([parse.ts:1593](../src/parser/parse.ts#L1593)). `chord AB = 6` drops the length silently.
- **Fix.** `chord`/`diameter`/`circleOnDiameter` return `null` when the utterance carries `=`/`<`/`>` beyond the label pair. For chord, `distanceConstraint`/`equalSegments` then claim it and the ADR-119 `withChordMembership` post-pass restores membership (verified). Diameter also needs PAR-4's post-pass.
- **Files.** `src/parser/parse.ts`.
- **ADR.** New ADR: "carrier-noun rules bail on a relation tail (no half-parse)." **Test.** scenarios: `מיתר AB = 6`, `chord AB = chord CD`, `קוטר AB = 10`.
- **Gate.** Green + shadow-matrix clean; build clean. **Effort.** ~2 h. **Risk.** Med (depends on PAR-4 for diameter).

### C4 · PAR-4 — Generalize `withChordMembership` → `withCarrierMembership` (קוטר/רדיוס)
- **Root cause.** ADR-119's post-pass fires only on `chord|מיתר` ([parse.ts:3742](../src/parser/parse.ts#L3742)); the sibling nouns drop membership in relational phrasings. `הקוטר AB מאונך למיתר CD` gives no `set-collinear A,O,B`; `D אמצע הרדיוס OB` never puts B on the circle.
- **Fix.** Generalize to `withCarrierMembership`: קוטר-flavoured → `point-on-circle`×2 + `set-collinear [a, centre, b]`; רדיוס-flavoured → `point-on-circle` for the non-centre endpoint. Reuse `resolveCenter`; idempotent.
- **Files.** `src/parser/parse.ts`.
- **ADR.** New ADR (or extend ADR-119): "carrier-membership post-pass covers chord/diameter/radius." **Test.** scenarios for the three cases above.
- **Gate.** Green + shadow-matrix clean; build clean. **Effort.** ~½ day. **Risk.** Med.

### C5 · PAR-5 — `על\b` dead-code guards + missing CARRIER_NOUNs
- **Root cause.** JS `\b` never fires between a Hebrew letter and a space, so the `על\b` guards ([parse.ts:1593](../src/parser/parse.ts#L1593), [parse.ts:1504](../src/parser/parse.ts#L1504)) are dead; `נקודה D על הרדיוס OB` drops D. `קוטר`/`רדיוס` aren't in `CARRIER_NOUN` ([parse.ts:830](../src/parser/parse.ts#L830)), so `pointOnSegment` can't catch `E על הקוטר AB`.
- **Fix.** Replace `על\b` with `על(?=\s|$)` (or bare `על`); add `ה?קוטר|ה?רדיוס` to CARRIER_NOUN with the point-on rules resolving the actual carrier + membership. (Overlaps PAR-4's machinery.)
- **Files.** `src/parser/parse.ts`.
- **ADR.** Fold into PAR-4/PAR-5 ADR. **Test.** scenarios: point-on-radius, point-on-diameter.
- **Gate.** Green + shadow-matrix clean. **Effort.** ~2 h. **Risk.** Med.

### C6 · PAR-2 — Two givens in one line silently dropped
- **Root cause.** `angle` takes the first number+triple ([parse.ts:706](../src/parser/parse.ts#L706)); `distanceConstraint` is `$`-anchored so it claims only the trailing clause. `AB = 4, BC = 6` keeps only `BC = 6`; two comma-separated angles keep only the first. `chainedEquality` deliberately bails on a non-chain, then a half-parse wins.
- **Fix.** A statement-splitter pre-pass (like `compoundSuchThat`): split on top-level `,` / `וגם` / `;` / `and` when **both** sides carry a complete relation, parse each, all-or-escalate. Anchor `angle`'s value read so it can't claim a two-angle line.
- **Files.** `src/parser/parse.ts`.
- **ADR.** New ADR: "multi-statement splitter for comma-joined givens." **Test.** scenarios: `AB = 4, BC = 6`; `זווית ABC = 40, זווית DEF = 60`.
- **Gate.** Green + shadow-matrix clean. **Effort.** ~½ day. **Risk.** Med (broad — the splitter sees all input).

### C7 · PAR-8 — Plural "segments/הקטעים" steals `pointsOnSegments`
- **Root cause.** `segment` (RULES 3636) runs before `pointsOnSegments` (3637); `POINT_ON_CARRIER` recognizes only singular nouns. `points F,G,H on segments AB,AC,CB` → `[segment A,B]` alone (ADR-076's own input class). New labels do escalate, but the LLM is unreliable here and the proxy isn't deployed.
- **Fix.** Add plurals to POINT_ON_CARRIER/SEG_NOUN (`segments?|sides?`, `ה?קטעים|ה?צלעות`, plural `נקוד…`), or hoist the (strictly more specific) `pointsOnSegments` above `segment`.
- **Files.** `src/parser/parse.ts`.
- **ADR.** New ADR: "plural carrier nouns for N-points-on-N-segments." **Test.** scenarios (he+en) for the ADR-076 utterance.
- **Gate.** Green + shadow-matrix clean. **Effort.** ~2 h. **Risk.** Low-med.

### C8 · PAR-6 — Dead dedupe set → phantom area-ratio for S-leading polygons
- **Root cause.** [parse.ts:1109](../src/parser/parse.ts#L1109) `const seen = new Set()` is never `.add()`ed; the compact `S`-regex re-reads the tail of a verbose S-cornered polygon name. `שטח מרובע SABC הוא 20` → `set-area-ratio {SABC : ABC = 20}` (maximal nonsense driving the solver). S is in the auto-label pools, so it arises without the student choosing it.
- **Fix.** Populate `seen` with verbose-match label spans; skip compact matches inside them.
- **Files.** `src/parser/parse.ts`.
- **ADR.** New ADR: "area-reference dedupe (S-leading polygon)." **Test.** unit on `שטח מרובע SABC הוא 20`.
- **Gate.** Green + shadow-matrix clean. **Effort.** ~1 h. **Risk.** Low.

### C9 · PAR-9 — Rename/swap breaks letter-embedded ids; concentric circles unrepresentable
- **Root cause.** `renameInCommand` ([geoStore.ts:816](../src/store/geoStore.ts#L816)) rewrites only whole-field exact matches, so `id:'circle-O'`/`circle:'circle-O'` survive a rename of O while `hiddenCircles` IS remapped ([geoStore.ts:1315](../src/store/geoStore.ts#L1315)) — desync: a hidden circle pops back; a new "circle M" utterance refuses to build (centre M already "in ctx"); deterministic-id idempotency breaks → duplicate constructions. Also `circleId = circle-<letter>` makes concentric circles (annulus figures) unrepresentable.
- **Fix.** Make rename/swap rewrite the letter inside structured ids (`circle-X`, `bis-XYZ`, `tan-X`, `sec-XY`, `line-XY`, `perp-…`) — hiddenCircles remap shows the intent already half-exists. Longer-term (separate ADR): decouple circle identity from the centre letter (opaque id + centre lookup), unlocking concentric circles.
- **Files.** `src/store/geoStore.ts`, possibly `src/parser/parse.ts` id conventions.
- **ADR.** New ADR: "structured-id-aware rename/swap"; a follow-up ADR for opaque circle ids.
- **Test.** rename-O scenario asserting hiddenCircles + subsequent-utterance resolution stay consistent.
- **Gate.** Green; build clean. **Effort.** ~½ day (near-term); the decoupling is larger. **Risk.** Med. **Note.** Runtime behaviour was reasoned, not executed — reproduce first.

### C10 · PAR-10 / TST-3 — LLM contract tests (pairs with the fallback)
- **Root cause.** The catalog guard asserts only `parse(x).ok` context-free ([phase4.test.ts:417](../src/parser/__tests__/phase4.test.ts#L417)); the prompt's ~15 few-shot step strings ([llmShared.ts:71](../src/parser/llmShared.ts#L71)) are a hand-maintained list with no parse round-trip; 22 scenarios inject pre-parsed `{llm: AnyCommand[]}` and skip the real re-parse; `absorb` filters accumulated points with `/^[A-Z]$/` ([llm.ts:37](../src/parser/llm.ts#L37)) so subscripted `O1/O2` degrade cross-step context.
- **Fix.** (a) Refactor prompt examples into an exported `PROMPT_EXAMPLES`; test each `steps[i]` parses under a plausible ctx. (b) Extend the catalog guard with `expectType` per doc (catch a shadow that flips a line to the wrong rule while still `.ok`). (c) Migrate `{llm: AnyCommand[]}` scenarios to `{llm: string[]}` canonical lines re-parsed with `ctxOf` (the `two-circles-secant-web` scenario already shows the pattern). (d) `absorb` → `/^[A-Z]\d*$/`; fix the prompt's "single capital letters" line.
- **Files.** `src/parser/llmShared.ts`, `src/parser/llm.ts`, `phase4.test.ts`, `scenarios.test.ts`.
- **ADR.** New ADR: "LLM contract tests — prompt examples parse + canonical-string scenario mocks." **Test.** the above.
- **Gate.** Green; build clean. **Effort.** ~½ day + mechanical scenario migration. **Risk.** Low.

---

## Phase D — Engine anti-pattern (kind-whitelist duplication)

### D1 · ENG-1 — `dependsOn` should reuse `pointParents`, not a bare field list
- **Root cause.** [evaluate.ts:104](../src/engine/evaluate.ts#L104) `PT_FIELDS` is a hand-maintained string list for walking object→parent edges in coupled-solve detection, **missing** `to`, `toward`, `line`, `circle1/circle2`. It duplicates the more-complete `pointParents` switch ([step.ts:601](../src/engine/step.ts#L601)) with no exhaustiveness guard — the exact silent-drop class `carrierOf` was built to prevent. A coupled `on-segment-solved` point reachable only through an arc-midpoint/`radial-toward`/line∩circle edge is missed → "unresolved dependencies" instead of numeric routing.
- **Fix.** Export/share `pointParents` and have `dependsOn` use it (it's an exhaustive switch → a new kind forces a decision). Delete `PT_FIELDS`.
- **Files.** `src/engine/step.ts` (export), `src/engine/evaluate.ts`.
- **ADR.** New ADR: "one object→parent-points source of truth (retire PT_FIELDS)." **Test.** a coupled solved-on-segment figure whose dependency runs through a `to`/`toward`/`line` edge, asserting it routes numerically and builds.
- **Gate.** Green (incl. seed-sweep); build clean. **Effort.** ~2 h. **Risk.** Low-med (constructing the triggering figure).

### D2 · ENG-2 + REN-6 — Publish solved radii from `evaluate`; delete `pointOnCircleId`
- **Root cause.** `resolveCircle` returns the *seed* radius for `via:'free'` ([evaluate.ts:902](../src/engine/evaluate.ts#L902)), so the renderer reverse-engineers the solver-driven radius via a six-kind whitelist `pointOnCircleId` ([scene.ts:18](../src/render/scene.ts#L18)) — the strongest pure-consumer violation, and the same kind-whitelist anti-pattern (it already bit once, ADR-144).
- **Fix (root, engine-side).** `evaluate` publishes solved radii (a `radii: Map<Id, number>` beside `positions`, or bakes the solved value into the resolved circle). The renderer reads it; `pointOnCircleId` is deleted.
- **Files.** `src/engine/evaluate.ts`, `src/render/scene.ts`, consumers of `EvalOk`.
- **ADR.** New ADR: "evaluate publishes solved radii — renderer stops reconstructing solver internals." **Test.** a free-radius figure where the solved radius ≠ seed, asserting the scene draws the solved radius; the coord campaign still passes.
- **Gate.** Green (incl. render tests + seed-sweep); build clean. **Effort.** ~½ day. **Risk.** Med (touches the eval output contract; guarded by tests).

---

## Phase E — Store robustness

> Guarded by A2 (seed-sweep), A5 (perf canary), and E-phase PBT.

### E1 · STO-1 — Memoize `replay` + gate the debug snapshot on DEV
- **Root cause.** `replay(facts, seed)` is treated as free and called from four layers (dry-run, per-command execute guard, log snapshot, render) with zero memoization; the debug snapshot subscription runs a full `replay` on every `set` even in production, where the event is then discarded ([sessionLog.ts:62](../src/debug/sessionLog.ts#L62)).
- **Fix.** A tiny LRU keyed on `(factsRef, seed, overridesRef)` so dry-run/commit/render share one replay; gate the snapshot subscription on `import.meta.env.DEV` (one line — also closes the SEC-7 prod-logging leak).
- **Files.** `src/store/geoStore.ts`, `src/App.tsx`.
- **ADR.** New ADR: "replay memoization + DEV-only debug snapshot." **Test.** perf canary (A5) asserts the reduced replay count.
- **Gate.** Green; build clean. **Effort.** ~2–3 h. **Risk.** Low-med (cache invalidation — key on refs, not deep equality).

### E2 · STO-2 — Wall-clock deadline on the config search; dedupe double `meetsRequirements`
- **Root cause.** `firstSatisfyingSeed` ([geoStore.ts:565](../src/store/geoStore.ts#L565)) can run ~600 synchronous replays (2ⁿ masks × 24 + 120 + 120) and `findValidConfig` up to ~136 more, all deadline-free on the UI thread behind static text; `resolveAfterCommit` + `autoResolve` run `meetsRequirements` twice for the same `(facts, seed)`.
- **Fix.** A wall-clock budget (e.g. 2 s) on `firstSatisfyingSeed`/`findValidConfig` with an early amber exit; dedupe the double check; (longer-term) move the search to a Web Worker.
- **Files.** `src/store/geoStore.ts`, `src/App.tsx`.
- **ADR.** New ADR: "bounded config search (deadline + amber fallback)." **Test.** perf canary + a synthetic heavy figure asserting the deadline fires and the app stays responsive.
- **Gate.** Green; build clean. **Effort.** ~½ day. **Risk.** Med (behaviour change: a deadline exit shows amber where it previously froze then succeeded — acceptable, and honest).

### E3 · STO-3 — Async LLM commit race + no timeout/cancel
- **Root cause.** `submit` awaits the network then dry-runs against the pre-await snapshot but commits via `execute` reading current `get().facts` ([App.tsx:401](../src/App.tsx#L401)); only the Submit button is gated, so example chips fire concurrent submits; `llmParse` has no timeout/abort → hung proxy = permanent spinner with no cancel.
- **Fix.** Re-read `getState()` after the await and re-dry-run (or carry a facts-version epoch and abort the commit if it changed); gate every `submit` entry point on `thinking` (or queue); add `AbortController` + ~15 s timeout + a cancel affordance.
- **Files.** `src/App.tsx`, `src/parser/llm.ts`.
- **ADR.** New ADR: "LLM submit is race-safe and cancellable." **Test.** store/unit: simulate a clear/edit between dispatch and resolve → commit aborts; timeout path surfaces an error, not a stuck spinner.
- **Gate.** Green; build clean. **Effort.** ~½ day. **Risk.** Med.

### E4 · STO-4 — One undo per user action (batch commit)
- **Root cause.** `submit` commits multi-command utterances as N separate `execute` calls, each its own `set` → zundo records N entries ([geoStore.ts:1113](../src/store/geoStore.ts#L1113)); one undo removes only the last command while the row still shows ✓. `autoResolve`'s branch rewrite adds an invisible extra entry.
- **Fix.** A batch `executeMany(cmds, utterance, group)` store action committing one array in one `set` (also collapses the per-command replays — helps E1); make `autoResolve`'s fact rewrite merge into the triggering entry (zundo `pause()/resume()`).
- **Files.** `src/store/geoStore.ts`, `src/App.tsx`.
- **ADR.** New ADR: "undo granularity = one user action." **Test.** group-undo scenario (an inscribed-quad utterance → one undo removes the whole step); `phase3.test.ts` group cases.
- **Gate.** Green; build clean. **Effort.** ~½ day. **Risk.** Med.

### E5 · STO-5 — Undo restores `seed`/`radiusOverrides` (visual continuity)
- **Root cause.** History partializes facts only ([geoStore.ts:1378](../src/store/geoStore.ts#L1378)); `execute` auto-advances the seed and `autoResolve` sets it, so undo replays the reverted list at a *different* seed → the figure the student never saw (violates the "figure doesn't jump" promise). Dialed radii also survive undo.
- **Fix.** Include `seed` (and clear `radiusOverrides`) in the temporal state, or snap them back via a paired map on undo/redo.
- **Files.** `src/store/geoStore.ts`.
- **ADR.** Fold into STO-4 ADR or its own. **Test.** undo-after-auto-advance scenario asserting positions match the pre-step view.
- **Gate.** Green; build clean. **Effort.** ~2 h. **Risk.** Low-med.

### E6 · STO-6 / STO-7 — `merge` relabel bug + subscripted-point ops
- **STO-6.** `merge` still uses `f.utterance.split(F).join(T)` ([geoStore.ts:1364](../src/store/geoStore.ts#L1364)) — the exact substring corruption ADR-122 fixed for rename/swap (`F1`→`E1`), and the utterance is what ✎-edit re-parses. Fix: use `relabelUtterance` (one line) + utterance assertions in `merge.test.ts`.
- **STO-7.** Rename/swap/merge reject subscripted points because the guard is `/^[A-Z]$/` ([geoStore.ts:774](../src/store/geoStore.ts#L774)); `renameSegKey` assumes 2-char endpoints. Fix: widen to `/^[A-Z]\d*$/`, tokenize seg-key endpoints; add a rename-`O1` test.
- **Files.** `src/store/geoStore.ts`, `merge.test.ts`.
- **ADR.** New ADR (or extend ADR-122): "token-aware relabel across all ops + subscripted ids." **Effort.** ~2 h. **Risk.** Low.

### E7 · TST-4 — Store algebraic round-trip PBT
- **Root cause.** Store ops mutate facts via JSON/string rewriting — the highest-density bug area (ADR-122 was a broken relabel round-trip), yet only example-based tests exist.
- **Fix.** One test over the scenario corpus: for each committed fact list, apply op-pairs (`swap(a,b)∘swap(a,b) = identity`; `rename A→X→A = identity` incl. utterance text; disable-then-re-enable restores positions to 1e-9; permute trailing constraint-only facts → same verifier-green figure per ADR-104). No fast-check needed — the 124 scenarios are the generator.
- **Files.** new `src/store/__tests__/algebraic-properties.test.ts`.
- **ADR.** Fold into STO-6 ADR. **Gate.** Green. **Effort.** ~½ day. **Risk.** Low (may surface real round-trip bugs — the point).

---

## Phase F — Renderer / UX for the real audience (RTL Hebrew, mobile-first students; export-reliant teachers)

### F1 · REN-1 — Fix the RTL edit-menu mirror (HIGH)
- **Root cause.** [Figure.tsx:788](../src/render/Figure.tsx#L788) positions the click-anchored menu with `insetInlineStart` (resolves to `right` under the Hebrew-default `dir=rtl`) using a **physical** left-based coordinate → the menu opens far from the clicked point.
- **Fix.** Use physical `left:` for the click-anchored menu (its coordinate is physical); keep logical insets for the fixed toolbars (those are correct).
- **Files.** `src/render/Figure.tsx`.
- **ADR.** New ADR: "physical positioning for click-anchored overlays under RTL." **Test.** a render/DOM test asserting the menu's computed left tracks the click x in RTL.
- **Gate.** Green; build clean. **Effort.** ~1 h. **Risk.** Low.

### F2 · REN-4 + responsive layout — Touch support (SCOPE DECISION)
- **Root cause.** Zoom is wheel-only; a second pointer corrupts pan ([Figure.tsx:316](../src/render/Figure.tsx#L316)); the 400px fixed sidebar overflows a phone viewport (no media queries); the hover-only relations layer — the pedagogical headline — has no touch path.
- **Fix.** Track active pointers in a map → two pointers = pinch-zoom about the midpoint, one = pan; +/− zoom buttons as fallback; `width: min(400px, 100%)` + a wrap breakpoint; tap-to-toggle as the touch equivalent of `relationAt` picking and badge preview.
- **Files.** `src/render/Figure.tsx`, `src/App.tsx`.
- **ADR.** New ADR: "touch: pinch-zoom, tap-to-focus relations, responsive layout."
- **Decision.** This is the largest UX item. Options: (a) full touch support now; (b) responsive layout + +/− buttons now, pinch/tap later; (c) defer entirely. **Recommend (a) or (b)** — the audience is mobile-first and today the headline feature is unreachable on touch.
- **Gate.** Green; manual device check. **Effort.** (a) ~1–2 days; (b) ~½ day. **Risk.** Med.

### F3 · REN-3 — Export a clean clone (teachers' worksheets)
- **Root cause.** `svgToPng` clones the live SVG verbatim ([Figure.tsx:956](../src/render/Figure.tsx#L956)), baking in intersection suggestion dots, hidden-segment/point ghosts, selection highlight, and active hover marks.
- **Fix.** Render export from a purpose-built clone (strip `data-crossing`, ghosts, highlight strokes) or re-render `<Figure>` with interaction props off via `renderToStaticMarkup` (the tests already prove DOM-free render works). Consider `devicePixelRatio` instead of fixed `scale=2`.
- **Files.** `src/render/Figure.tsx`, `src/App.tsx`.
- **ADR.** New ADR: "export renders a clean, interaction-free figure." **Test.** export-clone unit asserting no `data-crossing`/ghost nodes.
- **Gate.** Green. **Effort.** ~2–3 h. **Risk.** Low.

### F4 · REN-5 — Fit hysteresis (view stability = the model stability, applied to the view)
- **Root cause.** The fit refits on every positions change ([Figure.tsx:240](../src/render/Figure.tsx#L240)) with no hysteresis — adding one out-of-bounds point (extension, tangent far crossing, grown radius) shifts and shrinks every existing point on screen, voiding the engine's stability guarantee at the view layer.
- **Fix.** Keep the previous transform while the figure still fits and its span ratio stays within a band; refit only on overflow or gross shrink; optionally animate transform transitions.
- **Files.** `src/render/Figure.tsx`, maybe `transform.ts`.
- **ADR.** New ADR: "fit hysteresis — the view is stable when the model is." **Test.** unit: adding a point inside the current band leaves the transform unchanged.
- **Gate.** Green. **Effort.** ~3 h. **Risk.** Med (tune the band).

### F5 · REN-2 — Non-passive wheel listener (stop page-scroll on zoom)
- **Root cause.** React 18 registers `wheel` passive, so `onWheel`'s `preventDefault()` is a no-op ([Figure.tsx:311](../src/render/Figure.tsx#L311)) → zooming also scrolls the page.
- **Fix.** Attach a non-passive listener in a `useEffect` on `svgRef` (`{ passive: false }`), or scroll-lock while the pointer is over the canvas.
- **Files.** `src/render/Figure.tsx`.
- **ADR.** Fold into REN-4 or standalone. **Effort.** ~½ h. **Risk.** Low.

### F6 · A11Y + honesty — Modal focus + `aria-live` on errors; broken-step reason inline
- **Root cause.** `Modal` ([Modal.tsx:20](../src/ui/Modal.tsx#L20)) has no focus trap / initial-focus / restore / `aria-labelledby`; the auto-opening intro modal leaves focus in the input behind it; `inputNote`/`lastError`/`violations` have no `aria-live`, so a screen-reader student never hears a step failed; a broken step's reason lives only in a `title` tooltip ([App.tsx:811](../src/App.tsx#L811)), invisible on touch.
- **Fix.** Focus-trap + initial/restore focus + labelled title in Modal; `role="status"`/`aria-live="polite"` on the note/error/violations spans; surface the broken-step reason inline (expandable row), not just `title`. (The ✓/✗/○ legend and per-relation amber messages are already good — keep.)
- **Files.** `src/ui/Modal.tsx`, `src/App.tsx`.
- **ADR.** New ADR: "a11y baseline — focus management + live regions." **Effort.** ~½ day. **Risk.** Low.

### F7 · REN-7/8/9/10 — Label & epsilon polish (LOW, batch)
- **REN-7.** Label placement scores against segments/circles/dots but not other labels' chosen positions ([Figure.tsx:1061](../src/render/Figure.tsx#L1061)) → labels can stack; a forced coincidence (N=O) superimposes both labels exactly. Fix: place sequentially treating placed label boxes as obstacles; offset coincident pairs to opposite sides; small bonus for last frame's direction (cross-resample hysteresis).
- **REN-8.** Absolute world-space epsilons ([scene.ts:294](../src/render/scene.ts#L294) `1e-5`; [intersections.ts:62](../src/render/intersections.ts#L62) `1e-6`) are scale-dependent (free radii grow unbounded). Fix: normalize by figure-span diagonal.
- **REN-9.** `wedgeKey` dedups by integer-rounded degrees ([scene.ts:433](../src/render/scene.ts#L433)) — a hard quantization boundary. Fix: angular-tolerance predicate against already-shown wedges.
- **REN-10.** Every `pointermove` during pan re-renders the whole SVG. Fix: hoist drawn content into a `React.memo` child keyed on `(scene, transform, zoom, highlight)` so pan touches only the `<g transform>`.
- **ADR.** One combined ADR: "renderer polish — label avoidance, span-relative epsilons, wedge tolerance, pan memoization." **Effort.** ~½–1 day total. **Risk.** Low.

---

## Master checklist

| ID | Phase | Item | Sev | Effort | ADR | Done |
|----|-------|------|-----|--------|-----|------|
| A1 / PAR-11 | A | Parser shadow-matrix test | — | ½ d | ADR-170 | ✅ |
| A2 / TST-1 | A | Seed-sweep oracle | — | ½ d | ADR-172 | ✅ |
| A3 / TST-2 | A | De-triplicate parseCtx (fixes triage bug) | — | 1–2 h | ADR-171 | ✅ |
| A4 / TST-6 | A | Verifier tolerance pinning | — | ½ h | ADR-173 | ✅ |
| A5 / TST-5 | A | Replay-count perf canary (→ do with E1, needs store change) | — | ½ h | | ☐ |
| A6 / TST-7 | A | Stray file + vitest ignore + scenario-doc parity (backfilled 34, guard added) | — | ½ h | ADR-174 | ✅ |
| B1 / SEC-1 | B | XFF last-hop | HIGH | 1 h | ADR-175 | ✅ |
| B2 / SEC-2 | B | Cost gate — global daily ceiling (LLM_DAILY_MAX) + "service busy" msg | HIGH | ½ d | ADR-177 | ✅ |
| B3 / SEC-3 | B | Fail-closed admin auth | HIGH | 1–2 h | ADR-176 | ✅ |
| B4 / SEC-4/5/6 | B | Limiter eviction + upstream timeout/concurrency + login throttle | MED | ½ d | ADR-178 | ✅ |
| B5 / SEC-7 | B | Event retention + privacy note (logs-off-Dropbox = operator action) | MED | 2 h | ADR-179 | ✅ |
| B6 / SEC-9 | B | Deploy durability (Plesk GUI) + systemd hardening | LOW | 1 h | ADR-180 | ✅ |
| C1 / PAR-7 | C | Orthography normalization | HIGH | 1 h | ADR-181 | ✅ |
| C2 / PAR-3 | C | Hebrew final-ך inflections | HIGH | 1–2 h | ADR-182 | ✅ |
| C3 / PAR-1 | C | chord `=` bail (מיתר AB=2) | HIGH | 2 h | ADR-183 | ✅ |
| C4 / PAR-4 | C | withCarrierMembership + diameter `=` bail | M-H | ½ d | ADR-184 | ✅ |
| C5 / PAR-5 | C | על guard + CARRIER_NOUN (diameter/radius) | MED | 2 h | ADR-185 | ✅ |
| C6 / PAR-2 | C | Multi-statement splitter | HIGH | ½ d | ADR-186 | ✅ |
| C7 / PAR-8 | C | Plural carrier nouns | MED | 2 h | ADR-187 | ✅ |
| C8 / PAR-6 | C | Area-ref dedupe (S-leading polygon) | MED | 1 h | ADR-188 | ✅ |
| C9 / PAR-9 | C | Structured-id rename/swap | MED | ½ d | | ☐ |
| C10 / PAR-10+TST-3 | C | LLM contract tests | L-M | ½ d | | ☐ |
| D1 / ENG-1 | D | dependsOn reuses pointParents | — | 2 h | | ☐ |
| D2 / ENG-2+REN-6 | D | Publish solved radii | MED | ½ d | | ☐ |
| E1 / STO-1 | E | Replay memoization + DEV snapshot | MED | 2–3 h | | ☐ |
| E2 / STO-2 | E | Bounded config search | MED | ½ d | | ☐ |
| E3 / STO-3 | E | Race-safe cancellable LLM submit | HIGH | ½ d | | ☐ |
| E4 / STO-4 | E | One undo per action | MED | ½ d | | ☐ |
| E5 / STO-5 | E | Undo restores seed/overrides | M | 2 h | | ☐ |
| E6 / STO-6/7 | E | merge relabel + subscripted ops | LOW | 2 h | | ☐ |
| E7 / TST-4 | E | Store round-trip PBT | — | ½ d | | ☐ |
| F1 / REN-1 | F | RTL edit-menu mirror | HIGH | 1 h | | ☐ |
| F2 / REN-4 | F | Touch (scope decision) | MED | ½–2 d | | ☐ |
| F3 / REN-3 | F | Clean export | MED | 2–3 h | | ☐ |
| F4 / REN-5 | F | Fit hysteresis | MED | 3 h | | ☐ |
| F5 / REN-2 | F | Non-passive wheel | LOW | ½ h | | ☐ |
| F6 / A11Y | F | Focus + aria-live | LOW | ½ d | | ☐ |
| F7 / REN-7/8/9/10 | F | Renderer polish batch | LOW | ½–1 d | | ☐ |

_Repo rules for every step: fix the root cause (never a symptom patch); add an ADR to [06-decisions.md](06-decisions.md); capture the operator/utterance sequence as a scenario in [scenarios.test.ts](../src/__tests__/scenarios.test.ts) + index it in [test-scenarios.md](test-scenarios.md); do not mark ready until the gate passes (tests green, build clean, results shown honestly)._
