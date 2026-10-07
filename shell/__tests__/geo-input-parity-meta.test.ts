/**
 * THE META-LOCK (#1649, ADR-W-108, docs/28 §5c step 5) — the shared geometry-input parity checks are run
 * against deliberately BROKEN runners and catalogs, and each check is shown to catch its own defect. A
 * shared suite that passed everything would let all three thin locks go green while the rule is held by
 * nothing. It calls the same `parityFaults` / `catalogCoverageFaults` the thin locks call — never a copy.
 *
 * The stubs answer from the rows themselves: `oracle` is the runner a perfectly conforming builder would
 * be (every context line builds, the last line gives `expect`, a known gap gives something else, an
 * exception's excluded builder refuses). Each broken stub is that oracle with one defect.
 */
import { describe, expect, it } from 'vitest';
import {
  EXCEPTIONS,
  GAP_ISSUES,
  PARITY_ROWS,
  PRODUCTS,
  UNCOVERED_CATALOG,
  UNCOVERED_CEILING,
  catalogCoverageFaults,
  coveredSentences,
  parityFaults,
  roleOf,
  rowFaults,
  stepsFor,
  type ParityRow,
  type Product,
  type StepRunner,
  type StepVerdict,
  type Verdict,
} from './fixtures/geo-input-parity';

const key = (steps: readonly string[]) => steps.join('\u0001');

/** What a conforming builder answers on the last line of each row, per product. */
function lastAnswers(product: Product): Map<string, Verdict> {
  const m = new Map<string, Verdict>();
  for (const row of PARITY_ROWS) {
    const role = roleOf(row, product);
    if (role === 'free') continue;
    const v: Verdict = role === 'expected' ? row.expect : role === 'gap' ? (row.expect === 'builds' ? 'not-handled' : 'builds') : 'refused';
    m.set(key(stepsFor(row, product)), v);
  }
  return m;
}

type Tamper = (row: ParityRow | undefined, steps: readonly string[], answer: StepVerdict[]) => StepVerdict[];

function oracle(product: Product, tamper: Tamper = (_r, _s, a) => a): StepRunner {
  const answers = lastAnswers(product);
  const rowOf = new Map(PARITY_ROWS.filter((r) => roleOf(r, product) !== 'free').map((r) => [key(stepsFor(r, product)), r]));
  return (steps) => {
    const last = answers.get(key(steps)) ?? 'not-handled';
    const answer: StepVerdict[] = steps.map((_, i) => ({ verdict: i < steps.length - 1 ? 'builds' : last }));
    return tamper(rowOf.get(key(steps)), steps, answer);
  };
}

const all = (product: Product, tamper?: Tamper) => parityFaults({ [product]: oracle(product, tamper) });

describe('#1649 — the rows are well formed', () => {
  it('no malformed row (unique ids, issues named, exceptions match their sentence, contexts only where checked)', () => {
    expect(rowFaults()).toEqual([]);
  });

  it('a known gap with no filed issue is rejected (no `to-file:` placeholder can be committed)', () => {
    const row = { id: 'x', family: 'lengths', steps: ['משולש ABC', 'AB = 6'], expect: 'builds', knownGap: [{ product: '3d', issue: 'to-file:3d-x' }] } as unknown as ParityRow;
    expect(rowFaults([row], {})).toEqual([expect.stringMatching(/names no filed issue/)]);
  });

  it('the seed is the size the audit asked for: parity, known-gap and exception rows in every product', () => {
    const gap = PARITY_ROWS.filter((r) => r.knownGap?.length);
    const exc = PARITY_ROWS.filter((r) => r.exception && EXCEPTIONS[r.exception].topic);
    const parity = PARITY_ROWS.filter((r) => !r.knownGap?.length && !(r.exception && EXCEPTIONS[r.exception].topic));
    expect(parity.length).toBeGreaterThanOrEqual(26);
    expect(gap.length).toBeGreaterThanOrEqual(31);
    expect(exc.length).toBeGreaterThanOrEqual(13);
    for (const p of PRODUCTS) expect(PARITY_ROWS.some((r) => roleOf(r, p) === 'expected'), p).toBe(true);
  });

  it('every exception family X1–X9 is used by at least one row', () => {
    for (const id of Object.keys(EXCEPTIONS)) expect(PARITY_ROWS.some((r) => r.exception === id), id).toBe(true);
  });

  it('the uncovered-catalog allowlists are within their ratchet ceilings', () => {
    for (const p of PRODUCTS) expect(UNCOVERED_CATALOG[p].length, p).toBeLessThanOrEqual(UNCOVERED_CEILING[p]);
  });

  it('the meta checks below have something to bite on: rows that build, refuse or ask, gaps, and must-refuse rows', () => {
    expect(PARITY_ROWS.some((r) => r.expect === 'builds')).toBe(true);
    expect(PARITY_ROWS.some((r) => r.expect !== 'builds')).toBe(true);
    expect(PARITY_ROWS.some((r) => PRODUCTS.some((p) => roleOf(r, p) === 'must-refuse'))).toBe(true);
    expect(PARITY_ROWS.some((r) => r.knownGap?.length)).toBe(true);
  });
});

/**
 * #1861 C4 (ADR-W-118 B15): EVERY KNOWN GAP NAMES OPEN WORK, OR SAYS IT IS PARKED.
 *
 * The audit found 258 of the gap entries citing issues that were closed or in the icebox, so the rows claimed
 * scheduled work that nobody was scheduled to do. The issue states are a snapshot in the fixture (`GAP_ISSUES`)
 * because a test cannot call GitHub; these cases show `rowFaults` holds the rows to it in both directions.
 */
describe('#1861 — a known gap names an open issue, or is parked', () => {
  const gapRow = (gap: Record<string, unknown>) =>
    ({ id: 'g', family: 'lengths', steps: ['משולש ABC', 'AB = 6'], expect: 'builds', knownGap: [{ product: '3d', ...gap }] }) as unknown as ParityRow;

  it('the real rows exercise both states (the checks below are not vacuous)', () => {
    const gaps = PARITY_ROWS.flatMap((r) => r.knownGap ?? []);
    expect(gaps.some((g) => g.parked)).toBe(true);
    expect(gaps.some((g) => !g.parked)).toBe(true);
    expect(Object.values(GAP_ISSUES)).toContain('open');
    expect(Object.values(GAP_ISSUES).some((s) => s !== 'open')).toBe(true);
  });

  it('a gap on a closed or iceboxed issue that is not parked is a fault', () => {
    expect(rowFaults([gapRow({ issue: '#1' })], { '#1': 'closed' })).toEqual([expect.stringMatching(/which is closed — mark the gap `parked: true`/)]);
    expect(rowFaults([gapRow({ issue: '#1' })], { '#1': 'icebox' })).toEqual([expect.stringMatching(/which is icebox — mark the gap `parked: true`/)]);
    expect(rowFaults([gapRow({ issue: '#1', parked: true })], { '#1': 'icebox' })).toEqual([]);
  });

  it('a parked gap on an open issue is a fault', () => {
    expect(rowFaults([gapRow({ issue: '#2', parked: true })], { '#2': 'open' })).toEqual([expect.stringMatching(/is parked, but #2 is open/)]);
    expect(rowFaults([gapRow({ issue: '#2' })], { '#2': 'open' })).toEqual([]);
  });

  it('a gap on an issue the snapshot does not list, and a snapshot entry that owns no gap, are faults', () => {
    expect(rowFaults([gapRow({ issue: '#3' })], {})).toEqual([expect.stringMatching(/names #3, which GAP_ISSUES does not list/)]);
    expect(rowFaults([gapRow({ issue: '#3' })], { '#3': 'open', '#4': 'closed' })).toEqual([expect.stringMatching(/GAP_ISSUES lists #4, which owns no known gap/)]);
  });

  it('the broken variant: the real rows with every `parked` stripped fail once per parked gap', () => {
    const parked = PARITY_ROWS.flatMap((r) => (r.knownGap ?? []).filter((g) => g.parked)).length;
    const stripped = PARITY_ROWS.map((r) => (r.knownGap ? { ...r, knownGap: r.knownGap.map(({ parked: _p, ...g }) => g) } : r));
    const faults = rowFaults(stripped);
    expect(faults).toHaveLength(parked);
    for (const f of faults) expect(f).toMatch(/mark the gap `parked: true`/);
  });
});

describe('#1649 — parityFaults catches a broken builder', () => {
  it('a conforming builder passes, in every product', async () => {
    for (const p of PRODUCTS) expect(await all(p), p).toEqual([]);
  });

  it('catches a runner that returns early (one verdict for several steps)', async () => {
    const faults = await all('2d', (_r, _s, a) => a.slice(0, 1));
    expect(faults.join('\n')).toMatch(/an early return proves nothing/);
  });

  it('catches a builder that always builds (gaps "close", excluded builders absorb, refusals vanish)', async () => {
    const faults = (await all('2d', (_r, _s, a) => a.map(() => ({ verdict: 'builds' as const })))).join('\n');
    expect(faults).toMatch(/BUILDS, but it is an X\d sentence/);
    expect(faults).toMatch(/move it to the parity rows/);
    if (PARITY_ROWS.some((r) => roleOf(r, '2d') === 'expected' && r.expect !== 'builds')) expect(faults).toMatch(/expected (refused|asks)/);
  });

  it('catches a builder that always refuses the last line', async () => {
    const faults = await all('analytic', (_r, _s, a) => a.map((v, i) => (i === a.length - 1 ? { verdict: 'refused' as const } : v)));
    expect(faults.join('\n')).toMatch(/gave refused, expected builds/);
  });

  it('catches a swapped verdict: asks where 2-D refuses, refused where 2-D asks', async () => {
    const swap: Tamper = (row, _s, a) =>
      row && roleOf(row, '2d') === 'expected' && row.expect !== 'builds'
        ? a.map((v, i) => (i === a.length - 1 ? { verdict: row.expect === 'asks' ? ('refused' as const) : ('asks' as const) } : v))
        : a;
    const faults = await all('2d', swap);
    expect(faults.length).toBeGreaterThan(0);
    expect(faults.join('\n')).toMatch(/expected (refused|asks) \(2-D's verdict\)/);
  });

  it('catches a known gap that silently starts matching', async () => {
    const gapRow = PARITY_ROWS.find((r) => r.knownGap?.some((g) => g.product === 'analytic'))!;
    const healed: Tamper = (row, _s, a) => (row === gapRow ? a.map((v, i) => (i === a.length - 1 ? { verdict: gapRow.expect } : v)) : a);
    const faults = await all('analytic', healed);
    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatch(new RegExp(`^\\[${gapRow.id}\\] analytic: .* — move it to the parity rows`));
  });

  it('catches a context line that does not build (the row would test its context)', async () => {
    const faults = await all('3d', (_r, _s, a) => a.map((v, i) => (i === 0 && a.length > 1 ? { verdict: 'not-handled' as const } : v)));
    expect(faults.join('\n')).toMatch(/the row tests its context, not its sentence/);
  });

  it('catches an excluded builder that absorbs an exception sentence (a slope read as a length, #1654)', async () => {
    const row = PARITY_ROWS.find((r) => roleOf(r, '2d') === 'must-refuse')!;
    const absorb: Tamper = (r, _s, a) => (r === row ? a.map(() => ({ verdict: 'builds' as const })) : a);
    const faults = await all('2d', absorb);
    expect(faults).toEqual([expect.stringMatching(new RegExp(`^\\[${row.id}\\] 2d: .* BUILDS, but it is an ${row.exception} sentence`))]);
  });
});

describe('#1649 — catalogCoverageFaults catches an unclassified sentence', () => {
  it('a sentence in no row and no topic family is a fault', () => {
    const faults = catalogCoverageFaults('2d', ['משולש ABC', 'משפט שאיש לא כתב לו שורה ABC'], PARITY_ROWS, []);
    expect(faults).toEqual([expect.stringMatching(/«משפט שאיש לא כתב לו שורה ABC» is in no parity row/)]);
  });

  it('a topic sentence is covered only in a builder that reads that topic', () => {
    expect(catalogCoverageFaults('analytic', ['נתונה הנקודה A(2,6)'], PARITY_ROWS, [])).toEqual([]);
    expect(catalogCoverageFaults('2d', ['נתונה הנקודה A(2,6)'], [], [])).toHaveLength(1);
  });

  it('the allowlist only shrinks: a covered or vanished allowlisted sentence is a fault', () => {
    const covered = [...coveredSentences('2d')][0];
    expect(catalogCoverageFaults('2d', [covered], PARITY_ROWS, [covered]).join('\n')).toMatch(/covered now — remove it/);
    expect(catalogCoverageFaults('2d', [], PARITY_ROWS, ['גיבוב']).join('\n')).toMatch(/no longer in the catalog/);
  });
});
