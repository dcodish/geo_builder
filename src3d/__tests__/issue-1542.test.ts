/**
 * #1542 (ADR-3D-429) — «משוואת מישור A'B'C'D' היא x+4y-8z-126=0» went to the LLM.
 *
 * Operator, 2026-09-29: *"doesnt show the chip to to play with the plane view. also - did this go to llm?"*. The plane
 * rules' defining heads were hand-rolled and narrower than the line lane's. His two rulings of that day: the equation row
 * owns the chip unless an earlier row declared the plane (Q1), and a row that MOVED the figure shows ● while a row that
 * was CHECKED keeps ✓ (Q2).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3, type ParseResult3 } from '../parser/parse3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { planeChipsByFact } from '../store/planeChips';
import { claimGivens3, derive3, factLead3, takeLeadFolds3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
const EQ = 'x+4y-8z-126=0';
const CUBE = "קוביה ABCDA'B'C'D'";
const HIS = `משוואת מישור A'B'C'D' היא ${EQ}`;

function build(lines: readonly string[]) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, `«${l}» should commit`).toBeNull();
  }
}
const utterances = () => st().facts.map((f) => f.utterance);
const view = () => derive3(st().facts, st().seed);
const chips = () => {
  const d = view();
  return st().facts.map((f) => planeChipsByFact(st().facts, (id) => d.status[id] === 'ok', (n) => d.resolved.planes.has(n)).get(f.id));
};
const leads = () => {
  const d = view();
  const givens = claimGivens3(st().facts);
  return st().facts.map((f) => factLead3(f, d.status[f.id], givens));
};
const commands = (r: ParseResult3) => (r.ok ? r.commands : r);

beforeEach(() => build([]));

describe('#1542 — every spelling reads as its canonical twin', () => {
  const run = commands(parse3(`מישור A'B'C'D': ${EQ}`));
  const named = commands(parse3(`המישור π: ${EQ}`));

  it.each([
    HIS,
    `משוואת המישור A'B'C'D' היא ${EQ}`,
    `משוואת מישור A'B'C'D': ${EQ}`,
    `המשוואה של המישור A'B'C'D' היא ${EQ}`,
    `המישור A'B'C'D' היא ${EQ}`,
    `the equation of plane A'B'C'D' is ${EQ}`,
    `the equation of the plane A'B'C'D' is ${EQ}`,
    `מישור A'B'C'D' - ${EQ}`,
    `מישור A'B'C'D' ${EQ}`,
    `המישור A'B'C'D' הוא ${EQ}`,
    `נתון כי משוואת המישור A'B'C'D' היא ${EQ}`,
    `given that the equation of plane A'B'C'D' is ${EQ}`,
  ])('point run: «%s»', (line) => {
    expect(commands(parse3(line))).toEqual(run);
  });

  it.each([
    `משוואת המישור π היא ${EQ}`,
    `משוואת מישור π: ${EQ}`,
    `the equation of plane π is ${EQ}`,
    `המישור π הוא ${EQ}`,
    `המישור π היא ${EQ}`,
    `נתון שמשוואת המישור π היא ${EQ}`,
  ])('named: «%s»', (line) => {
    expect(commands(parse3(line))).toEqual(named);
  });

  it('a bare π leaves the space to the separator, so a dash is a dash and never a minus', () => {
    const typed = commands(parse3('מישור π - x+y+z=1')) as Array<{ plane: { cx: { k: number } } }>;
    expect(typed[0].plane.cx.k).toBe(1);
    const glued = commands(parse3('מישור π -x+y+z=1')) as Array<{ plane: { cx: { k: number } } }>;
    expect(glued[0].plane.cx.k).toBe(-1);
  });

  it('every reader of a plane name still reads it, with or without the index', () => {
    expect(commands(parse3('π 1'))).toEqual([{ type: 'free-plane', name: 'π1' }]);
    expect(commands(parse3('π1'))).toEqual([{ type: 'free-plane', name: 'π1' }]);
    expect(commands(parse3('π'))).toEqual([{ type: 'free-plane', name: 'π' }]);
    expect(commands(parse3('A על המישור π'))).toEqual([{ type: 'on-planes', id: 'A', plane: 'π' }]);
    for (const [line, plane] of [
      ['מ-A מורידים אנך למישור π1 בנקודה H', 'π1'],
      ['from A drop a perpendicular to plane pi1 at H', 'π1'],
      ['from A drop a perpendicular to plane π at H', 'π'],
    ]) {
      expect(commands(parse3(line))).toEqual([{ type: 'foot-on-plane', id: 'H', from: 'A', plane }]);
    }
  });

  it('the line lane keeps the lead and its parametric spellings', () => {
    for (const line of ['משוואת הישר AB היא x=(1,2,3)+t(1,0,0)', 'the equation of line AB is (1,2,3)+t(1,0,0)', 'הצגה פרמטרית של הישר AB היא x=(1,2,3)+t(1,0,0)', 'the parametric form of line AB is (1,2,3)+t(1,0,0)']) {
      const r = parse3(line);
      expect(r.ok && r.commands[0].type, line).toBe('line3');
    }
  });

  it('a body that is no equation stays out of the point-run lane, and a lead names nothing alone', () => {
    expect(parse3(`משוואת מישור A'B'C'D' היא x+4y`).ok).toBe(false);
    expect(parse3('מישור ABC מקביל לציר z').ok && (parse3('מישור ABC מקביל לציר z') as { commands: { type: string }[] }).commands[0].type).toBe('coord-plane-rel');
    expect(commands(parse3('מישור ABC'))).toEqual([{ type: 'plane-through', name: 'ABC', ids: ['A', 'B', 'C'] }]);
    expect(parse3('משוואת x+y=1').ok).toBe(false);
  });

  it('the catalog teaches the spelling', () => {
    expect(COMMAND_CATALOG_3D.some((e) => e.he.startsWith('משוואת המישור'))).toBe(true);
  });
});

describe("#1542 — the operator's figure", () => {
  it('builds with no model, the face on the plane, B where stated, and the row owning the chip (Q1)', () => {
    build([CUBE, HIS, 'B(0,7,8)']);
    expect(st().facts.every((f) => view().status[f.id] === 'ok')).toBe(true);
    for (const id of ["A'", "B'", "C'", "D'"]) {
      const p = view().positions.get(id)!;
      expect(Math.abs(p.x + 4 * p.y - 8 * p.z - 126), id).toBeLessThan(1e-6);
    }
    const b = view().positions.get('B')!;
    expect([b.x, b.y, b.z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 7, 8]);
    expect(chips()).toEqual([[], ["A'B'C'D'"], []]);
  });

  it('Q1: an earlier row that declared the plane keeps the chip; one chip per plane', () => {
    build([CUBE, "מישור A'B'C'D'", HIS]);
    expect(chips()).toEqual([[], ["A'B'C'D'"], []]);
  });

  it('Q1: the same sentence with the plane called π owns its chip too', () => {
    build([`משוואת המישור π היא ${EQ}`]);
    expect(chips()).toEqual([['π']]);
  });
});

describe('#1542 — Q2: ● when the equation moved the figure, ✓ when it was checked', () => {
  it('his cube + the equation is a given', () => {
    build([CUBE, HIS, 'B(0,7,8)']);
    expect(leads()).toEqual(['status', 'status', 'status']);
  });

  it('a cube of a stated side still floats in space, so the equation still moves it', () => {
    build([CUBE, 'AB = 4', 'מישור ABCD: z=3']);
    expect(leads()[2]).toBe('status');
  });

  it('points fixed by coordinates + a true equation is a check', () => {
    build(['A(1,0,0)', 'B(0,1,0)', 'C(0,0,1)', 'מישור ABC: x+y+z=1']);
    expect(leads()[3]).toBe('verified');
  });

  it('a solid fixed by its coordinates + a true equation is a check', () => {
    build(["קוביה ABCDA'B'C'D'", 'A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', "A'(0,0,2)", 'מישור ABCD: z=0']);
    expect(leads()[5]).toBe('verified');
  });

  it('a false equation on a fixed plane is still refused', () => {
    build(['A(1,0,0)', 'B(0,1,0)', 'C(0,0,1)']);
    st().submit('מישור ABC: x+y+z=2');
    expect(st().lastError?.code).toBe('claim-refuted');
    expect(st().facts).toHaveLength(3);
  });

  it('every other claim keeps its lead', () => {
    build(['A(1,0,0)', 'B(4,0,0)', 'AB = 3']);
    expect(leads()[2]).toBe('verified');
  });
});

describe('#1542 — a plane equation restated follows #2341 (already known, no row)', () => {
  const known = (context: readonly string[], line: string) => {
    build(context);
    const rows = utterances();
    st().submit(line);
    expect(utterances(), line).toEqual(rows);
    expect(st().lastError, line).toBeNull();
    expect(st().lastNotice, line).toEqual({ code: 'already-stated' });
  };

  it.each([
    `מישור A'B'C'D': ${EQ}`,
    `המישור A'B'C'D' הוא x+4y-8z=126`,
    `מישור A'B'C'D': 2x+8y-16z-252=0`,
    `מישור A'B'C'D': -x-4y+8z+126=0`,
    `מישור C'D'A'B': ${EQ}`,
    HIS,
  ])('his row, then «%s»', (line) => known([CUBE, HIS], line));

  it.each(['משוואת המישור π היא x+y+z=1', 'המישור π: x+y+z-1=0', 'המישור π הוא 2x+2y+2z=2'])('a named plane, then «%s»', (line) =>
    known(['המישור π: x+y+z=1'], line),
  );

  it('a different equation on a named plane stays refused', () => {
    build(['המישור π: x+y+z=1']);
    st().submit('משוואת המישור π היא x+y+z=2');
    expect(st().lastError?.code).toBe('already-defined');
  });

  it('a different equation on a fixed plane stays refused', () => {
    build(['A(1,0,0)', 'B(0,1,0)', 'C(0,0,1)', 'מישור ABC: x+y+z=1']);
    st().submit('מישור ABC: x+y+z=2');
    expect(st().lastError?.code).toBe('claim-refuted');
  });

  it('a muted row is re-ticked, not duplicated', () => {
    build([CUBE, HIS]);
    const row = st().facts[1];
    useGeo3.setState({ facts: st().facts.map((f) => (f.id === row.id ? { ...f, enabled: false } : f)) });
    st().submit(`מישור A'B'C'D': 2x+8y-16z-252=0`);
    expect(utterances()).toEqual([CUBE, HIS]);
    expect(st().facts[1].enabled).toBe(true);
  });

  it('another plane with the same equation is its own statement', () => {
    build(['המישור π: x+y+z=1']);
    st().submit('המישור π1: x+y+z=1');
    expect(st().facts).toHaveLength(2);
  });

  it('a plane whose equation carries a parameter is not read as stated numbers', () => {
    build(['המישור π: mx+z-1=0']);
    st().submit('המישור π: 2mx+2z-2=0');
    expect(st().lastNotice).not.toEqual({ code: 'already-stated' });
  });
});

describe('#1542 Am. 1 — a digit glued to a variable is its coefficient, never the plane\'s index', () => {
  it.each([
    ['מישור π 2x+y=1', 'π', 2],
    ['מישור π2x+y=1', 'π', 2],
    ['מישור π 12x+y=1', 'π', 12],
    ['מישור π 2.5x+y=1', 'π', 2.5],
    ['מישור π2: x+y=1', 'π2', 1],
    ['המישור π2 x-y+z=1', 'π2', 1],
    ['מישור π1 - x+y+z=1', 'π1', 1],
  ])('%s', (line, name, cx) => {
    const c = (commands(parse3(line)) as Array<{ type: string; name: string; plane: { cx: { k: number } } }>)[0];
    expect(c.type).toBe('plane3');
    expect(c.name).toBe(name);
    expect(c.plane.cx.k).toBe(cx);
  });
});

describe('#1542 — every claim row that moved the figure leads with ● (judged q20, sr-19, ADR-3D-431)', () => {
  it('«AB = 3» on a free cube is a given', () => {
    build(["קוביה ABCDA'B'C'D'", 'AB = 3']);
    expect(leads()).toEqual(['status', 'status']);
  });

  it('a statement the figure already held keeps its ✓ (that is #2341\'s, unchanged)', () => {
    build(["קוביה ABCDA'B'C'D'", 'AB = 3', 'AC = 3√2']);
    expect(leads()[2]).toBe('verified');
  });

  it('a row only is the memo: a commit pays for its own row, a second read and another seed pay nothing', () => {
    build(["קוביה ABCDA'B'C'D'", 'AB = 3', 'AC ⟂ BD']);
    claimGivens3(st().facts);
    takeLeadFolds3();
    st().submit("BC = 3");
    const before = st().facts;
    claimGivens3(before);
    expect(takeLeadFolds3()).toBeLessThanOrEqual(1);
    claimGivens3(before);
    useGeo3.setState({ seed: 3 });
    claimGivens3(st().facts);
    expect(takeLeadFolds3()).toBe(0);
  });
});
