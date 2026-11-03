/**
 * #2039 step 2 — A LINE THAT NAMES ONLY THE FIGURE AS IT STOOD MOVES THE POINTS DRAWN LATEST
 * ([ADR-AG-378](../../docs/06c-decisions-analytic.md#adr-ag-378)).
 *
 * Operator, 2026-10-13 on #2039 (*"the outcome follows 2-D"*), 2026-10-30 ruling 4A (the sector keeps O and A and turns
 * B), and ADR-W-175 sr-27 (2026-11-02): *"an object placed by value stays exactly put; a free one moves as little as
 * possible."* 2-D at `63b3c117`: «AB = 5» moves B only; «זווית A = 50» and «AB = AC» move C only; «מלבן ABCD» + «AB = 6»
 * keeps A; «משולש ABC · D על BC» + «AB = 5» keeps A and C.
 *
 * Root cause: a row stated on a later line than every point it names («AB = 5» after «משולש ABC») was solved jointly
 * with the figure, so the least-squares step spread its correction over every vertex the row (or a relation) reaches —
 * at the drawn configuration A, B and C all moved (0/24 kept for «זווית A = 50»), and the rectangle up to 156 under the
 * anchored step. Now it is fitted by line: the tiers are the earlier free vertices latest-drawn first, the ones placed
 * by value last; the narrowest tier that can meet the line is solved first.
 *
 * Every lock calls `derive` at the configuration the earlier figure drew (ADR-AG-358), as the submit path does.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import abFixture from './fixtures/issue-2039-length-moves-latest.analytic.json';

type D = ReturnType<typeof derive>;
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const at = (d: D, id: string) => d.figure.points.find((p) => p.id === id)!;
/** Per point of the earlier figure, how far it moved when `add` was drawn on the configuration on the screen. */
function moves(base: readonly string[], add: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const s of SEEDS) {
    const d = derive(base, s);
    const n = derive([...base, add], d.configuration);
    expect(n.faults, `${base.join(' · ')} + ${add} @${s}`).toEqual([]);
    for (const p of d.figure.points) {
      const q = at(n, p.id);
      (out.get(p.id) ?? out.set(p.id, []).get(p.id)!).push(Math.hypot(p.x - q.x, p.y - q.y));
    }
  }
  return out;
}
const STILL = 1e-6;
const kept = (m: Map<string, number[]>, id: string) => m.get(id)!.filter((v) => v < STILL).length;
const worst = (m: Map<string, number[]>) => Math.max(...[...m.values()].flat());

describe('#2039 step 2 — the points the line does not need stay exactly put (2-D at 63b3c117)', () => {
  it('the fixture is the operator-facing sequence', () => {
    expect(abFixture.lines).toEqual(['משולש ABC', 'AB = 5']);
  });

  it('«משולש ABC» + «AB = 5»: A and C never move, B meets the length (24/24)', () => {
    const m = moves(['משולש ABC'], 'AB = 5');
    expect(kept(m, 'A')).toBe(24);
    expect(kept(m, 'C')).toBe(24);
    for (const s of SEEDS) {
      const n = derive(['משולש ABC', 'AB = 5'], derive(['משולש ABC'], s).configuration);
      expect(Math.hypot(at(n, 'A').x - at(n, 'B').x, at(n, 'A').y - at(n, 'B').y), `@${s}`).toBeCloseTo(5, 6);
    }
  });

  it('…in English too', () => {
    const m = moves(['triangle ABC'], 'AB = 5');
    expect(kept(m, 'A')).toBe(24);
    expect(kept(m, 'C')).toBe(24);
  });

  it('«משולש ABC» + «AB = AC»: A and B never move, C meets it (24/24)', () => {
    const m = moves(['משולש ABC'], 'AB = AC');
    expect(kept(m, 'A')).toBe(24);
    expect(kept(m, 'B')).toBe(24);
  });

  it('«משולש ABC» + «זווית A = 50»: A never moves; B moves only where C alone would draw an illegible triangle (sr-25)', () => {
    const m = moves(['משולש ABC'], 'זווית A = 50');
    expect(kept(m, 'A')).toBe(24);
    expect(kept(m, 'B')).toBeGreaterThanOrEqual(22);
  });

  it('«משולש ABC · D על BC» + «AB = 5»: A and C never move, D keeps its place along BC', () => {
    const m = moves(['משולש ABC', 'D על BC'], 'AB = 5');
    expect(kept(m, 'A')).toBe(24);
    expect(kept(m, 'C')).toBe(24);
    for (const s of SEEDS) {
      const d = derive(['משולש ABC', 'D על BC'], s);
      const n = derive(['משולש ABC', 'D על BC', 'AB = 5'], d.configuration);
      const t = (x: D) => {
        const [b, c, p] = [at(x, 'B'), at(x, 'C'), at(x, 'D')];
        return ((p.x - b.x) * (c.x - b.x) + (p.y - b.y) * (c.y - b.y)) / ((c.x - b.x) ** 2 + (c.y - b.y) ** 2);
      };
      expect(t(n), `@${s}`).toBeCloseTo(t(d), 6);
    }
  });

  it('«מלבן ABCD» + «AB = 6»: A never moves, and no point jumps further than main did (47.35)', () => {
    const m = moves(['מלבן ABCD'], 'AB = 6');
    expect(kept(m, 'A')).toBe(24);
    expect(worst(m)).toBeLessThan(47.35);
  });

  it('«גזרה AOB» + «זווית AOB = 60»: O and A stay, B turns (ruling 4A, 2026-10-30)', () => {
    const m = moves(['גזרה AOB'], 'זווית AOB = 60');
    expect(kept(m, 'O')).toBe(24);
    expect(kept(m, 'A')).toBe(24);
  });
});

describe('#2039 step 2 — a point placed by value is the last to move (sr-27)', () => {
  it('«משולש ABC · AB = 5» + «זווית A = 50»: A and B (placed by the stated length) never move — C turns', () => {
    // At configuration 3 (measured) no drawing with A and B where they stand is legible: C meets 50° as a sliver, and the
    // display walk shows another configuration (sr-25 above sr-27 there — the Questions of round #2678). Everywhere
    // the configuration on the screen is kept, A and B stay exactly.
    let walks = 0;
    for (const s of SEEDS) {
      const d = derive(['משולש ABC', 'AB = 5'], s);
      const n = derive(['משולש ABC', 'AB = 5', 'זווית A = 50'], d.configuration);
      if (JSON.stringify(n.configuration) !== JSON.stringify(d.configuration)) {
        walks += 1;
        continue;
      }
      for (const id of ['A', 'B']) expect(Math.hypot(at(n, id).x - at(d, id).x, at(n, id).y - at(d, id).y), `${id} @${s}`).toBeLessThan(STILL);
    }
    expect(walks).toBeLessThanOrEqual(1);
  });

  it('«משולש ABC · AB = 5 · זווית A = 50» + «AC = 7»: the stated length and angle stay, C slides along its ray', () => {
    const m = moves(['משולש ABC', 'AB = 5', 'זווית A = 50'], 'AC = 7');
    expect(kept(m, 'A')).toBe(24);
    expect(kept(m, 'B')).toBe(24);
  });

  it('a line no tier can meet without moving a stated point still builds — the last tier moves it', () => {
    // «AB = 5» then «AB = 7» is a contradiction, refused as before; «AB = 5» then «AC = 5 · BC = 9» moves C only.
    const v = derive(['משולש ABC', 'AB = 5', 'AB = 7'], 0);
    expect(v.faults.length).toBeGreaterThan(0);
  });
});

describe('#2039 step 2 — a line that introduces points keeps #1687\'s behaviour', () => {
  it('«מעגל O ברדיוס 3» + «משולש ABC חוסם את מעגל O»: the circle stays put at configuration 0 (#1687, sr-27)', () => {
    const d = derive(['מעגל O ברדיוס 3'], 0);
    const n = derive(['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O'], d.configuration);
    expect(Math.hypot(at(n, 'O').x - at(d, 'O').x, at(n, 'O').y - at(d, 'O').y)).toBeLessThan(STILL);
  });
});
