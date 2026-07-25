/**
 * B4 — the P3 3-D parser/query batch (#275 bare parametric line, #322 dup-ScalarPin dedup, #328 definite
 * solid-noun volume query). (#276 — a NEW point on a coordinate axis — is deferred: it needs a new `on-axis`
 * point kind touching apply/evaluate/solve/dof/sign, its own mechanism slice.)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { parseQuery } from '../engine/queries';
import { derive3, useGeo3 } from '../store/store3';

const reset = () => { useGeo3.setState({ facts: [], seed: 0, lastError: null }); useGeo3.temporal.getState().clear(); };
const build = (steps: string[]) => { reset(); for (const u of steps) useGeo3.getState().submit(u); const st = useGeo3.getState(); return derive3(st.facts, st.seed).construction; };
beforeEach(reset);

describe('#275 — a BARE parametric line «x=(0,2,0)+t(2,-2,0)» (no ℓ: prefix) auto-binds ℓ', () => {
  it('binds the canonical ℓ with the right anchor/dir', () => {
    const r = parse3('x=(0,2,0)+t(2,-2,0)');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const line = r.commands.find((c: any) => c.type === 'line3') as any;
    expect(line?.name).toBe('ℓ');
    expect(line.anchor.map((e: any) => e.k)).toEqual([0, 2, 0]); // LinExpr constant term
  });
  it('still parses the named form «הישר ℓ: x = …»', () => {
    expect(parse3('הישר ℓ: x = (0,2,0) + t(2,-2,0)').ok).toBe(true);
  });
  it('NO THEFT: a plane equation «x-y+z=1» is not stolen as line ℓ', () => {
    const r = parse3('x-y+z=1');
    if (r.ok) expect(r.commands.some((c: any) => c.type === 'line3')).toBe(false);
  });
});

describe('#322 — re-typing a constraint-macro utterance does NOT duplicate its ScalarPin', () => {
  it('a rhombus-prism macro re-typed keeps ONE length pin (not two)', () => {
    const once = build(['מנסרה שבסיסה מעוין']);
    const pins1 = once.scalarPins.length;
    expect(pins1).toBeGreaterThan(0); // the macro pushed at least one length pin
    const twice = build(['מנסרה שבסיסה מעוין', 'מנסרה שבסיסה מעוין']);
    expect(twice.scalarPins.length).toBe(pins1); // re-type is idempotent (deduped)
  });
});

describe('#328 — the definite bare solid noun «נפח המנסרה» resolves to THE one prism', () => {
  it('resolves the volume query to the sole prism', () => {
    const c = build(['מנסרה משולשת ישרה']);
    const q = parseQuery(c, 'נפח המנסרה');
    expect(q?.kind).toBe('volume');
    expect((q as any)?.ids?.length).toBeGreaterThanOrEqual(4);
  });
  it('the explicit vertex-run form still works', () => {
    const c = build(['מנסרה משולשת ישרה']);
    // resolve the actual solid ids for the vertex-run form
    const ids = c.solids[0]?.ids ?? [];
    const q = parseQuery(c, `נפח ${ids.join('')}`);
    expect(q?.kind).toBe('volume');
  });
});
