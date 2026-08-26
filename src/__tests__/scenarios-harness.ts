/**
 * The scenario CORPUS + harness (issue #60 / ADR-280): every operator-reported bug sequence, replayed
 * end-to-end through the real parse-with-context → fact list → replay path. Moved here — a plain module,
 * NOT a test file — from scenarios.test.ts, so the runner files can shard the corpus across vitest's
 * per-file workers (the one 940 s sequential file used to bound the whole suite's wall clock, issue #60).
 *
 * ADD NEW SCENARIOS TO `SCENARIOS` BELOW (newest first, as before); every scenarios-e2e-*.test.ts slice
 * picks them up automatically (membership is index % N — no per-file registration), and the doc-parity
 * guard in scenarios.test.ts still enforces the docs/test-scenarios.md index. The standing rule
 * ("reported bugs become regression scenarios") is unchanged — only the file layout moved.
 */
/**
 * Reported-scenarios regression suite (end-to-end).
 *
 * Each scenario is the EXACT sequence of utterances the operator typed when a bug was
 * found (harvested from `logs/debug-log.jsonl`). It is replayed through the REAL pipeline —
 * parse-with-figure-context → fact list → `replay` — exactly as the app does, then asserted.
 * This catches PIPELINE-level regressions (parser context threading, rule ordering, the store
 * replay/grouping) that the parser/engine unit tests don't exercise, and gives a single,
 * readable list of the real figures we've validated (mirrored in docs/test-scenarios.md).
 *
 * STANDING RULE (see ../../CLAUDE.md): when the operator reports a bug and it is diagnosed
 * from the debug log, the fix is NOT done until the exact sequence is added here.
 *
 * A `Step` is either an utterance string (parsed deterministically, with the current figure as
 * context) or an LLM step. The LLM is mocked in tests, so an out-of-grammar step is captured from the log
 * in one of two forms:
 *   - `{ llm: ['canonical line', …] }` — the canonical command STRINGS the LLM emitted, RE-PARSED with the
 *     live figure context exactly as `llmParse` does (TST-3). PREFERRED: a parser change that breaks a
 *     canonical form is then caught, not masked by pre-baked commands.
 *   - `{ llm: [...commands] }` — pre-parsed engine commands (legacy; kept for steps whose canonical form
 *     has no clean deterministic re-parse).
 * A string step (or a canonical LLM line) that fails to parse FAILS the scenario (it would have escalated).
 */

import { expect } from 'vitest';
import { CONTEXT_FREE_GATES } from '@/app/honestyGates';
import { replay, meetsRequirements, useGeoStore } from '@/store/geoStore';
import type { Derived, Fact } from '@/store/geoStore';
import { freeDofs } from '@/engine';
import type { AnyCommand, Id, Vec } from '@/engine';
import { factsOf, replayFacts } from './scenario-pipeline';
import type { Step } from './scenario-pipeline';

// The pipeline core (Step/ctxOf/factsOf/replayFacts) moved VERBATIM to ./scenario-pipeline.ts (#567) so
// headless tools can run it without vitest; re-exported here so every existing import site is unchanged.
export { ctxOf, factsOf, replayFacts } from './scenario-pipeline';
export type { Step } from './scenario-pipeline';

export interface Scenario {
  id: string;
  title: string;
  /** The bug this sequence guards against (for the readable record). */
  guards: string;
  steps: Step[];
  check: (fig: Derived) => void;
  /** Opt out of the blanket "the figure satisfies its stated givens" assertion (rare — only when a
   *  scenario intentionally builds a figure the verifier flags, e.g. a documented known-limitation). */
  expectViolations?: boolean;
}

/** Replay a scenario through the real parse→fact→replay path and return the derived figure. */
export function run(steps: Step[]): Derived {
  return replayFacts(factsOf(steps));
}

// ── the seed-sweep oracle ──────────────────────────────────────────────────
/**
 * Seed-sweep oracle ([docs/15-hardening-plan.md](../../docs/15-hardening-plan.md) A2 / TST-1).
 *
 * The `run` check tests each scenario at ONE seed (the app's default, `firstSatisfyingSeed`). But the
 * dominant historical escape class is *wrong-configuration-at-another-seed* — a figure that builds clean
 * yet is geometrically wrong in some OTHER valid draw the student can reach via "show another
 * configuration" (ADR-085/098/127/166 all shipped past seed-0 suites). This re-runs each scenario's OWN
 * geometric `check` — the independent oracle that already exists — at EVERY seed the app would actually
 * DISPLAY (`meetsRequirements` true), asserting the ground-truth relations hold in every shown config,
 * not just the default one.
 *
 * Scope (principled, not arbitrary): only scenarios with FREE DOFs are swept — a determined figure is
 * seed-invariant, so the single-seed check already covers it. Heavy figures are skipped and LOGGED (no
 * silent caps — repo rule). A scenario whose `check` asserts a CONFIG-SPECIFIC fact (a branch / vertex
 * order that legitimately varies) opts out via {@link SEED_SWEEP_EXEMPT}.
 *
 * CO-LOCATED (ADR-394): this runs inside the per-scenario e2e test, against the fact list that test
 * already built, so the seed-0 solve is a fold-memo hit and only the extra seeds cost anything (measured:
 * a same-facts different-seed replay is ~5% of a cold one). It used to be one corpus-wide `it()` in its
 * own file, which re-paid every cold solve — 601 s, the single largest test in the suite.
 */

/**
 * CONFIG-SPECIFIC scenarios exempt from the seed-sweep — their `check` asserts a value that legitimately
 * VARIES across the valid configs "show another configuration" reaches (a free radius, an unstated
 * extension distance, an arc position, a size-dependent separation / convexity gap), so it can only hold at
 * the default seed. Their geometric INVARIANTS (angle relations, on-circle membership, collinearity) DO
 * hold across seeds — verified when this oracle was built; only the config-pinned numbers move. The
 * single-seed check still guards each at its default. (Kept as ONE legible list, id → why.)
 */
export const SEED_SWEEP_EXEMPT: Record<string, string> = {
  'symbolic-2alpha-drives-shape-not-the-fixed-point': 'D is on an UNSTATED extension (המשך BC, no distance) — an ADR-052 free DOF, so its t legitimately varies; the ∠BOC=2∠CAD invariant holds every seed',
  'two-collinear-chain-solves': 'the check pins circle P’s radius (|PD|≈3.6) — a free-radius DOF that varies across views',
  'line-through-intersection-collinear': 'pins |PC| to the default free radius; the collinearity invariant holds every seed',
  'second-intersection-avoids-shared-point': 'pins E’s distance to the default radius and a size-dependent A–C separation; E stays on the circle',
  'redefine-existing-point-onto-circle': 'the E–A separation (>0.5) scales with the free radii; E stays ON circle P and A,C,E collinear every seed',
  'point-on-arc-no-midpoint-word': 'a FREE point on the arc — its position varies by design (ADR-042); no fixed arc coordinate is an invariant',
  'perp-constraint-keeps-quad-convex': 'the convex-gap threshold (15°) is stricter than the app’s displayable-convexity gate; a valid ~12° corner appears at some seeds',
  'tangent-chord-bisector': 'same convex-gap threshold vs the displayable gate — a valid tight corner at one seed',
  'tangent-secant-detection-honours-valid-configs': 'the check runs detectRelations/detectShapes, which sample the figure internally across their own seeds — the ground-truth relations it asserts are seed-invariant by construction, so a per-display-seed re-run only repeats the same internal detection',
};

/**
 * KNOWN-HEAVY scenarios (a single replay is slow — coupled solves / reflection sweeps / large corpora),
 * pre-skipped so the default sweep doesn't pay their cost even to MEASURE them. The `THRESHOLD_MS` guard
 * in {@link sweepSeeds} still auto-catches any NEW heavy scenario. Populated from the sweep's own timing
 * log; each is swept only in the deep pass (`SEED_SWEEP_MULT` set). Their default config is still guarded
 * by the per-scenario e2e check.
 */
export const SEED_SWEEP_HEAVY = new Set<string>([
  'segment-meet-lands-on-segments', 'emergent-shapes-through-crossings', 'incircle-of-trapezoid-flexes-tangential',
  'area-ratio-converges-points-allowed', 'driven-extension-point-stays-beyond', 'q4-constraints-order-independent',
  'collinear-flexes-redundant-carrier-kite-tangents', 'diameter-from-point-cuts-side-onto-segment',
  'alpha-less-than-beta-reshapes', 'kite-tangents-redundant-equality-not-over-constrained',
]);

/**
 * Run the seed sweep for ONE scenario over the fact list its e2e check already built. Throws (failing that
 * scenario's own test) if any displayable config violates the scenario's check — so a cross-seed break is
 * attributed to the scenario that broke, instead of being pooled into one corpus-wide failure list.
 */
export function sweepSeeds(sc: Scenario, facts: Fact[]): void {
  const deep = !!process.env.SEED_SWEEP_MULT;
  const N = Number(process.env.SEED_SWEEP_MULT) || 3; // seeds 0..N-1; a cross-seed bug shows at a low seed
  // A seed's replay slower than this ⇒ a heavy coupled figure; stop sweeping it and LOG (the backstop that
  // auto-catches a NEW heavy scenario). NOTE it measures a SWEPT seed, not `replay(facts, 0)` as the
  // pre-ADR-394 standalone oracle did: co-located, seed 0 is a memo hit and would always time at ~0 ms,
  // silently disabling this guard. A swept seed is also the honest number — it IS the marginal cost.
  const THRESHOLD_MS = 700;
  if (sc.expectViolations || SEED_SWEEP_EXEMPT[sc.id]) return; // intentional-flag / config-specific → not this oracle
  if (!deep && SEED_SWEEP_HEAVY.has(sc.id)) return; // known-heavy, listed above (visible, not silent)
  const base = replay(facts, 0);
  if (freeDofs(base.construction).length === 0) return; // determined ⇒ seed-invariant; the single-seed check covers it

  const failures: string[] = [];
  for (let s = 0; s < N; s++) {
    if (!meetsRequirements(facts, s)) continue; // the app would not display this config
    const t0 = performance.now();
    const fig = replay(facts, s);
    const elapsed = performance.now() - t0;
    try {
      sc.check(fig);
    } catch (e) {
      failures.push(`seed ${s}: ${(e as Error).message.split('\n')[0]}`);
    }
    if (elapsed > THRESHOLD_MS && s + 1 < N) {
      // No silent caps: a newly-heavy scenario announces itself and names the list to add it to.
      // eslint-disable-next-line no-console
      console.log(`seed-sweep: [${sc.id}] stopped after seed ${s} (${Math.round(elapsed)}ms/replay) — add to SEED_SWEEP_HEAVY`);
      break;
    }
  }
  expect(failures, `[${sc.id}] configs the app would display but that fail the scenario check:\n${failures.join('\n')}`).toEqual([]);
}

// ── E7 / TST-4: algebraic round-trip properties ────────────────────────────
/**
 * Algebraic ROUND-TRIP properties over the scenario corpus (ADR-206). Store ops mutate facts via
 * JSON/string rewriting — historically the highest-density bug area (ADR-122's relabel corruption; the
 * review's S1 partial structured-id rename) — yet only example-based tests existed. The real scenarios
 * ARE the generator (no fast-check needed):
 *   1. swap(a,b) ∘ swap(a,b) = identity (commands AND utterances byte-equal);
 *   2. rename A→Z9 ∘ rename Z9→A = identity;
 *   3. disable-then-re-enable a fact restores the exact figure (replay is deterministic in content);
 *   4. permuting two trailing constraint-only sibling groups leaves the figure verifier-clean
 *      (ADR-104 order-independence, exercised on real corpora).
 *
 * CO-LOCATED (ADR-394): runs against the fact list the scenario's e2e check already built. Properties
 * 1–3 then cost almost nothing (string ops + fold-memo hits), so they now run over the WHOLE corpus
 * instead of the old `SCENARIOS.slice(0, 40)` / `slice(0, 12)` samples — broader coverage, less time.
 * Property 4 genuinely re-solves (a permuted fact list is new content, so a new memo key), hence a
 * per-slice cap. Standalone, these three tests cost 765 s, most of it re-deriving facts the shards had
 * already derived.
 */
export interface RoundTripCounters {
  swapped: number;
  renamed: number;
  toggled: number;
  permuted: number;
}
export const newRoundTripCounters = (): RoundTripCounters => ({ swapped: 0, renamed: 0, toggled: 0, permuted: 0 });

const pointLabelsOf = (facts: Fact[]): string[] => {
  const set = new Set<string>();
  for (const f of facts)
    for (const [k, v] of Object.entries(f.cmd)) {
      if (k === 'expr' || k === 'type') continue;
      for (const e of Array.isArray(v) ? v : [v]) if (typeof e === 'string' && /^[A-Z]\d*$/.test(e)) set.add(e);
    }
  return [...set];
};
const snapshot = (facts: Fact[]) =>
  JSON.stringify(facts.map((f) => ({ cmd: f.cmd, utterance: f.utterance, enabled: f.enabled })));

/**
 * Run the round-trip properties for ONE scenario, tallying what was actually exercised into `c` so the
 * slice can assert it didn't silently stop exercising them (the "no silent caps" repo rule).
 * `permCap` bounds property 4's genuinely-new solves per slice.
 */
export function roundTripProps(sc: Scenario, facts: Fact[], c: RoundTripCounters, permCap = 2): void {
  const store = () => useGeoStore.getState();
  const before = snapshot(facts);
  const labels = pointLabelsOf(facts);

  // 1 + 2 — swap∘swap and rename∘rename⁻¹ are identities (Z9 is never a scenario label).
  if (labels.length >= 2) {
    const [a, b] = labels;
    useGeoStore.setState({ facts });
    if (store().swap(a, b).ok) {
      store().swap(a, b);
      expect(snapshot(store().facts), `[${sc.id}] swap(${a},${b}) twice must be the identity`).toBe(before);
      c.swapped++;
    }
    useGeoStore.setState({ facts });
    if (store().rename(a, 'Z9').ok) {
      expect(store().rename('Z9', a).ok).toBe(true);
      expect(snapshot(store().facts), `[${sc.id}] rename ${a}→Z9→${a} must be the identity`).toBe(before);
      c.renamed++;
    }
  }

  // 3 — disable then re-enable the last fact restores the exact figure.
  if (facts.length >= 2) {
    const baseline = replay(facts, 0);
    useGeoStore.setState({ facts, seed: 0 });
    const target = store().facts[store().facts.length - 1];
    store().toggle(target.id);
    store().toggle(target.id);
    const after = replay(store().facts, 0);
    expect(after.lastError, `[${sc.id}] re-enable must restore a clean build`).toBe(baseline.lastError);
    for (const [id, p] of baseline.positions) {
      const q = after.positions.get(id);
      expect(q, `[${sc.id}] ${id} exists after the round-trip`).toBeTruthy();
      expect(Math.hypot(p.x - q!.x, p.y - q!.y), `[${sc.id}] ${id} restored`).toBeLessThan(1e-9);
    }
    c.toggled++;
  }

  // 4 — permuting two trailing constraint-only groups keeps the figure verifier-clean (ADR-104).
  const isConstraintOnly = (f: Fact) => f.cmd.type.startsWith('set-');
  const n = facts.length;
  if (c.permuted < permCap && !sc.expectViolations && n >= 3) {
    const [x, y] = [facts[n - 2], facts[n - 1]];
    if (isConstraintOnly(x) && isConstraintOnly(y) && x.group !== y.group) {
      const base = replay(facts, 0);
      if (base.lastError === null && base.violations.length === 0) {
        const fig = replay([...facts.slice(0, n - 2), y, x], 0);
        expect(fig.lastError, `[${sc.id}] trailing-constraint order must not matter`).toBeNull();
        expect(fig.violations, `[${sc.id}] permuted figure stays verifier-clean`).toEqual([]);
        c.permuted++;
      }
    }
  }

  useGeoStore.getState().clear();
}

// ── check helpers ──────────────────────────────────────────────────────────
export const at = (fig: Derived, id: Id): Vec => {
  // An UNNAMED circle's centre is anonymous under ADR-342 ('@ctr-O') — checks written before that may
  // reference it by its token letter; resolve the fallback so geometric asserts keep reading naturally.
  // (The PROMOTION semantics — when the letter becomes a real point — are locked strictly in
  // anon-centre.test.ts, so this fallback can't mask a promotion regression.)
  const v = fig.positions.get(id) ?? fig.positions.get(`@ctr-${id}`);
  if (!v) throw new Error(`no position for "${id}"`);
  return v;
};
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
/** The CENTRE POINT id of a circle — by its reference letter, or the sole circle when omitted. Under
 *  ADR-342 an UNNAMED circle's centre is anonymous ('@ctr-O'), so a check must resolve it from the
 *  construction instead of assuming the literal letter. */
export const centreOf = (fig: Derived, letter?: string): Id => {
  const circles = fig.construction.objects.filter((o): o is Extract<typeof o, { kind: 'circle' }> => o.kind === 'circle' && !(o as { center: string }).center.startsWith('~'));
  const hit = letter
    ? circles.find((c) => (c as { center: string }).center === letter || (c as { center: string }).center === `@ctr-${letter}` || c.id === `circle-${letter}`)
    : circles[0];
  if (!hit) throw new Error(`no circle${letter ? ` for "${letter}"` : ''} in the figure`);
  return (hit as { center: Id }).center;
};
export const angle = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180) / Math.PI;
};
/** Every enabled step applied cleanly (no silent drop / over-constraint). */
export const allStepsOk = (fig: Derived) => {
  for (const [id, s] of Object.entries(fig.status)) expect(s, `status of step ${id}`).toBe('ok');
  expect(fig.lastError).toBeNull();
};
/** The quad's named vertices are in convex cyclic order around centre O (none collapsed/crossed). */
export const convexQuad = (fig: Derived, ids: [Id, Id, Id, Id], center: Id, minGapDeg = 15) => {
  const o = at(fig, center);
  const ang = (p: Vec) => (Math.atan2(p.y - o.y, p.x - o.x) + 2 * Math.PI) % (2 * Math.PI);
  const order = ids.map((id) => ang(at(fig, id)));
  for (let i = 0; i < 4; i++) {
    const gap = (order[(i + 1) % 4] - order[i] + 2 * Math.PI) % (2 * Math.PI);
    expect(gap, `gap after vertex ${ids[i]}`).toBeGreaterThan((minGapDeg * Math.PI) / 180);
  }
};

/**
 * Corpus-wide FALSE-POSITIVE net for the honesty-gate BATTERY (#456/ADR-430; widened by #771).
 *
 * A honesty gate is only as good as its generosity: one that refuses working input is strictly worse
 * than the silent drop it replaces, and 3-D's first draft of the construct-noun gate false-flagged 28
 * working inputs. Every committed step of every reported-bug scenario is, by definition, input that
 * must keep working — so the whole corpus doubles as the net. Runs against the fact list the shard
 * already built, so it costs no extra solve (ADR-394: a corpus-wide property lives HERE, called
 * per-scenario, never in a new file that would re-pay every cold replay).
 *
 * #771 WIDENED IT FROM ONE GATE TO THE WHOLE CONTEXT-FREE BATTERY. The parallelogram false block
 * (`מקביל` matching inside `מקבילית`) was invisible to every net we had: `gate-false-positives.test.ts`
 * only reaches lines that appear in the CATALOG, and this net only ran `droppedConstructNoun` — so a
 * corpus scenario could commit a step the submit path would have refused, and nothing said so. The
 * membership rule is mechanical: every gate that is a pure function of `(utterance, commands)` runs
 * here. The context-carrying gates (`droppedNewLabels`, `introducedNewLabels`) are deliberately out —
 * they need the figure's existing points / the LLM's canonical lines, which are not this net's inputs.
 *
 * Counts the steps AND the gate calls it actually made, so a signature change cannot make it pass
 * vacuously.
 */
/**
 * #782 — the gate list is IMPORTED from the shared battery (`@/app/honestyGates`), never re-listed here.
 * A net with its own copy measures the gates it happens to know about; this one measures the gates the
 * app actually runs, so a gate cannot be born un-netted and the two cannot drift apart.
 */
export { CONTEXT_FREE_GATES };

/**
 * #771 — the KNOWN, PRE-EXISTING false blocks the widened net surfaced on its first run.
 *
 * Every entry is a step that PARSES correctly and is then refused by an honesty gate, i.e. a supported
 * construct escalating to the paid LLM. All four were measured to behave identically on `main` before
 * this issue's fix, so none is a regression from it — they are what the net was blind to while it ran
 * a single gate. They are NOT fixed here: this round item is #771, and inventing a diagnosis for four
 * more gates to keep the loop moving is exactly what the escalation rule forbids. They are filed.
 *
 * The entry is a LEDGER, not a mute: an exemption asserts that the step still FAILS, so whoever fixes
 * one is told by a red test to delete its row. A silenced cell is indistinguishable from a cell nobody
 * checked — the lesson #140 was filed to record.
 */
const KNOWN_GATE_FALSE_BLOCKS: { scenario: string; gate: string; utterance: string; issue: string; why: string }[] = [
  {
    scenario: 'tangent-circles-named-then-circumference',
    gate: 'droppedGivenNumbers',
    utterance: 'היקף מעגל O1 הוא 6pi',
    issue: '#784',
    why: 'a DERIVED magnitude: the circumference given lowers to the radius it implies (set-radius value:3), so the stated 6 appears in no command. «6π» with the SYMBOL escapes; the word «6pi» and a plain «6» do not.',
  },
  {
    scenario: 'tangent-from-external-D-then-pinned-by-extension',
    gate: 'droppedGivenVerbs',
    utterance: 'המשך CA נפגש עם המשיק בנקודה D',
    issue: '#785',
    why: 'the tangent is REFERENCED, not stated: the lowering is a bare set-line onto the already-drawn tangent, so no tangency token is minted and the family-presence fallback finds no evidence.',
  },
  {
    scenario: 'incremental-midsegment-resolves-triangle-from-figure',
    gate: 'droppedGivenVerbs',
    utterance: 'GE קטע אמצעים מקביל ל AB',
    issue: '#785',
    why: 'the midsegment lowering (midpoint, midpoint, segment) ENCODES the parallelism by construction — the midsegment theorem — so no `parallel` command is emitted and the gate reads the stated «מקביל» as dropped.',
  },
  {
    scenario: 'corner-tangent-circle',
    gate: 'droppedGivenVerbs',
    utterance: 'AB ו- AD משיקים למעגל O',
    issue: '#785',
    why: 'the corner-tangent lowering encodes tangency STRUCTURALLY (bisector + two feet + circle-through). The #226 structural pass covers foot+point-on-circle, not foot+circle-through, so the evidence walk finds nothing.',
  },
  {
    scenario: 'corner-tangent-circle-grows-to-vertex',
    gate: 'droppedGivenVerbs',
    utterance: 'AB ו- AD משיקים למעגל O',
    issue: '#785',
    why: 'same utterance and same lowering as `corner-tangent-circle`.',
  },
];

export function gateProps(sc: Scenario, facts: Fact[], c: { gateChecked: number }): void {
  const key = (f: Fact) => f.group ?? f.id;
  const order: string[] = [];
  const byGroup = new Map<string, { utterance: string; cmds: AnyCommand[] }>();
  for (const f of facts) {
    const k = key(f);
    if (!byGroup.has(k)) { byGroup.set(k, { utterance: f.utterance ?? '', cmds: [] }); order.push(k); }
    byGroup.get(k)!.cmds.push(f.cmd);
  }
  for (const g of order) {
    const { utterance, cmds } = byGroup.get(g)!;
    c.gateChecked++;
    for (const [name, gate] of Object.entries(CONTEXT_FREE_GATES)) {
      const v = gate(utterance, cmds);
      const clean = typeof v === 'boolean' ? !v : v.length === 0;
      const known = KNOWN_GATE_FALSE_BLOCKS.find((k) => k.scenario === sc.id && k.gate === name && k.utterance === utterance);
      if (known) {
        // Non-vacuous by construction: the ledger entry must still be TRUE, so a fix turns this red
        // and the row gets deleted rather than quietly outliving the defect it documents.
        expect(
          clean,
          `[${sc.id}] ${name} on «${utterance}» is a KNOWN false block (${known.issue}) that now PASSES — delete its row from KNOWN_GATE_FALSE_BLOCKS`,
        ).toBe(false);
        continue;
      }
      expect(
        clean,
        `[${sc.id}] ${name} must not refuse a working step: «${utterance}» → ${JSON.stringify(v)}`,
      ).toBe(true);
    }
  }
}

// ── the scenarios (newest first) ───────────────────────────────────────────
