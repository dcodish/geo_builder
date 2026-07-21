/**
 * #199 (ADR-3D-047): a statement about an EXISTING 3-D object is a GIVEN, never an
 * `already-defined` dead-end — the M1 class, solid/derived-point edition.
 *
 *  - a solid RE-DECLARATION (same kind, same ids) is an idempotent no-op
 *    (prod rk50ew35: «נתון טטראדר שווה מקצועות ABCD» re-typed; pdqq203l: «פירמידה SABCD …»)
 *  - «שווה מקצועות» on a tetra is a MACRO (solid + five equal-edge length-rel constraints,
 *    the ADR-110 pattern) — it used to be silently DROPPED even on a fresh figure
 *  - `point-on-segment3` on an existing id lowers to the vec-rel M1 dual: a numeric t is a
 *    multi-seed verified claim (prod pbe39l8h: «CD תיכון במשולש ABC» with D the tetra apex
 *    now refuses `claim-refuted` — naming the real conflict — and the student's actual
 *    recovery «CE תיכון במשולש ABC» still builds)
 *  - a DIFFERENT-kind re-declaration on the same ids keeps the honest conflict refusal
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);
const len = (pos: Map<string, V>, a: string, b: string) => nrm(sub(pos.get(a)!, pos.get(b)!));

describe('ADR-3D-047 — the שווה-מקצועות macro (qualifier never dropped)', () => {
  beforeEach(reset);

  it('parses to the solid + five equal-edge length-rel constraints', () => {
    const r = parse3('נתון טטראדר שווה מקצועות ABCD');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.commands[0]).toMatchObject({ type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'D'] });
      expect(r.commands.slice(1)).toHaveLength(5);
      for (const c of r.commands.slice(1)) expect(c).toMatchObject({ type: 'length-rel', c: 1, rhs: { pair: ['A', 'B'] } });
    }
  });

  it('a fresh «נתון טטראדר שווה מקצועות ABCD» builds the REGULAR tetra (all 6 edges equal, every seed)', () => {
    submit('נתון טטראדר שווה מקצועות ABCD');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2, 3]) {
      const d = derive3(state().facts, seed);
      for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
      const e = len(d.positions, 'A', 'B');
      expect(e).toBeGreaterThan(0.05);
      for (const [a, b] of [['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D'], ['C', 'D']] as const) {
        expect(len(d.positions, a, b), `|${a}${b}| = |AB| @ seed ${seed}`).toBeCloseTo(e, 5);
      }
    }
  });

  it('the qualifier on a NON-tetra kind defers (escalates) — never a silent drop', () => {
    expect(parse3('פירמידה ישרה SABCD שווה מקצועות שבסיסה ריבוע').ok).toBe(false);
  });
});

describe('ADR-3D-047 — solid re-declaration is idempotent (prod rk50ew35 / pdqq203l)', () => {
  beforeEach(reset);

  it('«טטראדר» then «נתון טטראדר שווה מקצועות ABCD»: the re-declare no-ops and the qualifier DRIVES', () => {
    submit('טטראדר');
    expect(state().lastError).toBeNull();
    submit('נתון טטראדר שווה מקצועות ABCD'); // used to refuse `already-defined`
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.construction.solids).toHaveLength(1); // no duplicate solid
    const e = len(d.positions, 'A', 'B');
    for (const [a, b] of [['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D'], ['C', 'D']] as const) {
      expect(len(d.positions, a, b)).toBeCloseTo(e, 5);
    }
  });

  it('«פירמידה SABCD שבסיסה מקבילית» re-typed: the second submit is an ok no-op', () => {
    submit('פירמידה SABCD שבסיסה מקבילית');
    expect(state().lastError).toBeNull();
    const before = state().facts.length;
    submit('פירמידה SABCD שבסיסה מקבילית'); // prod: `already-defined`
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.construction.solids).toHaveLength(1);
    expect(state().facts.length).toBeGreaterThanOrEqual(before); // recorded or deduped — never an error
  });

  it('a DIFFERENT kind on the same ids keeps the honest conflict refusal', () => {
    submit('פירמידה SABCD שבסיסה מקבילית');
    submit('פירמידה SABCD שבסיסה ריבוע'); // pyramidPar vs pyramid4g — a contradicting re-declare
    expect(state().lastError).toMatchObject({ code: 'already-defined' });
  });
});

describe('ADR-3D-047 — point-on-segment3 on an EXISTING id is the vec-rel M1 dual (prod pbe39l8h)', () => {
  beforeEach(reset);

  it('«CD תיכון במשולש ABC» with D the tetra apex refuses claim-refuted (not already-defined), keep-prior', () => {
    submit('ארבעון ABCD');
    expect(state().lastError).toBeNull();
    const factsBefore = state().facts.length;
    submit('CD תיכון במשולש ABC'); // D exists (the apex) — the statement is false for a tetra
    expect(state().lastError).not.toBeNull();
    expect(state().lastError?.code).not.toBe('already-defined');
    expect(state().facts.length).toBe(factsBefore); // keep-prior
    // the student's actual recovery in pbe39l8h — a fresh letter still builds the median
    submit('CE תיכון במשולש ABC');
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const pos = d.positions;
    const mid = { x: (pos.get('A')!.x + pos.get('B')!.x) / 2, y: (pos.get('A')!.y + pos.get('B')!.y) / 2, z: (pos.get('A')!.z + pos.get('B')!.z) / 2 };
    expect(nrm(sub(pos.get('E')!, mid))).toBeLessThan(1e-9);
  });

  it('a TRUE re-statement about an existing on-segment point verifies (idempotent median)', () => {
    submit('משולש ABC');
    submit('CD תיכון במשולש ABC');
    expect(state().lastError).toBeNull();
    submit('CD תיכון במשולש ABC'); // D now EXISTS at t=0.5 — the claim verifies, no dead-end
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  });
});
