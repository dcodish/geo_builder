/**
 * #422 — a parametric line's RUNNING parameter letter is the STUDENT'S.
 *
 * Reported 2026-07-29: «l1:x=(4,5,-1)+m(k, 1,0)» was not understood. The `t` spelling of that exact
 * line builds end-to-end — the engine, the sampler, the echo and the save whitelist all support it —
 * so only the grammar rejected the student's choice of letter.
 *
 * A parametric line carries TWO letters in two roles, and only one of them is the tool's business:
 *
 *  - the RUNNING parameter, outside the parens (`m` here). A bound variable: the student picks it and
 *    its identity means nothing to the figure;
 *  - the FIGURE parameter, inside a component (`k` here). A free DOF the givens later pin.
 *
 * The grammar fixed the bound one at `t`, so the identical geometry with the two letters swapped
 * between roles had no rule at all. This is the ADR-3D-038 shape — "the single-ℓ model was a PARSER
 * artifact" — where a fixed token stands in for something the student states.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';

const cmds = (u: string) => {
  const r = parse3(u);
  return r.ok ? r.commands : null;
};

describe('#422 — the reported utterance, and the letters that must agree', () => {
  it('«l1:x=(4,5-1)+m(k,1,0)» parses — the exact report', () => {
    expect(cmds('l1:x=(4,5,-1)+m(k, 1,0)')).not.toBeNull();
  });

  it('m / s / t produce the IDENTICAL line, bar the echoed letter', () => {
    const strip = (u: string) => {
      const c = cmds(u)![0] as Record<string, unknown>;
      const { src: _src, runner: _runner, ...rest } = c;
      return rest;
    };
    expect(strip('l1:x=(4,5,-1)+m(k,1,0)')).toEqual(strip('l1:x=(4,5,-1)+t(k,1,0)'));
    expect(strip('l1:x=(4,5,-1)+s(k,1,0)')).toEqual(strip('l1:x=(4,5,-1)+t(k,1,0)'));
  });

  it('the FIGURE parameter is still read from inside the components', () => {
    expect(cmds('l1:x=(4,5,-1)+m(k,1,0)')![0]).toMatchObject({ param: 'k' });
  });

  it('the 2024-Q2 form is byte-identical — the widening subsumes the old path', () => {
    const before = { type: 'line3', name: 'ℓ', param: 'm', src: 'x = (-1,5,-11) + t·(m-1, 5-m, -2)' };
    expect(cmds('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)')![0]).toMatchObject(before);
    // …and carries NO `runner`, so an existing .geo3.json re-saves unchanged
    expect(cmds('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)')![0]).not.toHaveProperty('runner');
  });

  it('the anchor-less #351 form reaches the widened gate too', () => {
    expect(cmds('x = (1,2,3) + m(1,0,0)')).not.toBeNull();
    expect(cmds('l1:x=m(0,k,2)')).not.toBeNull();
  });

  it('ONE letter in BOTH roles is REFUSED with a clarification, never guessed and never escalated (#516)', () => {
    // «m(m-1, 5-m, -2)» conflates a bound variable with a figure DOF. Which the student meant is not
    // ours to decide — and not the LLM lane's either: deferring this as `not-handled` sent it to the
    // fallback, which built the `t` reading and silently rewrote the student's letter (operator play,
    // 2026-08-11). A recognized ambiguity is a TYPED refusal carrying the letter for the message.
    expect(cmds('l1:x=m(m-1, 5-m, -2)')).toBeNull(); // the rule itself still declines…
    expect(parse3('l1:x=m(m-1, 5-m, -2)')).toEqual({ ok: false, reason: 'param-roles-conflated', letter: 'm' });
    // …in the anchor-full form too, and regardless of the letter
    expect(parse3('l1:x=(4,5,-1)+k(k, 1,0)')).toEqual({ ok: false, reason: 'param-roles-conflated', letter: 'k' });
  });

  it('an AXIS letter can never be read as a running parameter', () => {
    expect(cmds('x = x(1,0,0)')).toBeNull(); // `[a-w]` mirrors PARAM_TERM's charset, keeping x/y/z out
  });
});

describe('#422 — the figure builds, and the echo speaks the student\'s notation', () => {
  beforeEach(() => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null, planeDisplay: {}, queries: [] });
    useGeo3.temporal.getState().clear();
  });

  it('the operator\'s line builds, k stays a free sampled DOF, and the echo keeps «m»', () => {
    useGeo3.getState().submit('l1:x=(4,5,-1)+m(k, 1,0)');
    expect(useGeo3.getState().lastError).toBeNull();

    const forms = (seed: number): string[] => {
      const d = derive3(useGeo3.getState().facts, seed);
      return buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }).lines.map((l) => l.form ?? '');
    };
    // the echo carries the STUDENT'S letter — it used to be rewritten to `t` at both echo sites
    expect(forms(0).some((f) => f.includes('m·('))).toBe(true);
    expect(forms(0).some((f) => f.includes('t·('))).toBe(false);
    // …and it is seed-INVARIANT, because an unforced parameter prints its symbolic form (ADR-3D-096)
    expect(forms(1)).toEqual(forms(0));
    expect(forms(7)).toEqual(forms(0));
  });

  it('a `t` line still echoes «t» — the default is untouched', () => {
    useGeo3.getState().submit('l1:x=(4,5,-1)+t(k, 1,0)');
    const d = derive3(useGeo3.getState().facts, 0);
    const forms = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }).lines.map((l) => l.form ?? '');
    expect(forms.some((f) => f.includes('t·('))).toBe(true);
  });

  it('#516 — the store surfaces the typed refusal, so the App can NEVER escalate it to the LLM lane', () => {
    // The App's escalation gate is `err.code === 'not-understood'` — this code is the whole guarantee:
    // as long as the conflated form carries its own code, no fallback call can launder it into a build.
    useGeo3.getState().submit('l1:x=m(m-1, 5-m, -2)');
    expect(useGeo3.getState().lastError).toEqual({ code: 'param-roles-conflated', letter: 'm' });
    expect(useGeo3.getState().facts).toHaveLength(0); // nothing committed
  });
});
