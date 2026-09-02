/**
 * #509 — a coordinate component may name SEVERAL symbols ([ADR-3D-213](../../docs/06b-decisions-3d.md)).
 *
 * «C(p+q,1,0)» refused, and the operator's own report («C(p^2,p^2+4,0)») made it look like a DEGREE
 * problem. Measured, it was an ARITY problem, and in three independent readers rather than in the data
 * model: `COMP_TERM_RE` here, `bindSymbol` inside `parseSymExpr` (#301) and `parseLinearEq`'s guard
 * (#339) each hard-code "one symbol" in their own way, while the solver has been n-symbol since #794
 * (`pinSymsOf` collects N symbols across every pin family, and a figure carrying two of them resolves).
 *
 * So the deliverable is the SHARED FORM — `SymAffine`, Σ kᵢ·symᵢ + c — with this reader as its FIRST
 * adoption. Widening only the regex and leaving a bespoke shape behind is the patch the other two
 * issues would then copy.
 *
 * **The boundary is asserted, not assumed.** Degree stays 1 by construction: a term is a coefficient
 * times a symbol, so `p^2`, `p/2` and `2(p+1)` have nowhere to live and are refused by the same reader
 * that enforces the arity — the ADR-3D-079 / docs/20 D3 no-CAS line, unchanged.
 *
 * `p*q` is refused WITH them, and that is a deliberate divergence from the issue's row list: it is a
 * PRODUCT of two symbols, i.e. degree 2, which an affine form cannot carry — and the same ruling says
 * Option A (degree) is not re-opened. See the ADR; it needs its own ruling.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { parse3 } from '../parser/parse3';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3, pinSymsOf, symsOfAffine, evalAffine, soleSymOf, type SymAffine } from '../engine/types';
import { derive3, useGeo3 } from '../store/store3';
import { deserializeFigure3 } from '../store/figureFile3';

const BOX = "תיבה ABCDA'B'C'D'";

/** Build a figure through the real parse → apply path; returns the construction or the refusal. */
const build = (lines: string[]): { ok: true; c: ReturnType<typeof emptyConstruction3> } | { ok: false; why: string } => {
  let c = emptyConstruction3();
  for (const line of lines) {
    const r = parse3(line);
    if (!r.ok) return { ok: false, why: `parse:${r.reason}` };
    for (const cmd of r.commands) {
      const a = applyCommand3(c, cmd);
      if (!a.ok) return { ok: false, why: `apply:${JSON.stringify(a.error)}` };
      c = a.next;
    }
  }
  return { ok: true, c };
};

describe('#509 — the shared multi-symbol affine form', () => {
  describe('the form itself', () => {
    const e: SymAffine = { terms: [{ sym: 'p', k: 2 }, { sym: 'q', k: 3 }], c: -1 };
    it('names its symbols in written order, de-duplicated', () => {
      expect(symsOfAffine(e)).toEqual(['p', 'q']);
      expect(symsOfAffine({ terms: [{ sym: 'k', k: 1 }, { sym: 'k', k: 1 }], c: 0 })).toEqual(['k']);
    });
    it('evaluates as Σ kᵢ·symᵢ + c', () => {
      expect(evalAffine(e, (s) => ({ p: 10, q: 100 })[s] ?? 0)).toBe(2 * 10 + 3 * 100 - 1);
    });
    it('has a SOLE symbol only when it names exactly one', () => {
      expect(soleSymOf({ terms: [{ sym: 'k', k: 2 }], c: 3 })).toBe('k');
      expect(soleSymOf({ terms: [{ sym: 'k', k: 1 }, { sym: 'k', k: 1 }], c: 0 })).toBe('k');
      expect(soleSymOf(e)).toBeNull();
    });
  });

  describe('the newly-supported rows', () => {
    it.each([
      ['C(p+q,1,0)', ['p', 'q']],
      ['C(2p+3q,1,0)', ['p', 'q']],
      ['C(p+q+3,1,0)', ['p', 'q']],
      ['C(2p-3q,1,0)', ['p', 'q']],
    ])('«%s» builds, with BOTH symbols in pinSyms', (line, syms) => {
      const r = build([BOX, line]);
      expect(r.ok, r.ok ? '' : (r as { why: string }).why).toBe(true);
      if (r.ok) expect(pinSymsOf(r.c)).toEqual(syms);
    });

    it('the component reads as the affine form the student wrote', () => {
      const p = parse3('C(2p+3q-1,1,0)');
      expect(p.ok).toBe(true);
      if (p.ok) {
        const cmd = p.commands[0] as { symExprs?: (SymAffine | null)[] };
        expect(cmd.symExprs?.[0]).toEqual({ terms: [{ sym: 'p', k: 2 }, { sym: 'q', k: 3 }], c: -1 });
      }
    });

    it('a multi-symbol component names no SINGLE letter — `syms` carries null for it', () => {
      const p = parse3('C(p+q,1,0)');
      expect(p.ok).toBe(true);
      if (p.ok) expect((p.commands[0] as { syms?: (string | null)[] }).syms).toEqual([null, null, null]);
    });
  });

  describe('the DEGREE boundary — asserted, not assumed', () => {
    it.each(['C(p^2,p^2+4,0)', 'C(p²,1,0)', 'C(3p^2,1,0)', 'C(p/2,1,0)', 'C(2(p+1),1,0)', 'C(p*q,1,0)'])(
      '«%s» is still refused — an affine form is degree 1 over a SUM of terms',
      (line) => {
        expect(parse3(line).ok).toBe(false);
      },
    );
  });

  describe('the baseline is unchanged', () => {
    it.each([
      ['C(p,p+4,0)', ['p']],
      ['C(2t,t,k)', ['t', 'k']],
      ['C(-2p-3,1,0)', ['p']],
      ['A(1,2,3)', []],
    ])('«%s» builds exactly as before', (line, syms) => {
      const r = build([BOX, line]);
      expect(r.ok, r.ok ? '' : (r as { why: string }).why).toBe(true);
      if (r.ok) expect(pinSymsOf(r.c)).toEqual(syms);
    });

    it('the single-symbol reading is byte-identical to ADR-3D-032’s', () => {
      const p = parse3('M(k,1,3)');
      expect(p.ok).toBe(true);
      if (p.ok) expect(p.commands).toEqual([{ type: 'point3', id: 'M', x: null, y: 1, z: 3, syms: ['k', null, null] }]);
    });

    it('the appositive sign clause still rides a multi-symbol tuple', () => {
      const p = parse3('נתונה נקודה C(p+q,1,3), p הוא פרמטר חיובי');
      expect(p.ok).toBe(true);
      if (p.ok) expect(p.commands.some((c) => c.type === 'param-sign')).toBe(true);
    });
  });

  describe('the figure RESOLVES, not merely applies', () => {
    beforeEach(() => {
      useGeo3.setState({ facts: [], seed: 0, lastError: null });
      useGeo3.temporal.getState().clear();
    });

    it('a two-symbol-in-one-component figure resolves green, both symbols pivot unknowns', () => {
      for (const u of [BOX, 'C(p+q,1,0)']) useGeo3.getState().submit(u);
      const d = derive3(useGeo3.getState().facts, 0);
      expect(useGeo3.getState().lastError).toBeNull();
      expect(pinSymsOf(d.construction)).toEqual(['p', 'q']);
      expect(d.positions.size).toBeGreaterThan(0);
    });

    /**
     * The two-symbols-across-SEPARATE-givens figure, which was already green before this change and
     * must stay so — the measurement that established the solver is n-symbol and only the readers are
     * not.
     *
     * Correction on the record: #509's ruling comment gives this figure as «תיבה» + `AA'=(k-1,k-7,k+1)`
     * + `BB'=(m,m+2,m-1)`. That sequence does NOT resolve, on this branch or on `main` alike — in a box
     * AA' and BB' are the SAME vector, so stating both differently is a real contradiction and the
     * engine says so (`givens-contradict`). The property the comment was demonstrating is real; the
     * edge pair it named was not independent. Two genuinely independent edges show it.
     */
    it('and so does the two-symbols-across-separate-givens figure (independent edges)', () => {
      for (const u of [BOX, 'AB=(k-1,k-7,k+1)', "AA'=(m,m+2,m-1)"]) useGeo3.getState().submit(u);
      const d = derive3(useGeo3.getState().facts, 0);
      expect(useGeo3.getState().lastError).toBeNull();
      expect(pinSymsOf(d.construction)).toEqual(['k', 'm']);
      expect(d.positions.size).toBe(8);
    });
  });
});

/**
 * The migration, locked directly rather than only through the fixture net.
 *
 * `symExprs` is PERSISTED — it rides the stored commands in every saved `.geo3.json` — so changing the
 * carrier's shape would have stopped every figure a student has already saved from replaying. The net
 * caught it at once (four files, both the green-replay and the parser-drift halves), and the fix is a
 * migration on load rather than a schema bump alone: a bump only tells the old file it is unwelcome.
 *
 * Note the corpus on disk stays at schemaVersion 1 ON PURPOSE — that is what keeps this path exercised
 * on every run. Regenerating those files to v2 would silently retire the coverage.
 */
describe('#509 — a saved figure written before the widening still loads', () => {
  const V1 = JSON.stringify({
    schemaVersion: 1,
    app: '3d-builder',
    seed: 0,
    facts: [
      { utterance: "תיבה ABCDA'B'C'D'", cmds: [{ type: 'solid', kind: 'box', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }] },
      {
        utterance: "AA'=(k-1,k-7,k+1)",
        cmds: [
          {
            type: 'inject-pair', a: 'A', b: "A'", x: null, y: null, z: null,
            syms: ['k', 'k', 'k'],
            symExprs: [{ sym: 'k', k: 1, c: -1 }, { sym: 'k', k: 1, c: -7 }, { sym: 'k', k: 1, c: 1 }],
          },
        ],
      },
    ],
  });

  it('migrates each legacy {sym,k,c} component to its one-term affine image', () => {
    const r = deserializeFigure3(V1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.facts[1].cmds[0] as { symExprs?: SymAffine[] };
    expect(cmd.symExprs).toEqual([
      { terms: [{ sym: 'k', k: 1 }], c: -1 },
      { terms: [{ sym: 'k', k: 1 }], c: -7 },
      { terms: [{ sym: 'k', k: 1 }], c: 1 },
    ]);
  });

  it('and the migrated figure REPLAYS — the point of migrating rather than refusing', () => {
    const r = deserializeFigure3(V1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = derive3(r.facts, r.seed);
    for (const f of r.facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(pinSymsOf(d.construction)).toEqual(['k']);
  });

  it('is idempotent — a component already in the new shape is untouched', () => {
    const v2 = V1.replace('"schemaVersion":1', '"schemaVersion":2')
      .split('{"sym":"k","k":1,"c":-1}').join('{"terms":[{"sym":"k","k":1}],"c":-1}');
    const r = deserializeFigure3(v2);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.facts[1].cmds[0] as { symExprs?: SymAffine[] }).symExprs?.[0]).toEqual({ terms: [{ sym: 'k', k: 1 }], c: -1 });
  });

  it('a file from a NEWER schema is still refused cleanly, not misread', () => {
    const r = deserializeFigure3(V1.replace('"schemaVersion":1', '"schemaVersion":99'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('newer-schema');
  });
});
