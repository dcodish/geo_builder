/**
 * #1620 stream S4 (ADR-AG-209) — angle bisectors (#1284), medians (#1222) and altitudes (#1240) as givens.
 *
 * Every lock here CALLS the real path — `parseLine` → `derive` (the fold, the solve, the mints) or `decideSubmit`
 * (the gate `App.tsx` dispatches) — and then measures the PROPERTY the role states on the drawn figure: equal
 * angles at the apex, the foot on the opposite side, the midpoint, the right angle. None of them restates the
 * grammar (ADR-W-053), so a lowering that drew a plausible segment without constraining it (the #1232 class)
 * fails here at the seed it drifts at.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';
import { decideSubmit } from '../app/submit';
import { parseLine } from '../parser/parseAnalytic';
import { decideRename, type RenameState } from '../app/rename';

type P = { x: number; y: number };
const SEEDS = [0, 1, 2, 3, 4, 5];

function pts(lines: readonly string[], seed: number): Map<string, P> {
  const d = derive(lines, seed);
  expect(d.faults, `faults at seed ${seed}: ${lines.join(' | ')}`).toEqual([]);
  return new Map(d.figure.points.map((p) => [p.id, { x: p.x, y: p.y }]));
}
const get = (m: Map<string, P>, id: string): P => {
  const p = m.get(id);
  expect(p, `no point ${id}`).toBeDefined();
  return p!;
};
/** The unsigned angle at `v` between the rays to `a` and `b`, in degrees. */
const angleAt = (v: P, a: P, b: P): number => {
  const ux = a.x - v.x;
  const uy = a.y - v.y;
  const wx = b.x - v.x;
  const wy = b.y - v.y;
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
};
/** `p` lies on segment `ab` (strictly inside, not merely on the line). */
const strictlyBetween = (p: P, a: P, b: P): boolean => {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
  return Math.abs(cross) / len < 1e-6 && t > 1e-6 && t < 1 - 1e-6;
};
const onLine = (p: P, a: P, b: P): boolean =>
  Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y) < 1e-6;
const dot = (a: P, b: P, c: P, d: P): number => {
  const u = { x: b.x - a.x, y: b.y - a.y };
  const v = { x: d.x - c.x, y: d.y - c.y };
  return (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
};

/** The bisector at `v` of the angle (a, v, b) passes through `p`, on the INTERNAL ray. */
function expectBisects(m: Map<string, P>, v: string, a: string, b: string, p: string, why: string) {
  const left = angleAt(get(m, v), get(m, a), get(m, p));
  const right = angleAt(get(m, v), get(m, p), get(m, b));
  const whole = angleAt(get(m, v), get(m, a), get(m, b));
  expect(Math.abs(left - right), `${why}: ∠${a}${v}${p}=${left} ∠${p}${v}${b}=${right}`).toBeLessThan(1e-4);
  expect(Math.abs(left + right - whole), `${why}: on the internal ray`).toBeLessThan(1e-4);
}

const verdict = (lines: readonly string[]) => {
  const prior: string[] = [];
  let last: ReturnType<typeof decideSubmit> | null = null;
  for (const line of lines) {
    last = decideSubmit(line, prior, 0);
    if (last.kind === 'record') prior.push(last.line);
  }
  return last!;
};
const refusalKey = (lines: readonly string[]): string => {
  const v = verdict(lines);
  return v.kind === 'refused' ? v.error.key : v.kind;
};

describe('#1284 — the angle bisector, every spelling, measured on the figure', () => {
  const CASES: ReadonlyArray<readonly [string, readonly string[], [string, string, string, string]]> = [
    ['foot named, angle in three letters', ['משולש ABC', 'AD חוצה את הזווית BAC'], ['A', 'B', 'C', 'D']],
    ['foot named, the vertex alone', ['משולש ABC', 'AD חוצה זווית A'], ['A', 'B', 'C', 'D']],
    ['the triangle names the side', ['משולש ABC', 'CE חוצה זווית C במשולש ABC'], ['C', 'A', 'B', 'E']],
    ['the side named outright', ['משולש ABC', 'CE חוצה-זווית לצלע AB'], ['C', 'A', 'B', 'E']],
    ['the copula', ['משולש ABC', 'AD הוא חוצה זווית BAC'], ['A', 'B', 'C', 'D']],
    ['the vertex written second', ['משולש CMD', 'AM הוא חוצה זווית CMD'], ['M', 'C', 'D', 'A']],
    ['english', ['משולש ABC', 'AD bisects angle BAC'], ['A', 'B', 'C', 'D']],
    ['the parity row', ['משולש AOC', 'OD חוצה זווית AOC'], ['O', 'A', 'C', 'D']],
  ];
  it.each(CASES)('%s — equal angles, the foot strictly inside the opposite side, seeds 0–5', (_w, lines, [v, a, b, p]) => {
    for (const seed of SEEDS) {
      const m = pts(lines, seed);
      expectBisects(m, v, a, b, p, `seed ${seed}`);
      expect(strictlyBetween(get(m, p), get(m, a), get(m, b)), `seed ${seed}: ${p} inside ${a}${b}`).toBe(true);
    }
  });

  it('an EXISTING point lies on the internal ray (3/4: «האלכסון DB חוצה את הזווית ADC»)', () => {
    for (const seed of SEEDS) {
      const m = pts(['משולש ABC', 'נקודה P', 'AP חוצה את הזווית BAC'], seed);
      expectBisects(m, 'A', 'B', 'C', 'P', `seed ${seed}`);
      const t = pts(['טרפז ABCD', 'האלכסון DB חוצה את הזווית ADC'], seed);
      expectBisects(t, 'D', 'A', 'C', 'B', `trapezoid seed ${seed}`);
    }
  });

  it('two bisectors meet at the incentre (cat-2d-043, and 1/4\'s plural)', () => {
    for (const seed of SEEDS) {
      const m = pts(['משולש ABC', 'E חיתוך חוצי הזוויות BAC ו-BCA'], seed);
      expectBisects(m, 'A', 'B', 'C', 'E', `A, seed ${seed}`);
      expectBisects(m, 'C', 'B', 'A', 'E', `C, seed ${seed}`);
      // the third bisector passes through it too — the incentre, not merely some crossing
      expectBisects(m, 'B', 'A', 'C', 'E', `B, seed ${seed}`);
      const t = pts(['טרפז ABCD', 'EB ו-EC הם חוצי הזווית ABC ו-BCD בהתאמה הנפגשים בנקודה E'], seed);
      expectBisects(t, 'B', 'A', 'C', 'E', `1/4 B, seed ${seed}`);
      expectBisects(t, 'C', 'B', 'D', 'E', `1/4 C, seed ${seed}`);
    }
  });

  it('every spelling of one bisector is the same figure', () => {
    const ref = ['משולש ABC', 'AD חוצה את הזווית BAC'];
    for (const other of ['AD חוצה זווית A', 'AD חוצה זווית לצלע BC', 'AD חוצה זווית A במשולש ABC', 'AD bisects angle BAC']) {
      for (const seed of [0, 3]) {
        const a = pts(ref, seed);
        const b = pts(['משולש ABC', other], seed);
        for (const id of ['A', 'B', 'C', 'D']) {
          expect(get(b, id).x, `${other} ${id}`).toBeCloseTo(get(a, id).x, 6);
          expect(get(b, id).y, `${other} ${id}`).toBeCloseTo(get(a, id).y, 6);
        }
      }
    }
  });
});

describe('#1222 / #1240 — medians and altitudes whose target or foot the sentence does not name', () => {
  it('«תיכון מ-A במשולש ABC» introduces the triangle and the tool names the foot M, the midpoint of BC', () => {
    for (const seed of SEEDS) {
      const d = derive(['תיכון מ-A במשולש ABC'], seed);
      expect(d.faults).toEqual([]);
      expect(d.minted).toEqual([{ index: 0, id: 'M' }]);
      const m = pts(['תיכון מ-A במשולש ABC'], seed);
      const [b, c, f] = [get(m, 'B'), get(m, 'C'), get(m, 'M')];
      expect(Math.hypot(f.x - (b.x + c.x) / 2, f.y - (b.y + c.y) / 2)).toBeLessThan(1e-6);
      expect(d.figure.segments.map((s) => s.ends.join(''))).toContain('AM');
    }
  });

  it('«גובה מ-A במשולש ABC» — the foot H is on BC and AH ⟂ BC at every seed', () => {
    for (const seed of SEEDS) {
      const m = pts(['גובה מ-A במשולש ABC'], seed);
      const [a, b, c, h] = [get(m, 'A'), get(m, 'B'), get(m, 'C'), get(m, 'H')];
      expect(onLine(h, b, c)).toBe(true);
      expect(Math.abs(dot(a, h, b, c))).toBeLessThan(1e-6);
    }
  });

  const ALTITUDES: ReadonlyArray<readonly [string, readonly string[], [string, string, string, string]]> = [
    ['«AD גובה» — the side from the one triangle', ['משולש ABC', 'AD גובה'], ['A', 'D', 'B', 'C']],
    ['«גובה מנקודה A»', ['משולש ABC', 'גובה מנקודה A'], ['A', 'H', 'B', 'C']],
    ['«גובה לצלע BC» — the apex from the one triangle', ['משולש ABC', 'גובה לצלע BC'], ['A', 'H', 'B', 'C']],
    ['«גובה המשולש לצלע AB הוא CD» (the parity row)', ['משולש ABC', 'גובה המשולש לצלע AB הוא CD'], ['C', 'D', 'A', 'B']],
    ['«הגובה AD לצלע BC»', ['משולש ABC', 'הגובה AD לצלע BC'], ['A', 'D', 'B', 'C']],
    ['«the altitude from A»', ['משולש ABC', 'the altitude from A'], ['A', 'H', 'B', 'C']],
  ];
  it.each(ALTITUDES)('%s — foot on the side line, ⟂, seeds 0–5', (_w, lines, [apex, foot, u, v]) => {
    for (const seed of SEEDS) {
      const m = pts(lines, seed);
      expect(onLine(get(m, foot), get(m, u), get(m, v)), `seed ${seed}`).toBe(true);
      expect(Math.abs(dot(get(m, apex), get(m, foot), get(m, u), get(m, v))), `seed ${seed}`).toBeLessThan(1e-6);
    }
  });

  it.each([
    ['«AD תיכון»', ['משולש ABC', 'AD תיכון'], 'D'],
    ['«תיכון לצלע BC»', ['משולש ABC', 'תיכון לצלע BC'], 'M'],
    ['«תיכון מ-A לצלע BC»', ['משולש ABC', 'תיכון מ-A לצלע BC'], 'M'],
  ] as const)('%s — the foot is the midpoint of BC', (_w, lines, foot) => {
    for (const seed of SEEDS) {
      const m = pts(lines, seed);
      const [b, c, f] = [get(m, 'B'), get(m, 'C'), get(m, foot)];
      expect(Math.hypot(f.x - (b.x + c.x) / 2, f.y - (b.y + c.y) / 2)).toBeLessThan(1e-6);
    }
  });

  it('7/4 — «במשולש OBC, OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה»: two altitudes, each ⟂ its side', () => {
    for (const seed of SEEDS) {
      const m = pts(['במשולש OBC, OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה'], seed);
      expect(onLine(get(m, 'D'), get(m, 'B'), get(m, 'C'))).toBe(true);
      expect(Math.abs(dot(get(m, 'O'), get(m, 'D'), get(m, 'B'), get(m, 'C')))).toBeLessThan(1e-6);
      expect(onLine(get(m, 'E'), get(m, 'O'), get(m, 'C'))).toBe(true);
      expect(Math.abs(dot(get(m, 'B'), get(m, 'E'), get(m, 'O'), get(m, 'C')))).toBeLessThan(1e-6);
    }
  });

  it('a minted foot never takes a letter the figure already uses (ADR-AG-211: the next free letter)', () => {
    const d = derive(['משולש ABC', 'נקודה M', 'תיכון לצלע BC'], 0);
    expect(d.faults).toEqual([]);
    expect(d.minted.map((x) => x.id)).toEqual(['N']);
  });
});

describe('the tool-named foot is renamable by the student (#1222 ruling: "the user can always change it")', () => {
  const session = (lines: string[]): RenameState => ({ lines, disabled: [], queries: [], spokenFor: {}, seed: 0 });
  it.each([
    [['תיכון מ-A במשולש ABC'], 'M', 'תיכון מ-A במשולש ABC פוגש את הצלע בנקודה K'],
    [['משולש ABC', 'גובה מנקודה A'], 'H', 'גובה מנקודה A פוגש את הצלע בנקודה K'],
    [['משולש ABC', 'גובה מ-A לצלע BC'], 'H', 'גובה מ-A לצלע BC פוגש את הצלע בנקודה K'],
    [['משולש ABC', 'תיכון לצלע BC'], 'M', 'תיכון לצלע BC פוגש את הצלע בנקודה K'],
  ] as const)('%s — renaming %s writes the letter into the sentence', (lines, from, expected) => {
    const to = 'K';
    const r = decideRename(from, to, session([...lines]));
    expect(r.kind, JSON.stringify(r)).toBe('apply');
    if (r.kind === 'apply') {
      expect(r.lines[r.lines.length - 1]).toBe(expected);
      const d = derive(r.lines, 0);
      expect(d.faults).toEqual([]);
      expect(d.minted).toEqual([]);
    }
  });
});

describe('free DOFs stay free, and the figure does not jump', () => {
  it('a bisector with a new foot consumes nothing of the triangle; an existing point loses one', () => {
    const tri = derive(['משולש ABC'], 0);
    const foot = derive(['משולש ABC', 'AD חוצה את הזווית BAC'], 0);
    expect(reportedDof(foot.construction, foot.figure.carrierDof)).toBe(reportedDof(tri.construction, tri.figure.carrierDof));
    const free = derive(['משולש ABC', 'נקודה P'], 0);
    const ray = derive(['משולש ABC', 'נקודה P', 'AP חוצה את הזווית BAC'], 0);
    expect(reportedDof(ray.construction, ray.figure.carrierDof)).toBe(reportedDof(free.construction, free.figure.carrierDof) - 1);
    const alt = derive(['משולש ABC', 'AD גובה'], 0);
    expect(reportedDof(alt.construction, alt.figure.carrierDof)).toBe(reportedDof(tri.construction, tri.figure.carrierDof));
  });

  /**
   * STABILITY, as far as this change can promise it. Measured at pickup (main @ 92881500): adding the SHIPPED
   * «AD גובה לצלע BC» to a free «משולש ABC» already re-picks the triangle at seed 0 (A moves by ~12) — the
   * configuration search, not the cevian, chooses the picture (ADR-AG-209 "Not done", escalated). So the lock is
   * twofold: a triangle the student PINNED never moves when a cevian is added, and every new spelling draws exactly
   * what the shipped named spelling draws at every seed — no spelling introduces a jump of its own.
   */
  it.each([['AD חוצה את הזווית BAC'], ['AD גובה'], ['תיכון לצלע BC'], ['E חיתוך חוצי הזוויות BAC ו-BCA']])(
    'a pinned triangle does not move when «%s» is added',
    (line) => {
      const PINNED = ['A(1,6)', 'B(-3,0)', 'C(5,0)', 'משולש ABC'];
      for (const seed of [0, 1, 2]) {
        const after = pts([...PINNED, line], seed);
        expect(get(after, 'A')).toEqual({ x: 1, y: 6 });
        expect(get(after, 'B')).toEqual({ x: -3, y: 0 });
        expect(get(after, 'C')).toEqual({ x: 5, y: 0 });
      }
    },
  );

  it.each([
    ['AD גובה', 'AD גובה לצלע BC'],
    ['AD תיכון', 'AD תיכון לצלע BC'],
    ['AD חוצה את הזווית BAC', 'AD חוצה זווית לצלע BC'],
  ])('«%s» draws what «%s» draws, at every seed', (added, shipped) => {
    for (const seed of SEEDS) {
      const a = pts(['משולש ABC', added], seed);
      const b = pts(['משולש ABC', shipped], seed);
      for (const id of ['A', 'B', 'C']) {
        expect(get(a, id).x, `seed ${seed} ${id}`).toBeCloseTo(get(b, id).x, 6);
        expect(get(a, id).y, `seed ${seed} ${id}`).toBeCloseTo(get(b, id).y, 6);
      }
    }
  });
});

describe('honest refusals', () => {
  it('a bisector contradicting a stated angle is unsatisfiable, naming that statement', () => {
    const v = verdict(['משולש ABC', 'זווית BAC = 60', 'AD חוצה זווית BAC', 'זווית BAD = 40']);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') {
      expect(v.error.key).toBe('unsatisfiable');
      expect(v.error.detail).toContain('זווית BAD = 40');
    }
    // and the other order: the bisector is the statement refused
    expect(refusalKey(['משולש ABC', 'BD חוצה זווית ABC', 'AD חוצה זווית BAC'])).toBe('unsatisfiable');
  });

  it.each([
    ['a bisector of an angle the figure does not have', ['משולש ABC', 'AD חוצה זווית XAC'], 'unknown-reference'],
    ['a segment that does not start at the angle\'s vertex', ['משולש ABC', 'XD חוצה זווית BAC'], 'bisector-wrong-apex'],
    ['the apex stated twice, disagreeing', ['משולש ABC', 'CE חוצה זווית A במשולש ABC'], 'bisector-wrong-apex'],
    ['a lone vertex that is not the segment\'s', ['משולש ABC', 'AD חוצה זווית C'], 'bisector-wrong-apex'],
    ['a bisector ending on one of its own rays', ['משולש ABC', 'AB חוצה זווית BAC'], 'degenerate-role'],
    ['an apex in two triangles — a question', ['משולש ABC', 'משולש ABD', 'AE גובה'], 'ambiguous-cevian'],
    ['an apex in no triangle', ['נקודה A', 'AD גובה'], 'cevian-no-triangle'],
    ['a foot that is a vertex of the side (#1231 through the figure)', ['משולש ABC', 'AB גובה'], 'degenerate-role'],
  ] as const)('%s → %s', (_w, lines, key) => {
    expect(refusalKey(lines)).toBe(key);
  });

  it('«E חיתוך חוצי הזוויות …» with E as an angle vertex is refused, not drawn', () => {
    const r = parseLine('A חיתוך חוצי הזוויות BAC ו-BCA');
    expect(r.ok).toBe(false);
  });
});
