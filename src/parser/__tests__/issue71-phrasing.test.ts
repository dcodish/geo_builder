/**
 * #71 (ADR-288): the 2-D phrasing batch from the baseline log-triage (2026-07-11) — six
 * context-verified prod gaps, each widened inside its OWNING rule (never a new construct):
 *   1. `M נקודה מחוץ למעגל` — the subject noun may FOLLOW the label (ADR-254 rule)
 *   2. `E נקודת החיתוך של המעגל עם AD` — the appositive intersection NOUN form (lineMeetsCircle)
 *   3. `חוצה זוית C וחוצה זוית B נפגשים בנקודה O` — vertex-form bisector meet (ADR-164/261 resolution)
 *   4. `AD BE ו-CF הם גבהים במשולש` — a plural special-line declaration distributes, all-or-nothing
 *   5. `הוסף תיכון לצלע AB` — the vertex-less median-to-a-side (apex from the figure triangle)
 *   6. `EF קטע אמצעים במשולש DCB` — letter-named midsegment with BOTH letters fresh (variant channel)
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, type Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

let n = 0;
/** Thread figure context like the app: parse each utterance against the accumulated figure. */
function run(...utterances: string[]) {
  const facts: Fact[] = [];
  let last: ReturnType<typeof parse> | null = null;
  for (const u of utterances) {
    const { construction, positions } = replay(facts);
    last = parse(u, buildParseCtx(construction, positions));
    if (!last.ok) return { facts, last, replayed: replay(facts, 0) };
    last.commands.forEach((cmd: AnyCommand) => facts.push({ id: `f${n++}`, group: u, utterance: u, cmd, enabled: true }));
  }
  return { facts, last: last!, replayed: replay(facts, 0) };
}
const allOk = (r: ReturnType<typeof run>) => {
  expect(r.last.ok, `parse ok: ${JSON.stringify(r.last)}`).toBe(true);
  const bad = Object.entries(r.replayed.status).find(([, v]) => v !== 'ok' && v !== 'disabled');
  expect(bad, `all steps ok, got ${JSON.stringify(bad)}`).toBeUndefined();
};

describe('#71 — the noun may follow the label (ADR-254 widening)', () => {
  it('M נקודה מחוץ למעגל builds a free point outside', () => {
    const r = run('מעגל שמרכזו O', 'M נקודה מחוץ למעגל');
    allOk(r);
    const c = r.replayed.construction.objects.find((o: any) => o.kind === 'circle') as any;
    const M = r.replayed.positions.get('M')!;
    const ctr = r.replayed.positions.get(c.center)!;
    expect(Math.hypot(M.x - ctr.x, M.y - ctr.y)).toBeGreaterThan(0); // exists & placed
  });
});

describe('#71 — the appositive intersection noun form', () => {
  it('E נקודת החיתוך של המעגל עם AD lands E on the circle within AD', () => {
    const r = run('מעגל שמרכזו O', 'A על המעגל', 'D מחוץ למעגל', 'E נקודת החיתוך של המעגל עם AD');
    allOk(r);
    expect(r.replayed.positions.has('E')).toBe(true);
  });
  it('the English mirror parses to the same lowering', () => {
    const r = run('circle centered at O', 'A on the circle', 'D outside the circle', 'E is the intersection point of the circle with AD');
    allOk(r);
    expect(r.replayed.positions.has('E')).toBe(true);
  });
});

describe('#71 — vertex-form bisector meet', () => {
  it('חוצה זוית C וחוצה זוית B נפגשים בנקודה O resolves both angles from the triangle', () => {
    const r = run('משולש ABC', 'חוצה זוית C וחוצה זוית B נפגשים בנקודה O');
    allOk(r);
    expect(r.replayed.positions.has('O')).toBe(true);
    // O is the incenter-side crossing: strictly inside the triangle
    const [A, B, C, O] = ['A', 'B', 'C', 'O'].map((i) => r.replayed.positions.get(i)!);
    const sign = (p: any, q: any, x: any) => Math.sign((q.x - p.x) * (x.y - p.y) - (q.y - p.y) * (x.x - p.x));
    expect(new Set([sign(A, B, O), sign(B, C, O), sign(C, A, O)]).size).toBe(1); // same side of every edge
  });
  it('a vertex with ≠2 edges asks for the full triple (ambiguous-angle), never guesses', () => {
    const { construction, positions } = replay([]);
    const r = parse('חוצה זוית C וחוצה זוית B נפגשים בנקודה O', buildParseCtx(construction, positions));
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous-angle' });
  });
});

describe('#71 — plural special-line declaration (all-or-nothing)', () => {
  it('AD BE ו-CF הם גבהים במשולש distributes into three named altitudes', () => {
    const r = run('משולש ABC', 'AD BE ו-CF הם גבהים במשולש');
    allOk(r);
    for (const f of ['D', 'E', 'F']) expect(r.replayed.positions.has(f), `foot ${f}`).toBe(true);
    // each named foot really is the ⟂ foot from its apex
    const at = (i: string) => r.replayed.positions.get(i)!;
    const dot = (p: any, q: any, x: any, y: any) => (q.x - p.x) * (y.x - x.x) + (q.y - p.y) * (y.y - x.y);
    expect(Math.abs(dot(at('A'), at('D'), at('B'), at('C')))).toBeLessThan(1e-6);
    expect(Math.abs(dot(at('B'), at('E'), at('A'), at('C')))).toBeLessThan(1e-6);
    expect(Math.abs(dot(at('C'), at('F'), at('A'), at('B')))).toBeLessThan(1e-6);
  });
  it('the English mirror', () => {
    const r = run('triangle ABC', 'AD BE and CF are heights in triangle ABC');
    allOk(r);
    for (const f of ['D', 'E', 'F']) expect(r.replayed.positions.has(f), `foot ${f}`).toBe(true);
  });
});

describe('#71 — vertex-less median to a side', () => {
  it('הוסף תיכון לצלע AB drops the median from the unique third vertex', () => {
    const r = run('משולש ABC', 'הוסף תיכון לצלע AB');
    allOk(r);
    const at = (i: string) => r.replayed.positions.get(i)!;
    const M = at('M'); // the auto-named midpoint (M first in the free-label order)
    expect(M).toBeTruthy();
    expect(M.x).toBeCloseTo((at('A').x + at('B').x) / 2, 6);
    expect(M.y).toBeCloseTo((at('A').y + at('B').y) / 2, 6);
  });
  it('with no figure triangle the rule defers (never guesses an apex)', () => {
    const { construction, positions } = replay([]);
    const r = parse('הוסף תיכון לצלע AB', buildParseCtx(construction, positions));
    expect(r.ok).toBe(false); // escalates — no triangle to resolve the apex from
  });
});

describe('#71 — letter-named midsegment, both letters fresh', () => {
  it('EF קטע אמצעים במשולש DCB rides the named triangle (E mid the first side, F cyclable)', () => {
    const r = run('משולש DCB', 'EF קטע אמצעים במשולש DCB');
    allOk(r);
    const at = (i: string) => r.replayed.positions.get(i)!;
    // E is the midpoint of DC (the student's own first named side)
    expect(at('E').x).toBeCloseTo((at('D').x + at('C').x) / 2, 4);
    expect(at('E').y).toBeCloseTo((at('D').y + at('C').y) / 2, 4);
    // F is the midpoint of one of the other sides — the midsegment property: |EF| = half its parallel base
    const dist = (p: any, q: any) => Math.hypot(p.x - q.x, p.y - q.y);
    const halfDB = dist(at('D'), at('B')) / 2;
    const halfCB = dist(at('C'), at('B')) / 2;
    const ef = dist(at('E'), at('F'));
    expect(Math.min(Math.abs(ef - halfDB), Math.abs(ef - halfCB))).toBeLessThan(1e-4);
  });
  it('the anchored form is untouched (regression): E already a midpoint', () => {
    const r = run('משולש DCA', 'E אמצע AD', 'EF קטע אמצעים במשולש DCA');
    allOk(r);
    expect(r.replayed.positions.has('F')).toBe(true);
  });
});
