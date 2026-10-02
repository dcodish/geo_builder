/**
 * #1673 / #1688 ([ADR-565](../../docs/06-decisions.md#adr-565)) — the hidden centre letter STEPS ASIDE. Operator
 * ruling 2026-10-02 (#1686/#1688): «BO = 5» beside an unnamed circle draws segment BO "where B is where we know it is
 * and O is free. if the user wants it to be the center, he can write next sentance that O is the center … the user
 * doesnt know that O was assigned."
 *
 * The runner is the real pre-LLM decision `runSubmit` dispatches — `decideDeterministic2D` — with each accepted line
 * applied to the store exactly as the pipeline applies it (store ops, then the binds — `step-aside` included — then
 * the one batch commit), so the next line sees the figure. The model is mocked and never asked (standing rule 2).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { llmParse } from '@/parser/llm';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
const TANGENCY = 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה';

/** Each line through the real deterministic decision, applied as the pipeline applies it; every verdict. */
async function run(lines: string[], locale: 'he' | 'en' = 'he'): Promise<Verdict2D[]> {
  st().clear();
  const out: Verdict2D[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
    if (v.kind === 'store-op') {
      const res = v.op === 'name-centre' ? st().nameCentre(v.from, v.to) : v.op === 'rename' ? st().rename(v.from, v.to) : v.op === 'swap' ? st().swap(v.from, v.to) : st().merge(v.from, v.to);
      expect(res, `«${line}» store op`).toEqual({ ok: true });
    } else {
      const asideOnly = v.kind === 'refuse' && v.binds.every((b) => b.op === 'step-aside');
      for (const b of v.binds) {
        if (b.op === 'name-centre') st().nameCentre(b.from, b.to);
        else if (b.op === 'step-aside') { if (!asideOnly) st().reletterHidden(b.from, b.to); }
        else st().rename(b.from, b.to);
      }
      if (v.kind === 'commit') st().executeMany([...v.commands], line);
    }
    out.push(v);
  }
  return out;
}
const fig = () => replay(st().facts, st().seed);
const pos = (id: string): Vec => {
  const p = fig().positions.get(id);
  expect(p, `${id} has a position`).toBeDefined();
  return p!;
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const circles = () => fig().construction.objects.filter((o) => o.kind === 'circle') as unknown as { id: string; center: string; autoCenter?: boolean }[];
const kindOf = (id: string) => fig().construction.objects.find((o) => o.id === id)?.kind;
const allOk = () => {
  const f = fig();
  expect(Object.values(f.status).every((s) => s === 'ok'), JSON.stringify(f.status)).toBe(true);
  expect(f.violations).toEqual([]);
};
const built = (vs: Verdict2D[]) => vs.forEach((v, i) => expect(['commit', 'noop', 'store-op'], `line ${i + 1}: ${JSON.stringify(v).slice(0, 200)}`).toContain(v.kind));
const onLine = (p: Vec, a: Vec, b: Vec) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / dist(a, b);

beforeEach(() => vi.mocked(llmParse).mockClear());

describe('#1673 — a letter the student types is theirs: the hidden centre letter steps aside', () => {
  it('the parity row: «BO = 5» after the tangency opener draws a FREE point O; the circle stays unnamed', async () => {
    built(await run([TANGENCY, 'BO = 5']));
    expect(llmParse).not.toHaveBeenCalled();
    expect(kindOf('O'), 'O is a free point').toBe('free-point');
    expect(circles()[0].center.startsWith('@ctr-'), 'the circle centre is still unnamed').toBe(true);
    expect(dist(pos('B'), pos('O'))).toBeCloseTo(5, 4);
    allOk();
  });

  it('«O מרכז המעגל» next PLACES that free O at the centre — |BO| = 5 and the tangency hold', async () => {
    built(await run([TANGENCY, 'BO = 5', 'O מרכז המעגל']));
    expect(circles()[0].center).toBe('O');
    expect(circles()[0].autoCenter, 'named ⇒ visible').toBeUndefined();
    const O = pos('O'), A = pos('A'), B = pos('B'), C = pos('C');
    expect(dist(B, O)).toBeCloseTo(5, 4);
    expect(dist(O, A)).toBeCloseTo(dist(O, C), 6);
    expect(Math.abs((A.x - O.x) * (B.x - A.x) + (A.y - O.y) * (B.y - A.y)) / (dist(O, A) * dist(A, B)), 'OA ⟂ AB').toBeLessThan(1e-6);
    allOk();
  });

  it('corpus-2 :315 as typed builds: «CO» uses a free O, and K lies on CO', async () => {
    built(await run(['AB קוטר', 'C על במעגל', 'M מחוץ למעגל', 'AM חותך את CO בנדוקה K']));
    expect(kindOf('O')).toBe('free-point');
    expect(circles()[0].center).not.toBe('O');
    expect(onLine(pos('K'), pos('C'), pos('O'))).toBeLessThan(1e-6);
  });

  it('corpus-2 :315 then «O מרכז המעגל»: O moves to the centre, K still on CO', async () => {
    built(await run(['AB קוטר', 'C על במעגל', 'M מחוץ למעגל', 'AM חותך את CO בנדוקה K', 'O מרכז המעגל']));
    expect(circles()[0].center).toBe('O');
    expect(dist(pos('O'), pos('A'))).toBeCloseTo(dist(pos('O'), pos('B')), 6);
    expect(onLine(pos('K'), pos('C'), pos('O'))).toBeLessThan(1e-6);
  });

  it.each([
    [['מעגל', 'OA = 5']],
    [['AB קוטר', 'AO']],
    [['AB קוטר', 'C על המעגל', 'זווית AOC = 40']],
    [['AB קוטר', 'D על CO']],
    [['מעגל', 'AB מיתר', 'OM ⊥ AB']],
    [['AB קוטר', 'משולש ABO']],
  ])('%j builds with O a new point, never the hidden centre', async (lines) => {
    built(await run(lines));
    expect(fig().positions.has('O'), 'O exists').toBe(true);
    expect(circles().every((c) => c.center !== 'O'), 'no circle is centred at the student\'s O').toBe(true);
  });

  it.each([['OB רדיוס'], ['הרדיוס OB'], ['O מרכז המעגל']])('«AB קוטר» · «%s» names the centre O (kept)', async (line) => {
    built(await run(['AB קוטר', line]));
    expect(circles()).toHaveLength(1);
    expect(circles()[0].center).toBe('O');
    expect(circles()[0].autoCenter).toBeUndefined();
  });

  it('a radius sentence also places an earlier free O: «BO = 5» then «OB רדיוס»', async () => {
    built(await run(['AB קוטר', 'BO = 5', 'OB רדיוס']));
    expect(circles()).toHaveLength(1);
    expect(circles()[0].center).toBe('O');
    expect(dist(pos('O'), pos('B'))).toBeCloseTo(5, 4);
  });

  it('«נקודה O» then «O מרכז המעגל»: the free point is absorbed into the centre', async () => {
    built(await run(['AB קוטר', 'נקודה O', 'O מרכז המעגל']));
    expect(circles()[0].center).toBe('O');
    expect(st().facts.some((f) => f.cmd.type === 'free-point'), 'the bare free-point fact is gone').toBe(false);
  });

  it('English: "BO = 5" then "O is the centre of the circle"', async () => {
    built(await run(['AB קוטר', 'BO = 5', 'O is the centre of the circle'], 'en'));
    expect(circles()[0].center).toBe('O');
  });
});

describe('#1673 — «מעגל O» is the student\'s own name, exactly as «מעגל K» is', () => {
  it('«מעגל O» declares a NEW circle O; the diameter circle stays, A and B on it', async () => {
    built(await run(['AB קוטר', 'מעגל O']));
    const cs = circles();
    expect(cs).toHaveLength(2);
    const first = cs.find((c) => c.center !== 'O')!;
    const ctr = pos(first.center);
    expect(dist(ctr, pos('A')) * 2).toBeCloseTo(dist(pos('A'), pos('B')), 6);
    expect(cs.some((c) => c.center === 'O')).toBe(true);
  });

  it.each([['O'], ['K']])('«C על מעגל %s» beside the one unnamed circle names it by use (ADR-347)', async (L) => {
    built(await run(['AB קוטר', `C על מעגל ${L}`]));
    expect(circles()).toHaveLength(1);
    expect(circles()[0].center).toBe(L);
  });

  it.each([['O'], ['K']])('«CD קוטר במעגל %s» with new C, D declares a new circle %s', async (L) => {
    built(await run(['AB קוטר', `CD קוטר במעגל ${L}`]));
    expect(circles()).toHaveLength(2);
    expect(circles().some((c) => c.center === L)).toBe(true);
  });

  it('«AB קוטר במעגל O» on the circumcircle\'s own points names that circle — AB a real diameter', async () => {
    built(await run(['משולש ABC חסום במעגל', 'AB קוטר במעגל O']));
    expect(circles()).toHaveLength(1);
    expect(circles()[0].center).toBe('O');
    const A = pos('A'), B = pos('B'), C = pos('C');
    expect(((A.x - C.x) * (B.x - C.x) + (A.y - C.y) * (B.y - C.y)) / (dist(A, C) * dist(B, C)), '∠ACB = 90').toBeCloseTo(0, 4);
  });
});

describe('#1688 — the hidden letter never collides with the student\'s naming', () => {
  it('«שני מעגלים נחתכים» · «מרכז המעגל הימני הוא O» does not wipe the figure', async () => {
    built(await run(['שני מעגלים נחתכים', 'מרכז המעגל הימני הוא O']));
    expect(circles()).toHaveLength(2);
    expect(circles().filter((c) => c.center === 'O')).toHaveLength(1);
    allOk();
    built(await run(['שני מעגלים נחתכים', 'AB', 'מרכז המעגל הימני הוא O', 'מרכז המעגל השמאלי הוא P', 'OP']));
    expect(pos('O').x).toBeGreaterThan(pos('P').x);
    allOk();
  });

  it('«AB קוטר» · «שני מעגלים נחתכים» adds two circles and keeps the diameter circle', async () => {
    built(await run(['AB קוטר', 'שני מעגלים נחתכים']));
    const cs = circles();
    expect(cs).toHaveLength(3);
    expect(new Set(cs.map((c) => c.id)).size).toBe(3);
    const through = cs.map((c) => pos(c.center)).some((ctr) => Math.abs(dist(ctr, pos('A')) * 2 - dist(pos('A'), pos('B'))) < 1e-6);
    expect(through, 'A and B are still a diameter of a circle').toBe(true);
    allOk();
  });

  it('ruling (b): two fresh intersecting circles are interchangeable — «O מרכז המעגל» names the first, «P מרכז המעגל» the other', async () => {
    built(await run(['שני מעגלים נחתכים', 'O מרכז המעגל', 'P מרכז המעגל']));
    expect(circles().map((c) => c.center)).toEqual(['O', 'P']); // by order: the first drawn circle takes the first new letter
    allOk();
  });

  it('ruling (b): the bagrut flow builds as typed — «נקודה C על מעגל P» names one circle, «מעגל O» the other', async () => {
    built(await run(['שני מעגלים נחתכים בנקודות A ו B', 'נקודה C על מעגל P', 'המשך CA חותך את מעגל O בנקודה D', 'המשך CB חותך את מעגל O בנקודה E']));
    expect(circles().map((c) => c.center).sort()).toEqual(['O', 'P']);
    const P = pos('P'), O = pos('O');
    expect(dist(pos('C'), P)).toBeCloseTo(dist(pos('A'), P), 6);
    expect(dist(pos('D'), O)).toBeCloseTo(dist(pos('A'), O), 6);
    expect(dist(pos('E'), O)).toBeCloseTo(dist(pos('B'), O), 6);
    // every step built (the far-side order of the extensions is the seed search's job, as in the scenario harness)
    expect(Object.values(fig().status).every((x) => x === 'ok')).toBe(true);
  });

  it('circles a statement already tells apart still ASK: «C על המעגל הגדול» then «O מרכז המעגל»', async () => {
    const vs = await run(['שני מעגלים נחתכים', 'C על המעגל הגדול', 'O מרכז המעגל']);
    const v = vs[2];
    expect(v.kind === 'refuse' && v.category).toBe('clarify');
    expect(v.kind === 'refuse' && 'key' in v.note && v.note.key).toBe('input.unknownCircle');
    expect(circles().every((c) => c.center.startsWith('@ctr-')), 'nothing named').toBe(true);
  });

  it('two unnamed circles: «OP = 4» draws two free points, both circles stay unnamed', async () => {
    built(await run(['שני מעגלים נחתכים', 'OP = 4']));
    expect(kindOf('O')).toBe('free-point');
    expect(kindOf('P')).toBe('free-point');
    expect(circles().every((c) => c.center.startsWith('@ctr-'))).toBe(true);
    expect(dist(pos('O'), pos('P'))).toBeCloseTo(4, 4);
  });
});
