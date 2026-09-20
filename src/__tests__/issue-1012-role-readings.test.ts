/**
 * #1012 — A ROLE-ASSIGNED LETTER RUN IS RE-READ BEFORE IT IS REFUSED.
 *
 * Operator, 2026-09-15 (round #1006 T3): *"ODC is not drawn but CDO is. When drawing a quarter of a
 * circle, it is not clear what order of nodes to enter so I think the tool should not assume one. So
 * user enters ODC and cannot find a config for that, but it can find a config for CDO so it should
 * propose that one."*
 *
 * Measured on his figure before the fix — «ABC משולש ישר זוית» · «AC=15» · «BC=10» · «O על AC» ·
 * «D על CB» — all six spellings of ONE drawable quarter:
 *
 * ```
 * ODC  centre O   refused   16.6 s        DOC  centre D   refused   19.5 s
 * OCD  centre O   refused   11.1 s        CDO  centre C   BUILDS     1.1 s
 * DCO  centre D   refused   19.3 s        COD  centre C   BUILDS     0.8 s
 * ```
 *
 * Only the CENTRE matters — the arms are interchangeable — so there are three readings, not six, and
 * the refusal blamed the student's «O על AC» for a figure that was perfectly drawable.
 *
 * Two things are locked, and they are different. The run must be **re-read and adopted** so the
 * figure builds; and the adoption must be **taught**, because a silent re-reading is the #778
 * violation this fix is not allowed to commit in the course of fixing a refusal.
 *
 * These run through the REAL submit pipeline, which is where the mechanism lives — a test against
 * `roleReadings` alone would pass while the pipeline forgot to call it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import { runSubmit } from '@/app/submitPipeline';
import type { SubmitDeps } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { parse, buildParseCtx } from '@/parser';
import { honoursConstruct, roleReadings } from '@/app/roleReadings';
import { trialFacts } from '@/store/geoStore';

function harness() {
  const notes: string[] = [];
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    locale: 'he',
    ui: {
      setInputNote: (m) => notes.push(m),
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => {},
      setBusy: () => {},
    },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
  return { deps, notes: () => notes.filter(Boolean) };
}

/** The operator's own setup, to the line before the quarter. */
const SETUP = ['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'O על AC', 'D על CB'];

/** The same setup, built synchronously through the parser — all the probe and the guard need. */
function buildSync(lines: string[]) {
  let facts = useGeoStore.getState().facts;
  let fig = replay(facts, 0);
  for (const u of lines) {
    const r = parse(u, buildParseCtx(fig.construction, fig.positions));
    expect(r.ok, `setup parses: ${u}`).toBe(true);
    if (!r.ok) continue;
    facts = trialFacts(facts, r.commands);
    fig = replay(facts, 0);
  }
  return { facts, fig };
}

async function build(lines: string[]) {
  const h = harness();
  for (const u of lines) await runSubmit(u, h.deps);
  return h;
}

/** What the figure holds, as a comparable shape — so two spellings can be asserted EQUAL. */
function figureShape() {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const at = (id: string) =>
    d.positions instanceof Map ? d.positions.get(id) : (d.positions as Record<string, { x: number; y: number }>)[id];
  const len = (a: string, b: string) => {
    const [A, B] = [at(a), at(b)];
    return A && B ? Math.hypot(A.x - B.x, A.y - B.y).toFixed(4) : null;
  };
  /**
   * Ids are compared with each one's trailing letter-run SORTED, so `arc-DO` and `arc-OD` read as the
   * same object. Which arm is written first is a naming detail of the spelling, not a difference in
   * the figure -- and the claim under test is that the FIGURE is the same.
   */
  const canonicalId = (id: string) =>
    id.replace(/[A-Z](?:[0-9]?[A-Z])+[0-9]?$/, (run) => (run.match(/[A-Z][0-9]?/g) ?? []).sort().join(''));
  return {
    arms: [len('C', 'O'), len('C', 'D')],
    ids: d.construction.objects.map((o) => canonicalId(o.id)).sort(),
  };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

describe('#1012 — the figure decides the roles, not the typing order', () => {
  it('«רבע מעגל ODC» builds the SAME figure «רבע מעגל CDO» builds', { timeout: 300000 }, async () => {
    await build([...SETUP, 'רבע מעגל CDO']);
    const canonical = figureShape();
    expect(canonical.arms[0], 'the canonical spelling builds at all').not.toBeNull();

    useGeoStore.getState().clear();
    await build([...SETUP, 'רבע מעגל ODC']);
    const adopted = figureShape();
    // The operator's point exactly: his spelling must produce the figure, not a refusal.
    expect(adopted.ids, 'the same objects are built').toEqual(canonical.ids);
    /**
     * The arms are EQUAL TO EACH OTHER -- that is what makes it a quarter, and it is centred on C.
     * They are deliberately NOT asserted equal to the canonical spelling's arms: this quarter's
     * radius is an unstated magnitude, so it is a free DOF that the sampler may place differently
     * (ADR-052). Pinning it here would lock in a default the student never gave, which is the
     * cardinal sin this codebase names first.
     */
    expect(adopted.arms[0]).toBe(adopted.arms[1]);
    expect(canonical.arms[0]).toBe(canonical.arms[1]);
  });

  it('the adoption is TAUGHT — the step names the spelling it actually built', { timeout: 300000 }, async () => {
    const h = await build([...SETUP, 'רבע מעגל ODC']);
    const hint = h.notes().find((n) => n.startsWith('input.canonicalHint'));
    expect(hint, 'a silent re-reading is the #778 violation').toBeDefined();
    // The CENTRE leads the run it taught — which arm is written first is not the point, and
    // pinning one would lock in this implementation's rotation rather than the promise.
    expect(hint).toMatch(/רבע מעגל C[OD][OD]/);
  });

  it('a spelling that was ALREADY right is not re-read, and is not taught', { timeout: 300000 }, async () => {
    const h = await build([...SETUP, 'רבע מעגל CDO']);
    expect(h.notes().find((n) => n.startsWith('input.canonicalHint'))).toBeUndefined();
  });

  it('the probe puts the satisfiable reading FIRST — the cost is one dry run, not three', () => {
    /**
     * The cost control, asserted rather than trusted (#259's burn: a concluded infeasibility paying
     * the full ladder). Each WRONG reading costs 11-19 s and the right one ~1 s, so the ORDER is the
     * fix. Measured on this figure: the angle at C is 90 degrees at every configuration because C
     * rides the triangle's right angle, while at O and D it varies and is never 90.
     */
    const { facts, fig } = buildSync(SETUP);
    const stated = parse('רבע מעגל ODC', buildParseCtx(fig.construction, fig.positions));
    expect(stated.ok).toBe(true);
    if (!stated.ok) return;
    const readings = roleReadings('רבע מעגל ODC', stated.commands, (seed) => replay(facts, seed).positions);
    expect(readings, 'a quarter circle carries a role run').not.toBeNull();
    /**
     * C is FIRST, which is the whole cost claim: the reading that builds is the one dry run spent.
     * D also out-scores the stated O and is kept as a second candidate, but it is never reached
     * because C succeeds -- so the 11-19 s ladder runs are not paid.
     */
    expect(readings![0].centre).toBe('C');
    expect(readings![0].score).toBeCloseTo(0, 6);
    expect(readings!.map((x) => x.centre)).not.toContain('O'); // never re-tries what was stated
    expect(readings![0].utterance).toMatch(/^רבע מעגל C[OD][OD]$/);
  });

  it('an utterance with NO role run costs nothing — the probe declines', () => {
    const fig = replay([], 0);
    const r = parse('משולש ABC', buildParseCtx(fig.construction, fig.positions));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(roleReadings('משולש ABC', r.commands, () => new Map())).toBeNull();
  });

  it('a reading that BUILDS but does not honour the construct is NOT adopted', { timeout: 300000 }, async () => {
    /**
     * The guard that keeps this fix from being worse than the bug. `dryRunOutcome`'s `produced` means
     * SOMETHING was built, not that the construct's promise holds: measured on this figure,
     * «רבע מעגל CAB» comes back `produced: true` with its two radii at **15 and 10**, because `AC=15`
     * and `BC=10` are both pinned. A quarter circle cannot have two different radii.
     *
     * Answering a refusal with a wrong figure is strictly worse than the refusal it replaced, so a
     * reading is adopted only if the figure it builds honours what it claims to be.
     *
     * (That «רבע מעגל CAB» is drawn at all on the DIRECT path is a pre-existing defect of the
     * construct, measured identically on `origin/main` and filed separately — it is not this
     * mechanism's to fix, but it is precisely what this mechanism must not spread.)
     */
    const { facts, fig } = buildSync(SETUP);
    const cab = parse('רבע מעגל CAB', buildParseCtx(fig.construction, fig.positions));
    expect(cab.ok).toBe(true);
    if (!cab.ok) return;
    const after = replay(trialFacts(facts, cab.commands), 0);
    expect(honoursConstruct(cab.commands, after.positions), 'radii 15 and 10 are not one circle').toBe(false);
  });

  it('when no alternative reading is honest, nothing is adopted and nothing is taught', { timeout: 300000 }, async () => {
    // «רבע מעגל ABC»: the only better-scoring reading is C, whose arms are the pinned 15 and 10.
    const h = await build([...SETUP, 'רבע מעגל ABC']);
    expect(h.notes().find((n) => n.startsWith('input.canonicalHint'))).toBeUndefined();
  });
});
