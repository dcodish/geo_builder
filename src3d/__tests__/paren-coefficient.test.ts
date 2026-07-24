/**
 * ADR-3D-066 / issue #299 — a parenthesised coefficient carrying an INTERNAL
 * sign (`(1-t)u`, `(2t+1)v`) is ONE term.
 *
 * The class: the term tokenizer shared by every linear-expression parser here
 * split on any `+`/`-` regardless of paren depth, so a grouped coefficient was
 * shredded (`(1-t)*u` → `(1` + `-t)*u`) before any term regex saw it. The term
 * grammars and the engine's affine `LinExpr` (k + p·symbol) were correct all
 * along — only the split was wrong.
 *
 * Class coverage below: the splitter itself, both product forms (`*` and
 * juxtaposed), named AND pair atoms, numeric-only parens, the mirrored sign
 * (`(1-t)` / `(t-1)` / `(2t+1)`), the honest rejections (two symbols, unbalanced
 * parens), the pre-existing forms that must stay byte-identical, and the
 * end-to-end build in both locales.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3, parseParamExpr, parseSymExpr, parseVecExpr, splitTopLevelTerms } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { sub3 } from '../engine/vec3';

describe('splitTopLevelTerms — the shared term tokenizer', () => {
  it('breaks only at top-level +/-, keeping each term its own leading sign', () => {
    expect(splitTopLevelTerms('(1-t)*u+0.5*v+t*w')).toEqual(['(1-t)*u', '+0.5*v', '+t*w']);
    expect(splitTopLevelTerms('(1-t)u+0.5v+tw')).toEqual(['(1-t)u', '+0.5v', '+tw']);
    expect(splitTopLevelTerms('-2u + 3v')).toEqual(['-2u', '+ 3v']);
  });

  it('is byte-compatible with the naive split on paren-free input', () => {
    for (const src of ['1/2u + 1/2v + 5/3w', '-1/3u - 1/3v + 1/3w', 'kDC', 'ay + z - 8', '2KA\'']) {
      const naive = src.trim().split(/(?=[+-])/).map((p) => p.trim()).filter(Boolean);
      expect(splitTopLevelTerms(src)).toEqual(naive);
    }
  });

  it('rejects unbalanced parens outright rather than half-reading them', () => {
    expect(splitTopLevelTerms('(1-t)u + (2v')).toBeNull();
    expect(splitTopLevelTerms('1-t)u')).toBeNull();
  });
});

describe('a parenthesised symbolic coefficient is one term', () => {
  const coeffs = (src: string) => parseSymExpr(src)?.terms.map((t) => t.coeff);

  it('parses the reported forms — product `*` and juxtaposed alike', () => {
    for (const src of ['(1-t)*u+0.5*v+t*w', '(1-t)u+0.5v+tw', '(1-t)·u + 0.5·v + t·w']) {
      expect(parseSymExpr(src), src).toEqual({
        terms: [
          { coeff: { k: 1, p: -1 }, atom: { kind: 'named', name: 'u' } },
          { coeff: { k: 0.5, p: 0 }, atom: { kind: 'named', name: 'v' } },
          { coeff: { k: 0, p: 1 }, atom: { kind: 'named', name: 'w' } },
        ],
        symbol: 't',
      });
    }
  });

  it('handles the sign mirrors and a symbol with its own coefficient', () => {
    expect(coeffs('(t-1)u')).toEqual([{ k: -1, p: 1 }]);
    expect(coeffs('(2t+1)v')).toEqual([{ k: 1, p: 2 }]);
    expect(coeffs('-(1-t)u')?.[0]).toEqual({ k: -1, p: 1 });
  });

  it('applies to PAIR atoms, not just named vectors', () => {
    expect(parseSymExpr('(1-t)AB + tAC')).toEqual({
      terms: [
        { coeff: { k: 1, p: -1 }, atom: { kind: 'pair', from: 'A', to: 'B' } },
        { coeff: { k: 0, p: 1 }, atom: { kind: 'pair', from: 'A', to: 'C' } },
      ],
      symbol: 't',
    });
  });

  it('a purely NUMERIC parenthesised coefficient folds to a plain number', () => {
    expect(coeffs('(1-0.25)u')).toEqual([{ k: 0.75, p: 0 }]);
  });

  it('still refuses two different symbols in one expression (the V7 boundary)', () => {
    expect(parseSymExpr('(1-t)u + kv')).toBeNull();
  });

  it('leaves the pre-existing V7 forms byte-identical', () => {
    expect(parseSymExpr('(k/2)DB+kDC')).toEqual({
      terms: [
        { coeff: { k: 0, p: 0.5 }, atom: { kind: 'pair', from: 'D', to: 'B' } },
        { coeff: { k: 0, p: 1 }, atom: { kind: 'pair', from: 'D', to: 'C' } },
      ],
      symbol: 'k',
    });
    expect(parseVecExpr('1/2u + 1/2v + 5/3w')).toHaveLength(3);
    expect(parseParamExpr('m+6')).toEqual({ expr: { k: 6, p: 1 }, param: 'm' });
    expect(parseParamExpr('1-t')).toEqual({ expr: { k: 1, p: -1 }, param: 't' });
  });

  it('lowers through parse3 to a vec-rel carrying the symbol', () => {
    expect(parse3('AS=(1-t)*u+0.5*v+t*w')).toEqual({
      ok: true,
      commands: [
        {
          type: 'vec-rel',
          from: 'A',
          to: 'S',
          terms: [
            { coeff: { k: 1, p: -1 }, atom: { kind: 'named', name: 'u' } },
            { coeff: { k: 0.5, p: 0 }, atom: { kind: 'named', name: 'v' } },
            { coeff: { k: 0, p: 1 }, atom: { kind: 'named', name: 'w' } },
          ],
          symbol: 't',
        },
      ],
    });
  });
});

describe('end-to-end — the affine interpolation form builds', () => {
  const reset = () => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    useGeo3.temporal.getState().clear();
  };
  beforeEach(reset);

  const submit = (u: string) => useGeo3.getState().submit(u);
  const state = () => useGeo3.getState();
  const derived = () => derive3(state().facts, state().seed);

  const HE = ['קובייה ABCD', "נסמן: AB = u, AD = v, AA' = w", 'AS = (1-t)*u + 0.5*v + t*w'];
  const EN = ['cube ABCD', "denote AB = u, AD = v, AA' = w", 'AS = (1-t)u + 0.5v + tw'];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the operator's exact input builds with every fact ok`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(3);
      const d = derived();
      for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
      expect(state().lastError).toBeNull();
      expect(d.positions.get('S')).toBeDefined();
    });
  }

  it('an UNPINNED symbol stays a free DOF — S varies across configurations (ADR-052)', () => {
    HE.forEach(submit);
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const d = derive3(state().facts, i);
      for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
      const s = d.positions.get('S')!;
      seen.add([s.x, s.y, s.z].map((n) => n.toFixed(6)).join(','));
    }
    // a default masquerading as fixed would collapse every seed to one placement
    expect(seen.size).toBeGreaterThan(1);
  });

  it('the pair-atom form places S on line BC at every seed (t interpolates B→C)', () => {
    // S = A + (1-t)·AB + t·AC  ⇒  S = B + t·(C-B): S rides line BC whatever t is
    ['קובייה ABCD', 'AS = (1-t)AB + tAC'].forEach(submit);
    expect(state().facts).toHaveLength(2);
    for (let i = 0; i < 6; i++) {
      const d = derive3(state().facts, i);
      for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
      const [b, c, s] = [d.positions.get('B')!, d.positions.get('C')!, d.positions.get('S')!];
      const bc = sub3(c, b);
      const bs = sub3(s, b);
      // cross(BC, BS) ≈ 0 — collinear
      const cx = bc.y * bs.z - bc.z * bs.y;
      const cy = bc.z * bs.x - bc.x * bs.z;
      const cz = bc.x * bs.y - bc.y * bs.x;
      expect(Math.hypot(cx, cy, cz), `seed ${i}`).toBeLessThan(1e-9);
    }
  });
});
