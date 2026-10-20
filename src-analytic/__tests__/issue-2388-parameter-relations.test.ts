/**
 * #2388 ([ADR-AG-307](../../docs/06c-decisions-analytic.md#adr-ag-307)) — RELATIONS BETWEEN PARAMETERS, AND R AS THE ONE
 * CAPITAL THAT NAMES A SIZE.
 *
 * Operator (#2379): *"this is an exam I give my students and i want the tool to support it"* — Q2 (summer 2022) writes
 * «(x−13)²+y²=R²», «r < R» and «היחס בין אורכי הרדיוסים של המעגלים הוא 1:2». Operator ruling 2026-10-20 (option b):
 * *"it is very common to use R and r for radiuses of different circles so R can be an exception"* — R is a radius
 * parameter inside an equation and in «ורדיוסו R»; every other capital stays a point name; a point R beside the
 * parameter R is refused, naming both readings.
 *
 * Every assertion calls the decision: `decideSubmit`, `derive`, `panelKnowledge`, `errorText`, the rename dispatch.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { panelKnowledge } from '../app/panelRows';
import { paramRegister, reportedDof } from '../engine/carriers';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { dispatchRename, type RenameState } from '../app/rename';
import { useAnalyticStore, type InputError } from '../store/useAnalyticStore';
import { parseLine } from '../parser/parseAnalytic';
import relations from './fixtures/issue-2388-q2-relations.analytic.json';
import exam from './fixtures/issue-2388-q2-exam-equations.analytic.json';

type Verdict = { kind: string; line?: string; error?: InputError & { key: string } };
type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

function submitAll(lines: readonly string[]): string[] {
  const recorded: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, recorded, 0) as Verdict;
    if (v.kind === 'record') recorded.push(v.line ?? line);
    else if (v.kind !== 'already-follows' && v.kind !== 'already-known') throw new Error(`«${line}» → ${v.kind} ${v.error?.key ?? ''}`);
  }
  return recorded;
}
/** HEAD's «not understood» verdict: refused with the `not-handled` key (the LLM seam when it is on). */
const notHandled = (v: Verdict) => v.kind === 'refused' && v.error?.key === 'not-handled';
function lastVerdict(lines: readonly string[]): Verdict {
  const recorded = submitAll(lines.slice(0, -1));
  return decideSubmit(lines[lines.length - 1], recorded, 0) as Verdict;
}

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
/** Q2's canonical route (centre + radius), every line recording at HEAD; the panel shows a = 4, r and R open. */
// «a < 13» is the exam's own given (Q2, before ב): with #2380 (ADR-AG-303) a has two roots, 4 and 22, until it is stated.
const CTX = ['M(a,0)', 'a הוא פרמטר חיובי', 'a < 13', 'נתון מעגל M שרדיוסו r', 'N(13,0)', 'נתון מעגל N שרדיוסו R', 'MN = 9', 'המעגלים משיקים מבחוץ'];

/** r and R at a seed, read off the drawn figure's environment. */
const rR = (lines: readonly string[], seed: number) => {
  const d = derive(lines, seed);
  expect(d.faults).toEqual([]);
  expect(d.figure.unsatisfied).toEqual([]);
  return [d.figure.env.r, d.figure.env.R] as const;
};

describe('#2388 (1) — every spelling of the relation gives r = 3, R = 6 at every seed', () => {
  const SPELLINGS = ['R = 2r', 'r:R = 1:2', 'r/R=1/2', 'היחס בין R ל-r הוא 2:1', 'היחס בין r ל-R הוא 1:2', 'the ratio of R to r is 2:1', 'the ratio between r and R is 1:2'];
  it.each(SPELLINGS)('«%s»', (s) => {
    const lines = [...CTX, s];
    expect(submitAll(lines)).toEqual(lines);
    for (const seed of SEEDS) {
      const [r, R] = rR(lines, seed);
      expect(r).toBeCloseTo(3, 5);
      expect(R).toBeCloseTo(6, 5);
    }
    const pk = panelKnowledge(derive(lines, 0));
    for (const sym of ['a', 'r', 'R']) expect(pk.params.find((p) => p.sym === sym)!.k.known, sym).toBe(true);
  });

  it('a colon proportion lowers to its definition, q·X = p·Y; a slash is kept as typed', () => {
    const colon = parseLine('r:R = 1:2');
    expect(colon.ok && colon.facts).toMatchObject([{ t: 'constraint', k: { t: 'param-rel' } }]);
    const slash = parseLine('r/R=1/2');
    expect(slash.ok && slash.facts).toMatchObject([{ t: 'constraint', k: { t: 'param-rel', left: { kind: 'div' }, right: { kind: 'div' } } }]);
  });
});

describe('#2388 (1) — the ratio of the circles’ radii', () => {
  const UNNAMED = ['היחס בין אורכי הרדיוסים של המעגלים הוא 1:2', 'היחס בין הרדיוסים של המעגלים הוא 1:2', 'היחס בין רדיוסי המעגלים הוא 1:2', 'the ratio of the radii of the circles is 1:2'];
  it.each(UNNAMED)('unnamed «%s» + «r < R» → r = 3, R = 6 at every seed', (s) => {
    const lines = [...CTX, s, 'r < R'];
    expect(submitAll(lines)).toEqual(lines);
    for (const seed of SEEDS) {
      const [r, R] = rR(lines, seed);
      expect(r).toBeCloseTo(3, 5);
      expect(R).toBeCloseTo(6, 5);
    }
  });

  it('unnamed, with no «r < R»: the order is an unstated choice — «הציגו תצורה אחרת» reaches both', () => {
    const lines = [...CTX, 'היחס בין אורכי הרדיוסים של המעגלים הוא 1:2'];
    expect(submitAll(lines)).toEqual(lines);
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const [r, R] = rR(lines, seed);
      expect(Math.min(r, R)).toBeCloseTo(3, 5);
      expect(Math.max(r, R)).toBeCloseTo(6, 5);
      seen.add(r < R ? 'r<R' : 'r>R');
    }
    expect([...seen].sort()).toEqual(['r<R', 'r>R']);
    const pk = panelKnowledge(derive(lines, 0));
    expect(pk.params.find((p) => p.sym === 'r')!.k.known).toBe(false);
  });

  it('named «של המעגלים M ו-N» is ordered: no choice, r = 3 and R = 6 with no «r < R»', () => {
    const lines = [...CTX, 'היחס בין רדיוסי המעגלים M ו-N הוא 1:2'];
    expect(submitAll(lines)).toEqual(lines);
    for (const seed of SEEDS) {
      const [r, R] = rR(lines, seed);
      expect(r).toBeCloseTo(3, 5);
      expect(R).toBeCloseTo(6, 5);
    }
  });

  it('on circles given by their EQUATIONS the ratio reads the resolved circles', () => {
    const lines = ['נתון מעגל I שמשוואתו (x-a)^2+y^2=4', 'נתון מעגל II שמשוואתו (x-13)^2+y^2=c^2', 'c>0', 'היחס בין רדיוסי המעגלים I ו-II הוא 1:2'];
    expect(submitAll(lines)).toEqual(lines);
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      const ii = d.figure.curves.find((c) => c.id === 'circle-II')!.curve;
      expect(ii.kind === 'circle' && ii.r).toBeCloseTo(4, 5);
    }
  });

  it('pickup check 6: an unbranched touch (a choice) + the unordered ratio (a choice) + «r < R» is not refused', () => {
    const lines = [...CTX.slice(0, -1), 'המעגלים משיקים', 'היחס בין אורכי הרדיוסים של המעגלים הוא 1:2', 'r < R'];
    expect(submitAll(lines)).toEqual(lines);
    for (const seed of SEEDS) {
      const [r, R] = rR(lines, seed);
      // externally r = 3, R = 6; internally |R − r| = 9 gives r = 9, R = 18 — both are configurations of these givens
      expect(R).toBeCloseTo(2 * r, 5);
      expect([3, 9].some((v) => Math.abs(r - v) < 1e-5), `r = ${r}`).toBe(true);
    }
  });

  it('three circles under «המעגלים» ask which', () => {
    expect(lastVerdict([...CTX, 'נתון מעגל K', 'היחס בין רדיוסי המעגלים הוא 1:2']).error?.key).toBe('ambiguous-shape');
  });
});

describe('#2388 (1) — any relation over symbols the figure uses consumes one DOF', () => {
  it.each([
    ['k = 2t', 'נתון הישר y=kx+t', (e: Record<string, number>) => e.k - 2 * e.t],
    ['a = b + 1', 'נתון הישר y=ax+b', (e: Record<string, number>) => e.a - (e.b + 1)],
  ] as const)('«%s» holds at every seed and consumes one DOF', (rel, ctx, miss) => {
    const before = derive([ctx], 0);
    const lines = [ctx, rel];
    expect(submitAll(lines)).toEqual(lines);
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      expect(Math.abs(miss(d.figure.env))).toBeLessThan(1e-5);
    }
    const after = derive(lines, 0);
    expect(reportedDof(after.construction, after.figure.carrierDof)).toBe(reportedDof(before.construction, before.figure.carrierDof) - 1);
  });

  it('a relation over a letter nothing uses keeps HEAD’s verdict (not-handled)', () => {
    expect(notHandled(lastVerdict(['k הוא פרמטר', 'a = b + 1']))).toBe(true);
    expect(notHandled(lastVerdict(['R = 2r']))).toBe(true);
  });
});

describe('#2388 (2) — R reads as the one radius parameter in every reader', () => {
  it.each([
    [['(x-13)^2+y^2=R^2']],
    [['מעגל N: (x-13)²+y²=R²']],
    [['נתון מעגל שמרכזו N ורדיוסו R']],
    [['נתון מעגל O', 'רדיוס המעגל O הוא R']],
    [['נתון מעגל N שרדיוסו R']],
    [['A(0,0)', 'B(3,0)', 'AB = 1.6R']],
  ])('%j registers the parameter R', (lines) => {
    expect(submitAll(lines)).toEqual(lines);
    expect(paramRegister(derive(lines, 0).construction).map((p) => p.sym)).toContain('R');
  });
});

describe('#2388 (2) — the clash: a point R and the radius R, refused naming both and the earlier line', () => {
  const POINT_FIRST: Array<[string, string[]]> = [
    ['a point', ['R(1,2)']],
    ['a polygon vertex', ['מרובע PQRS']],
    ['a centre', ['נתון מעגל R']],
  ];
  const RADIUS_USES: Array<[string, string[], string]> = [
    ['a radius', [], 'נתון מעגל N שרדיוסו R'],
    ['an equation', [], 'מעגל N: (x-13)^2+y^2=R^2'],
    ['a centre-and-radius', [], 'נתון מעגל שמרכזו N ורדיוסו R'],
    ['a radius sentence', ['נתון מעגל O'], 'רדיוס המעגל O הוא R'],
    ['a length', ['A(0,0)', 'B(3,0)'], 'AB = 1.6R'],
  ];
  for (const [pn, pointLines] of POINT_FIRST) {
    it.each(RADIUS_USES)(`${pn} first, then %s`, (_n, pre, use) => {
      const v = lastVerdict([...pointLines, ...pre, use]);
      expect(v.kind).toBe('refused');
      expect(v.error).toMatchObject({ key: 'radius-letter-taken', holder: 'R', reading: 'point', declared: pointLines[0] });
      const he = errorText(v.error!, t);
      expect(he).toContain(pointLines[0]);
      expect(he).toContain(use);
      expect(he).toContain('נקודה');
      expect(he).toContain('פרמטר הרדיוס');
      expect(errorText(v.error!, tEn)).toContain('radius parameter');
    });
  }
  const POINT_USES: Array<[string, string]> = [
    ['a point', 'R(1,2)'],
    ['a polygon vertex', 'מרובע PQRS'],
    ['a centre', 'נתון מעגל R'],
  ];
  it.each(POINT_USES)('the radius first, then %s', (_n, use) => {
    const v = lastVerdict(['נתון מעגל N שרדיוסו R', use]);
    expect(v.error).toMatchObject({ key: 'radius-letter-taken', holder: 'R', reading: 'radius', declared: 'נתון מעגל N שרדיוסו R' });
    expect(errorText(v.error!, t)).toContain('פרמטר הרדיוס');
  });

  it('a rename onto R while R is the radius is refused, and nothing changes', () => {
    const store = useAnalyticStore.getState();
    store.clearAll();
    for (const l of ['נתון מעגל N שרדיוסו R', 'A(1,2)']) store.recordLine(l);
    const s = useAnalyticStore.getState();
    const state: RenameState = { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames };
    const v = dispatchRename('A', 'R', state, { applyRename: s.applyRename, setError: s.setError }, derive(s.lines, s.seed, s.seedNames));
    expect(v.kind, JSON.stringify(v)).not.toBe('apply');
    expect(useAnalyticStore.getState().lines).toEqual(['נתון מעגל N שרדיוסו R', 'A(1,2)']);
  });

  it('the taught remedy works: «שנה שם R ל-T», then the radius line records', () => {
    const store = useAnalyticStore.getState();
    store.clearAll();
    store.recordLine('R(1,2)');
    const s = useAnalyticStore.getState();
    const state: RenameState = { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames };
    const v = dispatchRename('R', 'T', state, { applyRename: s.applyRename, setError: s.setError }, derive(s.lines, s.seed, s.seedNames));
    expect(v.kind).toBe('apply');
    const after = useAnalyticStore.getState().lines;
    expect(decideSubmit('נתון מעגל N שרדיוסו R', after, 0).kind).toBe('record');
  });

  it('the tool never mints a point R beside the parameter R', () => {
    // M, N, P and Q are taken, so the median's foot would be the pool's next letter — R — were the parameter not taken.
    const lines = ['נתון מעגל N שרדיוסו R', 'M(0,0)', 'P(1,0)', 'Q(0,1)', 'משולש ABC', 'תיכון לצלע BC'];
    const d = derive(submitAll(lines), 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.some((o) => o.id === 'R')).toBe(false);
    expect(d.construction.objects.some((o) => o.id === 'S')).toBe(true);
  });
});

describe('#2388 — controls (unchanged) and the withdrawn behaviour', () => {
  it.each(['a = 5', 'r=5', 'AB is y=x-4'])('«%s» stays not-handled', (s) => {
    expect(notHandled(decideSubmit(s, [], 0) as Verdict)).toBe(true);
  });
  it('«α = 30» and «α = 2β» unchanged', () => {
    expect(submitAll(['משולש ABC', '∢ABC = α', 'α = 30'])).toHaveLength(3);
    expect(parseLine('α = 2β').ok && (parseLine('α = 2β') as { facts: { k?: { t: string } }[] }).facts[0].k?.t).toBe('param-eq');
  });
  it('«מרובע PQRS» and «AB = RS» keep R a point', () => {
    const d = derive(submitAll(['מרובע PQRS', 'AB = RS']), 0);
    expect(paramRegister(d.construction).map((p) => p.sym)).not.toContain('R');
    expect(d.construction.objects.some((o) => o.id === 'R')).toBe(true);
  });
  it('«R > r» still reads as an order between the radii', () => {
    expect(submitAll([...CTX, 'R > r'])).toHaveLength(CTX.length + 1);
  });
  // #2427 (ADR-AG-325): no longer the generic not-understood — an owned refusal that teaches the lowercase letter
  it('WITHDRAWN: «נתון מעגל O שרדיוסו K» and «x^2+y^2=K^2» are not accepted (K names a point; operator ruling, option b)', () => {
    for (const s of ['נתון מעגל O שרדיוסו K', 'נתון מעגל שמרכזו O ורדיוסו K', 'x^2+y^2=K^2']) {
      const v = decideSubmit(s, [], 0) as Verdict;
      expect(v.kind === 'refused' && v.error?.key, s).toBe('capital-magnitude');
    }
  });
});

describe('#2388 — the saved questions', () => {
  it('Q2 canonical with «R = 2r» and «r < R»: a = 4, r = 3, R = 6 in the panel', () => {
    expect(submitAll(relations.lines)).toEqual(relations.lines);
    const pk = panelKnowledge(derive(relations.lines, relations.seed));
    const v = (sym: string) => {
      const k = pk.params.find((p) => p.sym === sym)!.k;
      return k.known ? [k.value] : [...(k.options ?? [])];
    };
    expect(v('a').some((x) => Math.abs(x - 4) < 1e-5)).toBe(true);
    expect(v('r')).toHaveLength(1);
    expect(v('r')[0]).toBeCloseTo(3, 5);
    expect(v('R')[0]).toBeCloseTo(6, 5);
  });

  /**
   * The exam's own lines as far as the grammar on this stack reaches (the wrapper sentences are #2391's): both circles
   * by equation with «R²», the ratio sentence and «r < R». The radii appear only as r² and R², so «r < R» does not say
   * they are positive: (r, R) = (3, 6) and (−6, 3) both hold, and the panel honestly lists both equations (no inferred
   * r > 0 — the #2382/#2387 plan's pickup check 4). a = 4 is known.
   */
  it('Q2 in the exam’s equation form: a = 4; each equation listed with its two options', () => {
    expect(submitAll(exam.lines)).toEqual(exam.lines);
    const d = derive(exam.lines, exam.seed);
    expect(d.faults).toEqual([]);
    const pk = panelKnowledge(d);
    const a = pk.params.find((p) => p.sym === 'a')!.k;
    expect((a.known ? [a.value] : [...(a.options ?? [])]).some((x) => Math.abs(x - 4) < 1e-5)).toBe(true);
    for (const id of ['circle-I', 'circle-II']) {
      const c = pk.curves.find((q) => q.id === id)!;
      expect(c.known !== null || (c.options?.length ?? 0) === 2, id).toBe(true);
    }
  });
});
