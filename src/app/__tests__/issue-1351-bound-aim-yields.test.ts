/**
 * #1351 ([ADR-547](../../../docs/06-decisions.md#adr-547)) — A BOUND'S DRAWING AIM YIELDS TO THE GIVENS.
 *
 * «משולש ABC» «BC ≥ 10» «BC = 10» built at ONE seed in sixteen, and the shared sample pool collapsed to a
 * single configuration — so «הציגו תצורה אחרת» had nothing to offer and #1349's «כבר קיים» note was lost
 * (`impliedByPrior` fails open below three samples, ADR-542). Measured at the base, one failing seed:
 * the joint solve CONVERGED to BC ≈ 10.2–10.4 — the edge of ADR-390's aim zone — and the accept gate
 * then rejected `|BC| = 10`. The bound's visible-gap preference was out-pulling a given.
 *
 * The class is wider than an equality on the same measure, and the rows below say so: a pin INSIDE the
 * aim band (`BC = 10.1`), a pin by an equality chain (`AB = BC`, `AB = 10`) and a pin by derivation
 * (a 6-8-10 right triangle typed after `BC ≥ 10` — refused at EVERY seed before) are all the same defect.
 * The fix is one rung in the driven solvers: when no configuration satisfies the givens WITH the aim, the
 * aim drops and the bound costs only its distance outside its own inequality.
 *
 * Runs against the REAL store, parser, replay and submit pipeline — only the LLM call is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({
  llmParse: (...args: unknown[]) => llmParseMock(...args),
}));

import { factsOf } from '@/__tests__/scenario-pipeline';
import { meetsRequirements, replay, sharedSamples } from '@/replay/core';
import { jointCostTerm } from '@/engine/solve';
import type { Constraint, Vec } from '@/engine';
import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { useGeoStore } from '@/store/geoStore';

const SEEDS = 24;
const len = (p: Map<string, Vec>, a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);

/** How many of the first 24 seeds give a configuration the student can be shown (the button's own bar). */
function seedsThatBuild(steps: string[]): number {
  const facts = factsOf(steps as never);
  let n = 0;
  for (let s = 0; s < SEEDS; s++) if (meetsRequirements(facts, s)) n++;
  return n;
}
/** The shared pool's size and how many genuinely DIFFERENT triangles it holds (by their side lengths). */
function pool(steps: string[]) {
  const p = sharedSamples(factsOf(steps as never));
  const shapes = new Set(p.samples.map((pos) => [len(pos, 'A', 'B'), len(pos, 'A', 'C'), len(pos, 'B', 'C')].map((v) => v.toFixed(3)).join('|')));
  return { size: p.samples.length, distinct: shapes.size };
}

describe('#1351 — the issue\'s table: a value ON a non-strict bound samples like any other figure', () => {
  it.each([
    ['ON the bound', ['משולש ABC', 'BC ≥ 10', 'BC = 10']],
    ['ON, then a right angle', ['משולש ABC', 'BC ≥ 10', 'BC = 10', '∠ABC = 90']],
    ['the pin typed first', ['משולש ABC', 'BC = 10', 'BC ≥ 10']],
    ['an upper bound, ON', ['משולש ABC', 'BC ≤ 10', 'BC = 10']],
    ['a range, ON its low end', ['משולש ABC', '10 ≤ BC ≤ 20', 'BC = 10']],
    ['a pin INSIDE the aim band — not the equality case', ['משולש ABC', 'BC ≥ 10', 'BC = 10.1']],
    ['pinned through an equality chain', ['משולש ABC', 'BC ≥ 10', 'AB = BC', 'AB = 10']],
  ])('%s — builds at every seed, and the pool holds ≥ 3 distinct configurations', (_name, steps) => {
    expect(seedsThatBuild(steps)).toBe(SEEDS);
    const p = pool(steps);
    expect(p.size).toBe(16);
    expect(p.distinct).toBeGreaterThanOrEqual(3);
  });

  it('INSIDE the bound is unchanged — 24/24, a full pool of 16', () => {
    const steps = ['משולש ABC', 'BC ≥ 10', 'BC = 40'];
    expect(seedsThatBuild(steps)).toBe(SEEDS);
    expect(pool(steps).size).toBe(16);
  });

  /**
   * The derived pin — a 6-8-10 right triangle whose hypotenuse is BC — was refused at EVERY seed when
   * `BC ≥ 10` came first (`∠BAC = 90° cannot hold`), while the reverse order built: satisfiability
   * depended on entry order, docs/17 M2's first law. It is determined, so its pool is the admissible set.
   */
  it.each([
    ['bound first', ['משולש ABC', 'BC ≥ 10', 'AB = 6', 'AC = 8', '∠BAC = 90']],
    ['bound last', ['משולש ABC', 'AB = 6', 'AC = 8', '∠BAC = 90', 'BC ≥ 10']],
  ])('a pin by DERIVATION (%s) builds at every seed', (_name, steps) => {
    expect(seedsThatBuild(steps)).toBe(SEEDS);
    const fig = replay(factsOf(steps as never), 0);
    expect(len(fig.positions, 'B', 'C')).toBeCloseTo(10, 4);
  });
});

describe('#1351 — the angle twin is covered by the same rung', () => {
  it.each([
    ['∠ABC ≥ 40 · ∠ABC = 40', ['משולש ABC', '∠ABC ≥ 40', '∠ABC = 40']],
    ['∠ABC ≤ 40 · ∠ABC = 40', ['משולש ABC', '∠ABC ≤ 40', '∠ABC = 40']],
    ['a derived angle ON its bound', ['משולש ABC', '∠ABC ≥ 40', '∠BAC = 80', '∠ACB = 60']],
  ])('%s builds at every seed', (_name, steps) => {
    expect(seedsThatBuild(steps)).toBe(SEEDS);
  });
});

describe('#1351 — what must NOT move', () => {
  /** ADR-390's drawing promise: with nothing pinning it, a bound still draws visibly inside its region. */
  it.each([['BC ≥ 10'], ['BC > 10']])('«%s» alone settles visibly inside, at every seed', (bound) => {
    const facts = factsOf(['משולש ABC', bound] as never);
    for (let s = 0; s < SEEDS; s++) {
      const fig = replay(facts, s);
      expect(fig.lastError).toBeNull();
      expect(len(fig.positions, 'B', 'C'), `seed ${s}`).toBeGreaterThan(10.1);
    }
  });

  /** ADR-529's acceptance is untouched: a STRICT bound still refuses its own value, at every seed. */
  it('«BC > 10» then «BC = 10» is still refused, at every seed', () => {
    const facts = factsOf(['משולש ABC', 'BC > 10', 'BC = 10'] as never);
    for (let s = 0; s < SEEDS; s++) expect(meetsRequirements(facts, s), `seed ${s}`).toBe(false);
    expect(replay(facts, 0).lastError).toMatch(/contradicts/);
  });
});

describe('#1351 — the cost term: the aim is a preference, the region is the rule', () => {
  const get = (bc: number) => (id: string): Vec => (id === 'B' ? { x: 0, y: 0 } : id === 'C' ? { x: bc, y: 0 } : { x: 0, y: 5 });
  const nonStrict: Constraint = { type: 'length-bound', a: 'B', b: 'C', min: 10, minStrict: false };
  const strict: Constraint = { type: 'length-bound', a: 'B', b: 'C', min: 10 };

  it('with the aim, a measure ON its non-strict bound still costs (ADR-390, unchanged)', () => {
    expect(jointCostTerm(nonStrict, get(10))).toBeGreaterThan(0);
  });
  it('with the aim yielded, anywhere the inequality admits costs nothing', () => {
    for (const bc of [10, 10.1, 12, 40]) expect(jointCostTerm(nonStrict, get(bc), false), `BC=${bc}`).toBe(0);
  });
  it('with the aim yielded, outside the region still costs — and a strict bound still excludes its value', () => {
    expect(jointCostTerm(nonStrict, get(9.5), false)).toBeGreaterThan(0);
    expect(jointCostTerm(strict, get(10), false)).toBeGreaterThan(0);
  });
});

/**
 * #1349 — the symptom that found this. The operator's own run (dev log session `tww10vbw`, seq 22):
 * with `BC = 10` on the figure, «AB ⟂ BC» after «∠ABC = 90» committed with no note, because the pool had
 * collapsed to one sample and ADR-542's entailment test correctly declined to answer. With the pool
 * restored it answers «כבר קיים» and adds nothing — ADR-542 itself unchanged.
 */
function makeDeps() {
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

describe('#1349 — the operator\'s exact sequence now answers «כבר קיים»', () => {
  beforeEach(() => {
    useGeoStore.getState().clear();
    llmParseMock.mockReset();
  });

  it('משולש ABC · BC>=10 · BC=10 · ∠ABC = 90 · AB ⟂ BC — the last line adds nothing and says so', async () => {
    for (const line of ['משולש ABC', 'BC>=10', 'BC=10', '∠ABC = 90']) await runSubmit(line, makeDeps().deps);
    const before = useGeoStore.getState().facts;
    expect(before.length).toBeGreaterThan(0);
    const { deps, notes } = makeDeps();
    await runSubmit('AB ⟂ BC', deps);
    expect(useGeoStore.getState().facts, 'not added to the steps').toBe(before);
    expect(notes()).toContain('input.alreadyDrawn');
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});
