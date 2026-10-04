/**
 * #1547 (ADR-3D-299) — ONE COORDINATE of a point can be stated and asked.
 *
 * Operator, 2026-09-29: *"x_{B}=3 is not supported on 3d tool. same for שיעור ה- x של נקודה B הוא 3"*.
 * Before: every spelling below was `not-handled` (escalated to the model), and the ask lane read none of
 * them. «x_B = 3» is «B(3, ·, ·)» with y and z unstated — the ADR-AG-042 identity — so it lowers to a
 * `point3` with the other two components null: an existing B takes the M1 pin + the #1546 claim, a new B
 * is the ADR-3D-094 partial point whose open components are free.
 *
 * Every statement goes through `decideSubmit3`, the real submit decision; every question through
 * `answerQuery`, the real ask lane.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { answerQuery } from '../engine/queries';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';

type St = { facts: Fact3[]; seed: number };
const CUBE = "קובייה ABCDA'B'C'D'";

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`«${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
const at = (st: St, id: string, seed: number) => derive3(st.facts, seed).positions.get(id)!;
const ask = (st: St, q: string) => answerQuery(derive3(st.facts, st.seed).construction, q, st.seed);

describe('#1547 — his two lines', () => {
  for (const line of ['x_{B}=3', 'שיעור ה- x של נקודה B הוא 3']) {
    it(`«${line}» on a cube: B lands at x = 3 (the cube follows)`, () => {
      const st = build([CUBE, line]);
      for (const s of [0, 1, 2]) expect(at(st, 'B', s).x).toBeCloseTo(3, 6);
    });
    it(`«${line}» on an empty canvas: B is created, x = 3, y and z FREE (ADR-052)`, () => {
      const st = build([line]);
      const ps = [0, 1, 2, 3].map((s) => at(st, 'B', s));
      for (const p of ps) expect(p.x).toBeCloseTo(3, 6);
      expect(new Set(ps.map((p) => `${p.y.toFixed(4)},${p.z.toFixed(4)}`)).size).toBeGreaterThan(1);
    });
  }
});

describe('#1547 — every spelling of the frame reads, and reads the same command', () => {
  const x3 = [{ type: 'point3', id: 'B', x: 3, y: null, z: null }];
  it.each([
    'x_{B}=3', 'x_B=3', 'x_B = 3', 'B_x=3', 'שיעור ה-x של נקודה B הוא 3', 'שיעור ה- x של נקודה B הוא 3',
    'שיעור ה-x של הנקודה B הוא 3', 'שיעור ה-x של B הוא 3', 'שיעור ה-x של B שווה ל-3', 'ערך ה-x של B הוא 3',
    'x של B הוא 3', 'the x coordinate of B is 3', 'the x-coordinate of B is 3', 'the x value of point B is 3',
  ])('«%s» ≡ B(3, ·, ·)', (line) => {
    expect(parse3(line)).toEqual({ ok: true, commands: x3 });
  });

  it('the other axes, signed and surd values', () => {
    expect(parse3('y_B=-2')).toEqual({ ok: true, commands: [{ type: 'point3', id: 'B', x: null, y: -2, z: null }] });
    expect(parse3('z_{B}=0')).toEqual({ ok: true, commands: [{ type: 'point3', id: 'B', x: null, y: null, z: 0 }] });
    expect(parse3("x_{C'} = 1/2")).toEqual({ ok: true, commands: [{ type: 'point3', id: "C'", x: 0.5, y: null, z: null }] });
  });

  /** The equivalence lock CALLS the parser on both spellings — it never restates the lowering. */
  it('«x_B = 3» is the partial-pin spelling «B(3, n, p)» minus its symbol names', () => {
    const pin = parse3('B(3, n, p)');
    expect(pin.ok).toBe(true);
    if (!pin.ok) return;
    const { syms: _syms, ...bare } = pin.commands[0] as { syms?: unknown };
    void _syms;
    expect(parse3('x_B = 3')).toEqual({ ok: true, commands: [bare] });
  });

  it('the sign frame shares it: article-less «של נקודה B» now reads, and a comparison with ZERO is a sign', () => {
    const pos = { ok: true, commands: [{ type: 'sign-given', id: 'B', axis: 'x', positive: true }] };
    expect(parse3('שיעור ה-x של נקודה B חיובי')).toEqual(pos);
    expect(parse3('שיעור ה-x של הנקודה B חיובי')).toEqual(pos);
    expect(parse3('x_B > 0')).toEqual(pos);
    expect(parse3('x_B < 0')).toEqual({ ok: true, commands: [{ type: 'sign-given', id: 'B', axis: 'x', positive: false }] });
  });

  it('out of v1 scope stays unread: ≥ 0 (would be strengthened to > 0) and a two-point comparison', () => {
    expect(parse3('x_B ≥ 0')).toEqual({ ok: false, reason: 'not-handled' });
    expect(parse3('x_B > x_D')).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('#1547 — honest refusals', () => {
  it('a false coordinate on a typed point is refused and B stays (the #1546 claim)', () => {
    const st = build(['B(0,7,8)']);
    for (const line of ['x_B = 3', 'שיעור ה- x של נקודה B הוא 3', 'y_B=-2']) {
      const v = decideSubmit3(st, line);
      expect(v.kind === 'refused' && v.error.code, line).toBe('claim-refuted');
    }
    expect(at(st, 'B', 0)).toMatchObject({ x: 0, y: 7, z: 8 });
  });

  it('a true one is accepted', () => {
    expect(decideSubmit3(build(['B(0,7,8)']), 'x_B = 0').kind).toBe('record');
  });

  it('a SYMBOLIC value is refused BY NAME — never escalated, never zeroing the unstated components', () => {
    for (const ctx of [[], ['B(0,7,8)'], [CUBE]]) {
      const v = decideSubmit3(build(ctx), 'x_B = 2t');
      expect(v).toEqual({ kind: 'refused', error: { code: 'component-symbolic', component: 'x_B' } });
    }
  });

  it('the remedy the refusal teaches («x_B = 3») builds', () => {
    expect(decideSubmit3(build([]), 'x_B = 3').kind).toBe('record');
  });
});

describe('#1547 — a component rides what the point already sits on', () => {
  it('a point on a segment is placed by its x', () => {
    const st = build(['A(0,0,0)', 'C(4,0,0)', 'E על AC', 'x_E = 3']);
    for (const s of [0, 1, 2]) expect(at(st, 'E', s).x).toBeCloseTo(3, 6);
  });
  it('an x off the segment is refused', () => {
    const v = decideSubmit3(build(['A(0,0,0)', 'C(4,0,0)', 'E על AC']), 'x_E = 7');
    expect(v.kind).toBe('refused');
  });
  it('two components on a cube vertex', () => {
    const st = build([CUBE, 'z_{B}=0', 'y_B=-2']);
    for (const s of [0, 1, 2]) expect(at(st, 'B', s).y).toBeCloseTo(-2, 6);
  });
});

describe('#1547 — ASKABLE (ADR-3D-279): the question is the statement with its value dropped', () => {
  const QS = ['x_B', 'x_{B}=?', 'שיעור ה-x של B', 'מהו שיעור ה-x של נקודה B?', 'what is the x-coordinate of B?'];

  it.each(QS)('«%s» on B(1, t, 2) answers 1', (q) => {
    expect(ask(build(['B(1, t, 2)']), q).answer).toBe('1');
  });

  /**
   * The ask row prints «<question> = <answer>» (App3's query section), so the answer is the bare value —
   * the round-#1736 pre-play saw «x_B = x_B = 1» when the answer carried the name too.
   */
  it('the ask row reads «x_B = 1», the name once', () => {
    const r = ask(build(['B(1, t, 2)']), 'x_B');
    expect(`${r.text} = ${r.answer}`).toBe('x_B = 1');
    expect(r.answer).not.toMatch(/x_B/);
  });

  it('an open component is undetermined, never a sample', () => {
    expect(ask(build(['B(1, t, 2)']), 'y_B')).toMatchObject({ answer: null, note: 'undetermined' });
    expect(ask(build([CUBE]), 'x_B')).toMatchObject({ answer: null, note: 'undetermined' });
  });

  it('a component stated on a NEW point is knowledge with no frame — and the panel agrees', () => {
    const st = build(['x_B = 3']);
    expect(ask(st, 'x_B').answer).toBe('3');
    expect(ask(st, 'y_B')).toMatchObject({ answer: null, note: 'undetermined' });
    expect(ask(st, 'B').answer).toBe('B(3, ?, ?)');
  });

  it('a stated sign is answered as a sign', () => {
    const st = build(['A(0,0,0)', 'x_B = 3', 'שיעור ה-z של B חיובי']);
    expect(ask(st, 'z_B').answer).toBe('+?');
  });

  it('a letter that is not a point of the figure is not understood', () => {
    expect(ask(build(['B(1, t, 2)']), 'x_Q').note).toBe('notUnderstood');
  });

  /** The class guard: every component row of the catalog is askable with its value dropped. */
  it('every catalog component row is read back by the ask lane', () => {
    const rows = COMMAND_CATALOG_3D.filter((e) => /^(?:x_B|שיעור ה-x של B|the x-coordinate of B)/.test(e.he) || /^(?:x_B|the x-coordinate of B)/.test(e.en));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const st = build(['B(1, t, 2)']);
    for (const r of rows) {
      for (const text of [r.he, r.en]) {
        const q = text.replace(/\s*(?:הוא|is|=)\s*3$/, '');
        expect(ask(st, q).answer, `«${q}»`).toBe('1');
      }
    }
  });
});
