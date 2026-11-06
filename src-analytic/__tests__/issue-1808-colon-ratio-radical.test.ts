/**
 * #1808 (ADR-AG-418) — «AB:AC=3:√(13)»: a colon ratio's term is any constant `AB = …` reads, and a radical stays exact.
 *
 * The operator's six lines, as typed, must land the rectangle: B = (6,3), D = (−2,4). «√13·AB = 3·AC» and the bare colon
 * are one fact. The slash form lowers to its own `div` tree, so it is compared by the figure, not by the fact.
 */
import { describe, expect, it } from 'vitest';
import { confirmTaught, decideSubmit } from '../app/submit';
import { derive, type Derivation } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';

// The report typed «c(4,7)», which the grammar does not read (`not-handled`, measured 2dcc4880); the ratio is what this locks.
const REPORT = ['מלבן ABCD', 'A(0,0)', 'C(4,7)', 'B ברביע הראשון', 'AC', 'AB:AC=3:√(13)'];
const at = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return [Math.round(p.x * 1e6) / 1e6 + 0, Math.round(p.y * 1e6) / 1e6 + 0];
};
const stripSrc = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (k, x) => (k === 'src' ? undefined : x)));
const factsOf = (line: string) => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`«${line}» did not parse`);
  return stripSrc(r.facts);
};

describe('#1808 — the operator’s six lines', () => {
  it.each([0, 1, 2, 3] as const)('seed %i: B = (6,3), D = (−2,4)', (seed) => {
    const lines = confirmTaught(REPORT, seed);
    expect(lines).toHaveLength(6);
    const d = derive(lines, seed);
    expect(d.faults).toEqual([]);
    expect(at(d, 'B')).toEqual([6, 3]);
    expect(at(d, 'D')).toEqual([-2, 4]);
  });

  it.each(['AB:AC=3:√13', 'AB/AC = 3/√13', '√13·AB = 3·AC'])('«%s» draws the same rectangle', (line) => {
    const d = derive(confirmTaught([...REPORT.slice(0, 5), line], 0), 0);
    expect(d.faults).toEqual([]);
    expect(at(d, 'B')).toEqual([6, 3]);
  });
});

describe('#1808 — the bare colon is the product spelling, fact for fact', () => {
  it('«AB:AC=3:√13» ≡ «√13·AB = 3·AC» in the constraint, and the radical stays a tree', () => {
    const colon = factsOf('AB:AC=3:√13') as Array<{ t: string; k?: { t: string; left: unknown; right: unknown } }>;
    const product = factsOf('√13·AB = 3·AC') as typeof colon;
    const eq = (fs: typeof colon) => fs.find((f) => f.k?.t === 'length-eq')?.k;
    expect(eq(colon)).toEqual(eq(product));
    expect(JSON.stringify(eq(colon))).toContain('"sqrt"');
  });

  it('both radical spellings are one fact', () => {
    expect(factsOf('AB:AC=3:√(13)')).toEqual(factsOf('AB:AC=3:√13'));
  });

  it('plain terms keep their quotient, as «AC = 1.5CB»', () => {
    expect(JSON.stringify(factsOf('AC:CB=3:2'))).toContain('"value":1.5');
  });
});

describe('#1808 — every ratio spelling reads a term', () => {
  const FIG = ['A(0,0)', 'B(4,0)'];
  it.each(['C מחלקת את AB ביחס 1:√2', 'C מחלקת את AB ביחס √2:√3', 'היחס בין AC ל-CB הוא 1:√2'])('%s lands between A and B, at the ratio', (line) => {
    expect(decideSubmit(line, FIG, 0).kind).toBe('record');
    const d = derive([...FIG, line], 0);
    expect(d.faults).toEqual([]);
    const [x] = at(d, 'C');
    const r = /√2:√3/.test(line) ? Math.SQRT2 / Math.sqrt(3) : 1 / Math.SQRT2;
    expect(x / (4 - x)).toBeCloseTo(r, 5);
  });

  it('the prose over two measures keeps its radical: «היחס בין AB ל-CD הוא 3:√13»', () => {
    const d = derive(['A(0,0)', 'B(3,0)', 'C(0,1)', 'D(√13,1)', 'היחס בין AB ל-CD הוא 3:√13'], 0);
    expect(d.faults).toEqual([]);
  });

  it.each(['AB:AC=0:2', 'AB:AC=2:0', 'AB:AC=√0:2', 'AB:AC=-3:√13', 'AB:AC=k:√13', 'AB:AC=3:2.5x', 'AB:AC=3:x'])('not a positive constant is not this rule: %s', (line) => {
    const r = parseLine(line);
    expect(r.ok && r.facts.some((f) => f.t === 'constraint' && f.k.t === 'length-eq' && JSON.stringify(f).includes('sqrt'))).toBe(false);
    expect(decideSubmit(line, ['A(0,0)', 'B(1,0)', 'C(0,1)'], 0).kind).not.toBe('record');
  });
});
