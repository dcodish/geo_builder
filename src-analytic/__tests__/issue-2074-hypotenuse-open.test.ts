/**
 * #2074 (ADR-AG-411, 2-D's ADR-659) — «תיכון ליתר» ON A RIGHT TRIANGLE WITH NO STATED RIGHT ANGLE DRAWS ON THE TRIANGLE
 * AS SHOWN; THE RIGHT-ANGLE VERTEX IS A FREE CHOICE «הציגו תצורה אחרת» CYCLES.
 *
 * Operator, 2026-10-13: *"תיכון ליתר should be drawn using whats currently showing but we need to have dof and show
 * other option will create a different triangle with the constraints in place"*. Ruling 2026-10-14: *"Naming C
 * («CM תיכון ליתר») or AB («תיכון ליתר AB») forces the seat"*, and analytic follows 2-D.
 *
 * Through the real `decideSubmit` and `derive`, reading the DRAWN figure at 24 seeds.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { derive, type Derivation } from '../engine/derive';
import { errorText } from '../app/errorText';
import { segmentKnowledge } from '../app/panelRows';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const RT = 'משולש ישר-זווית ABC';
const TRI = ['A', 'B', 'C'];

function submit(lines: readonly string[]): SubmitVerdict[] {
  const kept: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, kept, 0);
    if (v.kind === 'record') kept.push(v.line);
    return v;
  });
}
function built(lines: readonly string[], seed: number): Derivation {
  submit(lines).forEach((v, i) => expect(v.kind, `${lines[i]} → ${JSON.stringify(v)}`).toBe('record'));
  const d = derive(lines, seed);
  expect(d.faults, JSON.stringify(d.faults)).toEqual([]);
  return d;
}
const refusal = (lines: readonly string[]): string => {
  const v = submit(lines).at(-1)!;
  return v.kind === 'refused' ? v.error.key : v.kind;
};
const P = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
/** The vertex of the drawn ABC holding the right angle. */
const seatOf = (d: Derivation): string => {
  const found = TRI.filter((v) => {
    const [p, q] = TRI.filter((x) => x !== v).map((x) => P(d, x));
    const o = P(d, v);
    return Math.abs((p.x - o.x) * (q.x - o.x) + (p.y - o.y) * (q.y - o.y)) < 1e-6 * Math.hypot(p.x - o.x, p.y - o.y) * Math.hypot(q.x - o.x, q.y - o.y);
  });
  expect(found, 'one right angle').toHaveLength(1);
  return found[0];
};
const across = (v: string) => TRI.filter((x) => x !== v).join('');
const isMid = (d: Derivation, m: string, [u, v]: string) =>
  Math.hypot(P(d, m).x - (P(d, u).x + P(d, v).x) / 2, P(d, m).y - (P(d, u).y + P(d, v).y) / 2) < 1e-6;
const isFoot = (d: Derivation, h: string, from: string, [u, v]: string) => {
  const [U, V, H, F] = [P(d, u), P(d, v), P(d, h), P(d, from)];
  const dx = V.x - U.x;
  const dy = V.y - U.y;
  const n = Math.hypot(dx, dy);
  return Math.abs((H.x - U.x) * dy - (H.y - U.y) * dx) / n < 1e-6 && Math.abs((F.x - H.x) * dx + (F.y - H.y) * dy) / n < 1e-6;
};
const drawn = (d: Derivation) => d.figure.segments.map((s) => [...s.ends].sort().join(''));
const anyBound = (d: Derivation) => d.construction.objects.some((o) => (o.kind === 'derived' || o.kind === 'segment') && o.follows);

describe('#2074 — the operator’s sequence: «משולש ישר-זווית ABC» · «תיכון ליתר»', () => {
  const lines = [RT, 'תיכון ליתר'];

  it('is recorded, and at every configuration M is the midpoint of the side opposite the DRAWN right angle', () => {
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record']);
    const seats = new Set<string>();
    for (const seed of SEEDS) {
      const d = built(lines, seed);
      const seat = seatOf(d);
      expect(isMid(d, 'M', across(seat)), `seed ${seed}: M on ${across(seat)}`).toBe(true);
      expect(drawn(d), `seed ${seed}: the median runs from ${seat}`).toContain([seat, 'M'].sort().join(''));
      seats.add(seat);
    }
    expect([...seats].sort(), 'the seeds draw all three seats').toEqual(TRI);
  });

  it('STABILITY: adding the line never moves A, B or C (≤1e-9, 24 seeds)', () => {
    for (const seed of SEEDS) {
      const before = built([RT], seed);
      const after = built(lines, seed);
      for (const id of TRI) {
        expect(Math.abs(P(after, id).x - P(before, id).x), `${id} @ ${seed}`).toBeLessThanOrEqual(1e-9);
        expect(Math.abs(P(after, id).y - P(before, id).y), `${id} @ ${seed}`).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('the choice is untouched: one cycle (the noun’s), and the line adds no constraint', () => {
    expect(derive(lines, 0).construction.constraints).toEqual(derive([RT], 0).construction.constraints);
  });

  it('the same line twice adds nothing', () => {
    expect(submit([RT, 'תיכון ליתר', 'תיכון ליתר']).at(-1)!.kind).toBe('already-known');
  });
});

describe('#2074 — the class: the other spellings bind and cycle the same way', () => {
  const median = ['התיכון ליתר', 'the median to the hypotenuse', 'נתון תיכון ליתר'];
  for (const line of median) {
    it(`«${line}»: the foot M on the side opposite the drawn right angle, at every seed`, () => {
      for (const seed of SEEDS) {
        const d = built([RT, line], seed);
        expect(isMid(d, 'M', across(seatOf(d))), `seed ${seed}`).toBe(true);
      }
    });
  }
  for (const line of ['גובה ליתר', 'the altitude to the hypotenuse']) {
    it(`«${line}»: the foot H of the perpendicular from the drawn right angle, at every seed`, () => {
      for (const seed of SEEDS) {
        const d = built([RT, line], seed);
        const seat = seatOf(d);
        expect(isFoot(d, 'H', seat, across(seat)), `seed ${seed}`).toBe(true);
        expect(drawn(d)).toContain([seat, 'H'].sort().join(''));
      }
    });
  }
  it('«תיכון ליתר בנקודה K»: the typed foot is the moving midpoint', () => {
    for (const seed of SEEDS) {
      const d = built([RT, 'תיכון ליתר בנקודה K'], seed);
      expect(isMid(d, 'K', across(seatOf(d))), `seed ${seed}`).toBe(true);
      expect(d.figure.points.some((p) => p.id === 'M')).toBe(false);
    }
  });
  it('«גובה ליתר בנקודה K»: the typed foot is the moving foot', () => {
    for (const seed of SEEDS) {
      const d = built([RT, 'גובה ליתר בנקודה K'], seed);
      const seat = seatOf(d);
      expect(isFoot(d, 'K', seat, across(seat)), `seed ${seed}`).toBe(true);
    }
  });
});

describe('#2074 — a typed letter forces the seat (ruling 2026-10-14)', () => {
  for (const [line, vertex, foot] of [
    ['CM תיכון ליתר', 'C', 'M'],
    ['AM תיכון ליתר', 'A', 'M'],
    ['MC תיכון ליתר', 'C', 'M'],
    ['CM הוא התיכון ליתר', 'C', 'M'],
    ['CM is the median to the hypotenuse', 'C', 'M'],
    ['the median to the hypotenuse from B', 'B', 'M'],
    ['תיכון ליתר מ-B', 'B', 'M'],
    ['תיכון מ-B ליתר', 'B', 'M'],
    ['the median from B to the hypotenuse', 'B', 'M'],
    ['התיכון ליתר הוא CM', 'C', 'M'],
    ['תיכון ליתר מ-C בנקודה K', 'C', 'K'],
  ] as const) {
    it(`«${line}»: the right angle at ${vertex} at every seed, the median on the opposite side, nothing bound`, () => {
      for (const seed of SEEDS) {
        const d = built([RT, line], seed);
        expect(seatOf(d), `seed ${seed}`).toBe(vertex);
        expect(isMid(d, foot, across(vertex)), `seed ${seed}`).toBe(true);
        expect(anyBound(d)).toBe(false);
      }
    });
  }
  for (const [line, vertex] of [['גובה ליתר מ-C', 'C'], ['גובה מ-C ליתר', 'C'], ['the altitude to the hypotenuse from A', 'A']] as const) {
    it(`«${line}»: the right angle at ${vertex} and the altitude from it`, () => {
      for (const seed of SEEDS) {
        const d = built([RT, line], seed);
        expect(seatOf(d)).toBe(vertex);
        expect(isFoot(d, 'H', vertex, across(vertex))).toBe(true);
      }
    });
  }
  it('«תיכון ליתר AB» is unchanged: the right angle at C at every seed', () => {
    for (const seed of SEEDS) {
      const d = built([RT, 'תיכון ליתר AB'], seed);
      expect(seatOf(d)).toBe('C');
      expect(isMid(d, 'M', 'AB')).toBe(true);
      expect(anyBound(d)).toBe(false);
    }
  });
  it('a typed vertex that contradicts a stated right angle is refused, never drawn', () => {
    expect(refusal([RT, 'זווית A ישרה', 'CM תיכון ליתר'])).not.toBe('record');
  });
  it('a stated right angle at the typed vertex reads the same', () => {
    for (const seed of [0, 1, 2]) expect(isMid(built([RT, 'זווית A ישרה', 'AM תיכון ליתר'], seed), 'M', 'BC')).toBe(true);
  });
});

describe('#2074 — a right angle stated after the line settles the seat, and the line follows (ADR-596 / FR-ALT-7)', () => {
  for (const [v, side] of [['A', 'BC'], ['B', 'AC'], ['C', 'AB']] as const) {
    it(`«זווית ${v} ישרה» after: M on ${side} at every seed`, () => {
      for (const seed of SEEDS) {
        const d = built([RT, 'תיכון ליתר', `זווית ${v} ישרה`], seed);
        expect(seatOf(d)).toBe(v);
        expect(isMid(d, 'M', side), `seed ${seed}`).toBe(true);
      }
    });
  }
  it('a typed apex after the bound line settles it too', () => {
    for (const seed of SEEDS) {
      const d = built([RT, 'תיכון ליתר', 'AM תיכון ליתר'], seed);
      expect(seatOf(d)).toBe('A');
      expect(isMid(d, 'M', 'BC'), `seed ${seed}`).toBe(true);
    }
  });
});

describe('#2074 — a median and an equation of the hypotenuse always name the same side', () => {
  const EQ = 'משוואת היתר היא y=2x';
  for (const lines of [[RT, EQ, 'תיכון ליתר'], [RT, 'תיכון ליתר', EQ]]) {
    it(`${lines.slice(1).join(' · ')}: M lies on the line, and is the midpoint of the side opposite the right angle`, () => {
      const seats = new Set<string>();
      for (const seed of SEEDS) {
        const d = built(lines, seed);
        const seat = seatOf(d);
        seats.add(seat);
        expect(isMid(d, 'M', across(seat)), `seed ${seed}`).toBe(true);
        const m = P(d, 'M');
        expect(Math.abs(m.y - 2 * m.x), `seed ${seed}: M on y=2x`).toBeLessThan(1e-6);
      }
      expect(seats.size).toBe(3);
    });
  }
});

describe('#2074 — every reader reads the letters of the configuration DRAWN', () => {
  const lines = [RT, 'תיכון ליתר'];
  const seedAt = (v: string) => SEEDS.find((s) => seatOf(derive(lines, s)) === v)!;

  for (const seat of TRI) {
    it(`right angle at ${seat}: the construction, the panel row and «הצג בנייה» name the median from ${seat}`, () => {
      const d = built(lines, seedAt(seat));
      const m = d.construction.objects.find((o) => o.id === 'M');
      expect(m && m.kind === 'derived' && m.follows?.at).toBe(seat);
      const rows = segmentKnowledge(d).map((r) => [...r.ends].sort().join(''));
      expect(rows).toContain([seat, 'M'].sort().join(''));
      for (const other of TRI.filter((x) => x !== seat)) expect(rows).not.toContain([other, 'M'].sort().join(''));
      expect(d.figure.construction.find((k) => k.id === 'M'), 'M shows its construction').toBeDefined();
    });
  }

  it('the stated knee of «גובה ליתר» stands at H on the side opposite the drawn right angle', () => {
    const alt = [RT, 'גובה ליתר'];
    const seed = SEEDS.find((s) => seatOf(derive(alt, s)) === 'B')!;
    const knee = built(alt, seed).stated.rights.find((r) => r.v === 'H');
    expect(knee, 'the knee is stated').toBeDefined();
    expect(knee!.a).toBe('B');
  });
});

describe('#2074 — what still asks', () => {
  const DEF = 'משולש ישר-זווית DEF';
  const TEXT = 'אין בסרטוט צלע יחידה שמתאימה ל«יתר» — הצהירו קודם על המשולש המתאים (למשל «משולש ישר זווית ABC» בשביל היתר, «משולש שווה שוקיים ABC» בשביל הבסיס), או ציינו את הצלע באותיות (למשל «תיכון לצלע AB»).';
  for (const [name, lines] of [
    ['two open right triangles', [RT, DEF, 'תיכון ליתר']],
    ['one open, one stated', [RT, DEF, 'זווית F ישרה', 'תיכון ליתר']],
    ['two stated', [RT, DEF, 'זווית C ישרה', 'זווית F ישרה', 'תיכון ליתר']],
    ['two open, a typed apex', [RT, DEF, 'CM תיכון ליתר']],
  ] as const) {
    it(`${name}: no single host — 2-D’s sentence`, () => {
      const v = submit(lines).at(-1)!;
      expect(v.kind === 'refused' && v.error.key).toBe('ambiguous-role-side');
      expect(v.kind === 'refused' && errorText(v.error, he).replace(/[⁦-⁩]/g, '')).toBe(TEXT);
    });
  }
  it('no right angle at all: the refusal is unchanged', () => {
    expect(refusal(['משולש ABC', 'תיכון ליתר'])).toBe('ambiguous-no-right-angle');
  });
  it('a typed pair that is two vertices names no apex: asked', () => {
    expect(refusal([RT, 'AB תיכון ליתר'])).toBe('ambiguous-role-side');
  });
  it('a foot the figure already holds, and a stated length, are not read on an open seat: they stay with the model', () => {
    expect(refusal([RT, 'K על AB', 'תיכון ליתר בנקודה K'])).toBe('not-handled');
    expect(refusal([RT, 'התיכון ליתר הוא 4'])).toBe('not-handled');
    expect(refusal([RT, 'הגובה ליתר הוא 4'])).toBe('not-handled');
  });
});
