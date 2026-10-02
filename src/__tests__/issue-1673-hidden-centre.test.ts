/**
 * #1673 ([ADR-565](../../docs/06-decisions.md#adr-565)) — an UNNAMED circle's centre answers to no letter until a
 * sentence names it. Operator ruling 2026-10-02 on #1670: *"an unlablled circle should not be O automatically"*.
 *
 * The runner is the real pre-LLM decision `runSubmit` dispatches — `decideDeterministic2D` — with each accepted line
 * applied to the store exactly as the pipeline applies it (the #1649 parity runner's shape), so the next line sees the
 * figure. An `escalate` would reach the model; the model is mocked and never asked (standing rule 2).
 *
 * The matrix, per what the sentence does with the hidden letter:
 *  - REFERENCES it (a metric, a segment, an operand, a shape vertex) → refused, the note teaching «O מרכז המעגל»;
 *  - NAMES the centre («O מרכז המעגל», «OB רדיוס», «הרדיוס OB») → builds, O the visible centre (kept);
 *  - calls the circle «מעגל O» and uses it → naming-by-use, as «מעגל K» already did (ADR-347);
 *  - creates a NEW circle «מעגל O» → refused: it would overwrite the unnamed circle;
 *  - INTRODUCES O as its own new point («נקודה O», «O על המעגל») → a fresh point (kept).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import { llmParse } from '@/parser/llm';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
const TANGENCY = 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה';

/** Each line through the real deterministic decision, applied as the pipeline applies it; the LAST verdict. */
async function run(lines: string[], locale: 'he' | 'en' = 'he'): Promise<Verdict2D> {
  st().clear();
  let last: Verdict2D | null = null;
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
    if (v.kind === 'store-op') {
      const res = v.op === 'name-centre' ? st().nameCentre(v.from, v.to) : v.op === 'rename' ? st().rename(v.from, v.to) : v.op === 'swap' ? st().swap(v.from, v.to) : st().merge(v.from, v.to);
      expect(res.ok, `«${line}» store op`).toBe(true);
    } else {
      for (const b of v.binds) if (b.op === 'name-centre') st().nameCentre(b.from, b.to); else st().rename(b.from, b.to);
      if (v.kind === 'commit') st().executeMany([...v.commands], line);
    }
    last = v;
  }
  return last!;
}
const fig = () => replay(st().facts, st().seed);
const pos = (id: string): Vec => {
  const p = fig().positions.get(id);
  expect(p, `${id} has a position`).toBeDefined();
  return p!;
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const theCircle = () => fig().construction.objects.find((o) => o.kind === 'circle') as { id: string; center: string; autoCenter?: boolean };
const noteOf = (v: Verdict2D) => (v.kind === 'refuse' && 'key' in v.note ? v.note : null);

beforeEach(() => vi.mocked(llmParse).mockClear());

describe('#1673 — a reference to the hidden letter is refused, teaching the naming sentence', () => {
  it('the parity row: «BO = 5» after the tangency opener is refused, nothing committed, the model never asked', async () => {
    const v = await run([TANGENCY, 'BO = 5']);
    expect(v.kind === 'refuse' && v.category).toBe('guided');
    expect(noteOf(v)).toEqual({ key: 'input.hiddenCentreLetter', params: { letter: 'O' } });
    expect(llmParse).not.toHaveBeenCalled();
    expect(fig().positions.has('O'), 'no point O').toBe(false);
    expect(theCircle().autoCenter, 'the centre stays hidden').toBe(true);
  });

  it('corpus-2 :315 as typed: «AM חותך את CO בנדוקה K» is refused — no free O is minted beside the circle', async () => {
    const v = await run(['AB קוטר', 'C על במעגל', 'M מחוץ למעגל', 'AM חותך את CO בנדוקה K']);
    expect(noteOf(v)).toEqual({ key: 'input.hiddenCentreLetter', params: { letter: 'O' } });
    expect(fig().positions.has('O')).toBe(false);
    expect(fig().positions.has('K')).toBe(false);
  });

  it.each([
    [['מעגל', 'OA = 5'], 'a metric given'],
    [['AB קוטר', 'AO'], 'a bare segment'],
    [['AB קוטר', 'C על המעגל', 'זווית AOC = 40'], 'an angle at the letter'],
    [['AB קוטר', 'D על CO'], 'an operand of a placing sentence'],
    [['AB קוטר', 'C על המעגל', 'D אמצע OC'], 'a midpoint operand'],
    [['מעגל', 'AB מיתר', 'OM ⊥ AB'], 'a relation operand'],
    [['AB קוטר', 'משולש ABO'], 'a shape vertex'],
    [['AB קוטר', 'המשך הקטע KO'], 'a carrier end'],
  ])('%j (%s) is refused', async (lines) => {
    const v = await run(lines);
    expect(noteOf(v)).toEqual({ key: 'input.hiddenCentreLetter', params: { letter: 'O' } });
  });

  it('two unnamed circles: «OP = 4» binds neither hidden centre (the ADR-342 metric amendment is withdrawn)', async () => {
    const v = await run(['שני מעגלים נחתכים', 'OP = 4']);
    expect(noteOf(v)?.key).toBe('input.hiddenCentreLetter');
    expect(fig().positions.has('O') || fig().positions.has('P')).toBe(false);
  });

  it('the parse boundary itself refuses (the model\'s canonical lines pass the same door)', () => {
    st().clear();
    const r0 = parse('מעגל', buildParseCtx(fig().construction, fig().positions));
    if (!r0.ok) throw new Error('«מעגל» did not parse');
    st().executeMany(r0.commands, 'מעגל');
    const d = fig();
    const r = parse('BO = 5', buildParseCtx(d.construction, d.positions));
    expect(r).toEqual({ ok: false, reason: 'hidden-centre-letter', letter: 'O', as: 'point' });
  });
});

describe('#1673 — the taught remedy, and every sentence that names the centre, keeps building', () => {
  it('the note\'s own remedy works: «O מרכז המעגל», then the refused «BO = 5» builds on the real centre', async () => {
    const v = await run([TANGENCY, 'BO = 5', 'O מרכז המעגל', 'BO = 5']);
    expect(v.kind).toBe('commit');
    expect(theCircle().center).toBe('O');
    expect(theCircle().autoCenter).toBeUndefined();
    expect(dist(pos('B'), pos('O'))).toBeCloseTo(5, 4);
    expect(dist(pos('O'), pos('A'))).toBeCloseTo(dist(pos('O'), pos('C')), 6);
  });

  it('corpus-2 :315 with «O מרכז המעגל»: K lies on CO, O the circle centre', async () => {
    const v = await run(['AB קוטר', 'O מרכז המעגל', 'C על במעגל', 'M מחוץ למעגל', 'AM חותך את CO בנדוקה K']);
    expect(v.kind).toBe('commit');
    expect(dist(pos('O'), pos('A'))).toBeCloseTo(dist(pos('O'), pos('B')), 6);
    const C = pos('C'), O = pos('O'), K = pos('K');
    expect(Math.abs((O.x - C.x) * (K.y - C.y) - (O.y - C.y) * (K.x - C.x)) / dist(C, O), 'K on line CO').toBeLessThan(1e-6);
  });

  it.each([['OB רדיוס'], ['הרדיוס OB'], ['O מרכז המעגל']])('«AB קוטר» · «%s» names the centre O (kept)', async (line) => {
    const v = await run(['AB קוטר', line]);
    expect(v.kind === 'commit' || v.kind === 'store-op').toBe(true);
    expect(theCircle().center).toBe('O');
    expect(theCircle().autoCenter).toBeUndefined();
  });

  it('English: "O is the centre of the circle" names it; the refusal note has its English key', async () => {
    const refused = await run(['AB קוטר', 'BO = 5'], 'en');
    expect(noteOf(refused)?.key).toBe('input.hiddenCentreLetter');
    const v = await run(['AB קוטר', 'O is the centre of the circle', 'BO = 5'], 'en');
    expect(v.kind).toBe('commit');
    expect(theCircle().center).toBe('O');
  });
});

describe('#1673 — «מעגל O» is the student\'s own name for the circle', () => {
  it('«CD קוטר במעגל O» names the unnamed centre O by use, as «מעגל K» names K', async () => {
    const v = await run(['AB קוטר', 'CD קוטר במעגל O']);
    expect(v.kind).toBe('commit');
    expect(theCircle().center).toBe('O');
    expect(theCircle().autoCenter).toBeUndefined();
    const after = await run(['AB קוטר', 'CD קוטר במעגל O', 'BO = 5']);
    expect(after.kind, 'O is now the student\'s, so «BO = 5» builds').toBe('commit');
  });

  it('«מעגל O» standing alone would overwrite the unnamed circle — refused, the diameter circle intact', async () => {
    const v = await run(['AB קוטר', 'מעגל O']);
    expect(noteOf(v)).toEqual({ key: 'input.hiddenCentreCircle', params: { letter: 'O' } });
    const circles = fig().construction.objects.filter((o) => o.kind === 'circle');
    expect(circles).toHaveLength(1);
    const c = pos((circles[0] as { center: string }).center);
    expect(dist(c, pos('A'))).toBeCloseTo(dist(c, pos('B')), 6);
    expect(dist(c, pos('A')) * 2).toBeCloseTo(dist(pos('A'), pos('B')), 6);
  });

  it('a fresh letter is unchanged: «מעגל K» draws a second circle', async () => {
    const v = await run(['AB קוטר', 'מעגל K']);
    expect(v.kind).toBe('commit');
    expect(fig().construction.objects.filter((o) => o.kind === 'circle')).toHaveLength(2);
  });
});

describe('#1673 — a sentence that introduces O as its own new point keeps building', () => {
  it('«נקודה O» then «BO = 5»: O is a fresh point, the centre stays hidden', async () => {
    const v = await run(['AB קוטר', 'נקודה O', 'BO = 5']);
    expect(v.kind).toBe('commit');
    expect(theCircle().autoCenter, 'the circle centre is still unnamed').toBe(true);
    expect(dist(pos('B'), pos('O'))).toBeCloseTo(5, 4);
  });

  it('«O על המעגל» places a fresh O on the circle', async () => {
    const v = await run(['AB קוטר', 'O על המעגל']);
    expect(v.kind).toBe('commit');
    const c = theCircle();
    expect(c.autoCenter).toBe(true);
    const ctr = pos(c.center);
    expect(dist(ctr, pos('O'))).toBeCloseTo(dist(ctr, pos('A')), 6);
  });
});
