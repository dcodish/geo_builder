/**
 * ADR-3D-070 / issue #302 — a symbol the constraints have DETERMINED is a number,
 * not a parameter, so it must not suppress the parametric rows of a genuinely
 * free symbol elsewhere in the figure.
 *
 * Operator (localhost session `nusn7bus`): «the AM⃗=(0.5+k/6)u+(k+3.5)w+0.5v was
 * accepted but the data panel cannot tell me what SM is».
 *
 * Their figure was file-loaded, so it is rebuilt here from the LOGGED commands —
 * faithful to what the store actually held (re-typing loses the O step, #303).
 */

import { describe, expect, it } from 'vitest';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { dataView, parametricDecomp } from '../engine/dataView';
import { resolve3 } from '../engine/evaluate';
import { cross3, dot3, norm3, sub3 } from '../engine/vec3';
import type { Command3 } from '../engine/types';

const facts = (rows: [string, Command3[]][]): Fact3[] =>
  rows.map(([utterance, cmds], i) => ({ id: `f${i}`, utterance, cmds, enabled: true }));

const named = (name: string) => ({ kind: 'named', name }) as const;
const vecRel = (from: string, to: string, terms: [number, number, string][], symbol?: string) =>
  ({ type: 'vec-rel', from, to, terms: terms.map(([k, p, n]) => ({ coeff: { k, p }, atom: named(n) })), ...(symbol ? { symbol } : {}) }) as unknown as Command3;

/** The operator's figure: box + O + basis + S (symbol t, pinned ⊥) + M (symbol k, free) + SM. */
const OPERATOR_FIGURE = facts([
  ['מנסרה ישרה שבסיסה מלבן', [{ type: 'solid', kind: 'box', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }] as unknown as Command3[]],
  ['AC ו BD נחתכים בנקודה O', [{ type: 'diag-intersection', id: 'O', face: ['A', 'B', 'C', 'D'] }] as unknown as Command3[]],
  ['AD', [{ type: 'segment3', a: 'A', b: 'D' }] as unknown as Command3[]],
  ['AC', [{ type: 'segment3', a: 'A', b: 'C' }] as unknown as Command3[]],
  ['DB', [{ type: 'segment3', a: 'D', b: 'B' }] as unknown as Command3[]],
  ["AA'=v", [vecRel('A', "A'", [[1, 0, 'v']])]],
  ['AB=w', [vecRel('A', 'B', [[1, 0, 'w']])]],
  ['AD=u', [vecRel('A', 'D', [[1, 0, 'u']])]],
  ['AS=(1-t)u+0.5v+tw', [vecRel('A', 'S', [[1, -1, 'u'], [0.5, 0, 'v'], [0, 1, 'w']], 't')]],
  ['SO⊥ABCD', [
    { type: 'segment3', a: 'A', b: 'B' }, { type: 'segment3', a: 'B', b: 'C' }, { type: 'segment3', a: 'C', b: 'A' },
    { type: 'seg-plane-rel', rel: 'perp', a: 'S', b: 'O', plane: ['A', 'B', 'C'] },
  ] as unknown as Command3[]],
  ['AM=(0.5+k/6)u+(k+3.5)w+0.5v', [vecRel('A', 'M', [[0.5, 1 / 6, 'u'], [3.5, 1, 'w'], [0.5, 0, 'v']], 'k')]],
  ['SM', [{ type: 'segment3', a: 'S', b: 'M' }] as unknown as Command3[]],
]);

const SEEDS = [0, 1013, 2027];

describe("#302 — the operator's figure: a determined symbol beside a free one", () => {
  const d = derive3(OPERATOR_FIGURE, 0);
  const c = d.construction;

  it('builds clean — every fact ok', () => {
    for (const f of OPERATOR_FIGURE) expect(d.status[f.id], f.utterance).toBe('ok');
  });

  it('SO⊥ABCD determines t = 1/2 at every seed, while k roams', () => {
    const ts = new Set<string>();
    const ks = new Set<string>();
    for (const s of [0, 1013, 2027, 7, 33]) {
      const pos = resolve3(c, s).positions;
      const p = (id: string) => pos.get(id)!;
      const u = sub3(p('D'), p('A'));
      const w = sub3(p('B'), p('A'));
      const t = dot3(sub3(p('S'), p('A')), w) / dot3(w, w);
      const k = dot3(sub3(p('M'), p('A')), w) / dot3(w, w) - 3.5;
      expect(t, `t at seed ${s}`).toBeCloseTo(0.5, 9);
      // the ⊥ genuinely holds: SO is parallel to the base normal
      const so = sub3(p('O'), p('S'));
      const n = cross3(w, u);
      expect(norm3(cross3(so, n)) / (norm3(so) * norm3(n))).toBeLessThan(1e-9);
      ts.add(t.toFixed(6));
      ks.add(k.toFixed(6));
    }
    expect(ts.size, 't is determined — one value').toBe(1);
    expect(ks.size, 'k is free — many values').toBeGreaterThan(1);
  });

  it('SM is reported parametrically in k — the reported gap', () => {
    // SM = M − S = (k/6 + t − 1/2)u + (k − t + 7/2)w  with t = 1/2  ⇒  (k/6)u + (k+3)w
    const s = parametricDecomp(c, 'S', 'M', SEEDS);
    expect(s).not.toBeNull();
    expect(s).toContain('k');
    // no v component; the u and w coefficients carry k
    expect(s).not.toContain('v');
    for (const piece of ['w', 'u']) expect(s).toContain(piece);
  });

  it('the numeric answer behind the string is (k/6)u + (k+3)w', () => {
    // probe the engine directly: at two k values the coefficients must match the closed form
    const basis = [...c.vectors.entries()].slice(0, 3);
    expect(basis.map(([n]) => n)).toEqual(['v', 'w', 'u']); // declaration order
    for (const kv of [0, 1, 2.5]) {
      const pinned = { ...c, symbolPins: [...c.symbolPins.filter((p) => p.def !== 1), { rel: 'value' as const, value: kv, def: 1 }] };
      for (const seed of SEEDS) {
        const pos = resolve3(pinned, seed).positions;
        const p = (id: string) => pos.get(id)!;
        const u = sub3(p('D'), p('A'));
        const w = sub3(p('B'), p('A'));
        const sm = sub3(p('M'), p('S'));
        expect(dot3(sm, u) / dot3(u, u), `u coeff at k=${kv}`).toBeCloseTo(kv / 6, 9);
        expect(dot3(sm, w) / dot3(w, w), `w coeff at k=${kv}`).toBeCloseTo(kv + 3, 9);
        expect(dot3(sm, sub3(p("A'"), p('A'))), `no v component at k=${kv}`).toBeCloseTo(0, 9);
      }
    }
  });

  it('the panel now carries an SM row (and keeps the rows it already had)', () => {
    const panel = dataView(c, 0);
    const labels = panel.vectors.map((v) => v.label);
    expect(labels).toContain('SM');
    // the pre-existing rows must survive — t being fixed still yields numeric decompositions
    for (const kept of ['AC', 'DB', 'AS', 'SO']) expect(labels).toContain(kept);
    const sm = panel.vectors.find((v) => v.label === 'SM')!;
    expect(sm.decomp).toContain('k');
  });
});

describe('#302 — the class, beyond the reported instance', () => {
  /** Build through the REAL parse → submit path (these figures are all in-grammar). */
  const build = (utterances: string[]) => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    useGeo3.temporal.getState().clear();
    utterances.forEach((u) => useGeo3.getState().submit(u));
    const st = useGeo3.getState();
    expect(st.facts, `all ${utterances.length} utterances applied`).toHaveLength(utterances.length);
    return derive3(st.facts, st.seed).construction;
  };

  it('a ROAMING driven symbol still counts as a parameter (no #297 regression)', () => {
    // the ADR-3D-067 figure: t is DRIVEN by EO⊥AS yet still roams (the apex is free)
    const c = build(['פירמידה שבסיסה ריבוע', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS', 'אלכסוני הריבוע נחתכים בנקודה O', 'EO⊥AS']);
    expect(c.vecDefs.filter((v) => v.symbol).length).toBe(1);
    expect(parametricDecomp(c, 'A', 'E', SEEDS)).toContain('t');
  });

  it('a FREE symbol with no constraint at all stays parametric', () => {
    const c = build(['פירמידה ABCDS שבסיסה ריבוע', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS']);
    expect(parametricDecomp(c, 'A', 'E', SEEDS)).toBe('t·w');
  });

  it('TWO roaming symbols return null — never a faked single-parameter form (#301)', () => {
    const c = build(['פירמידה ABCDS שבסיסה ריבוע', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS', 'AF=k*AD']);
    expect(c.vecDefs.filter((v) => v.symbol).length).toBe(2);
    expect(parametricDecomp(c, 'E', 'F', SEEDS)).toBeNull();
  });
});
