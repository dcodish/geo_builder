/**
 * #2018 (ADR-AG-298) — A CEVIAN TO A SIDE NAMED BY ITS ROLE: «תיכון לבסיס», «גובה לשוק», "the median to the base".
 *
 * Operator, #1807 (2026-10-06): *"תיכון לבסיס should be allowed and it should change with other configs"*; accepted
 * at P2 on 2026-10-13, and the plain-triangle refusal kept the same day. Analytic answered `not-handled` to every
 * spelling (measured at `b0e9dbea`), so each went to the paid model. 2-D (ADR-596) builds it and the median follows
 * «הציגו תצורה אחרת»: M = mid BC / CA / AB at apex A / B / C.
 *
 * The class: an object defined by a side named by its ROLE could not follow the configuration, because analytic
 * resolved discrete choices over constraints only. The objects now carry a role binding and `resolvedAt` re-letters
 * them per configuration. Every case runs through the real `decideSubmit` and `derive` and reads the DRAWN figure.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { derive, type Derivation } from '../engine/derive';
import { errorText } from '../app/errorText';
import { segmentKnowledge } from '../app/panelRows';
import { rewriteLine } from '../app/rename';
import { followObjects, roleVertexOf } from '../engine/roles';
import { analyticI18n } from '../i18n';
import type { GeoObject } from '../engine/types';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const ISO = 'משולש שווה שוקיים ABC';

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
const P = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
const len = (d: Derivation, a: string, b: string) => Math.hypot(P(d, a).x - P(d, b).x, P(d, a).y - P(d, b).y);
/** The apex of the drawn isosceles ABC: the vertex whose two sides measure equal. */
const apexOf = (d: Derivation): string => {
  const found = ['A', 'B', 'C'].filter((v) => {
    const [p, q] = ['A', 'B', 'C'].filter((x) => x !== v);
    return Math.abs(len(d, v, p) - len(d, v, q)) < 1e-6 * (len(d, v, p) + len(d, v, q));
  });
  expect(found, 'one apex').toHaveLength(1);
  return found[0];
};
const baseOf = (apex: string) => ['A', 'B', 'C'].filter((x) => x !== apex).join('');
const isMid = (d: Derivation, m: string, [u, v]: string) =>
  Math.hypot(P(d, m).x - (P(d, u).x + P(d, v).x) / 2, P(d, m).y - (P(d, u).y + P(d, v).y) / 2) < 1e-6;
/** Is H the foot of the perpendicular from `from` onto line uv — on the line, and the drop ⟂ it? */
const isFoot = (d: Derivation, h: string, from: string, [u, v]: string) => {
  const [U, V, H, F] = [P(d, u), P(d, v), P(d, h), P(d, from)];
  const dx = V.x - U.x;
  const dy = V.y - U.y;
  const n = Math.hypot(dx, dy);
  const onLine = Math.abs((H.x - U.x) * dy - (H.y - U.y) * dx) / n < 1e-6;
  const perp = Math.abs((F.x - H.x) * dx + (F.y - H.y) * dy) / n < 1e-6;
  return onLine && perp;
};
/** The drawn segments' ends, as sorted letter pairs. */
const drawn = (d: Derivation) => d.figure.segments.map((s) => [...s.ends].sort().join(''));
/** The role-bound objects, without their ids' hashes — what a construction's objects say. */
const objectsOf = (d: Derivation): GeoObject[] => d.construction.objects;

describe('#2018 — the operator’s sequence: «משולש שווה שוקיים ABC» · «תיכון לבסיס»', () => {
  const lines = [ISO, 'תיכון לבסיס'];

  it('is understood (record), and at every configuration M is the midpoint of the side opposite the DRAWN apex', () => {
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record']);
    const bases = new Set<string>();
    for (const seed of SEEDS) {
      const d = built(lines, seed);
      const apex = apexOf(d);
      expect(isMid(d, 'M', baseOf(apex)), `seed ${seed}: M is the midpoint of ${baseOf(apex)}`).toBe(true);
      expect(drawn(d), `seed ${seed}: the median runs from the apex ${apex} to M`).toContain([apex, 'M'].sort().join(''));
      bases.add(baseOf(apex));
    }
    expect([...bases].sort(), 'the seeds draw all three bases').toEqual(['AB', 'AC', 'BC']);
  });

  it('STABILITY: adding the line never moves A, B or C (≤1e-9, 24 seeds)', () => {
    for (const seed of SEEDS) {
      const before = built([ISO], seed);
      const after = built(lines, seed);
      for (const id of ['A', 'B', 'C']) {
        expect(Math.abs(P(after, id).x - P(before, id).x), `${id} @ ${seed}`).toBeLessThanOrEqual(1e-9);
        expect(Math.abs(P(after, id).y - P(before, id).y), `${id} @ ${seed}`).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('the choice is untouched: one cycle (the noun’s), and the line adds no constraint', () => {
    const a = derive([ISO], 0).construction.constraints;
    const b = derive(lines, 0).construction.constraints;
    expect(b).toEqual(a);
  });
});

describe('#2018 — the class: the base and the legs, the median and the altitude, every spelling', () => {
  it('«גובה לבסיס»: H is the foot of the perpendicular from the drawn apex onto the base, at every seed', () => {
    for (const seed of SEEDS) {
      const d = built([ISO, 'גובה לבסיס'], seed);
      const apex = apexOf(d);
      expect(isFoot(d, 'H', apex, baseOf(apex)), `seed ${seed}`).toBe(true);
      expect(drawn(d)).toContain([apex, 'H'].sort().join(''));
    }
  });

  it('«תיכון לשוק»: M is the midpoint of a LEG (a side through the drawn apex), the median from the opposite vertex', () => {
    for (const seed of SEEDS) {
      const d = built([ISO, 'תיכון לשוק'], seed);
      const apex = apexOf(d);
      const legs = ['A', 'B', 'C'].filter((x) => x !== apex).map((x) => [apex, x].sort().join(''));
      const leg = legs.find((l) => isMid(d, 'M', l));
      expect(leg, `seed ${seed}: M on a leg at apex ${apex}`).toBeDefined();
      const from = ['A', 'B', 'C'].find((x) => !leg!.includes(x))!;
      expect(drawn(d)).toContain([from, 'M'].sort().join(''));
    }
  });

  for (const [line, kind] of [['גובה לשוק', 'foot'], ['תיכון לשוק', 'midpoint']] as const) {
    it(`«${line}» twice: the two lines sit on the two DIFFERENT legs at every seed; a third adds nothing`, () => {
      for (const seed of SEEDS) {
        const d = built([ISO, line, line], seed);
        const apex = apexOf(d);
        const sides = d.construction.objects
          .filter((o): o is Extract<GeoObject, { kind: 'derived' }> => o.kind === 'derived' && o.rule.t === kind)
          .map((o) => (o.rule.t === 'midpoint' ? [o.rule.a, o.rule.b] : o.rule.t === 'foot' && o.rule.onto.k === 'points' ? [o.rule.onto.a, o.rule.onto.b] : []).sort().join(''));
        expect(sides, `seed ${seed}`).toHaveLength(2);
        expect(new Set(sides).size, `seed ${seed}: two legs`).toBe(2);
        for (const s of sides) expect(s.includes(apex) && s !== baseOf(apex), `seed ${seed}: ${s} is a leg at apex ${apex}`).toBe(true);
      }
      expect(submit([ISO, line, line, line]).map((v) => v.kind)).toEqual(['record', 'record', 'record', 'already-known']);
    });
  }

  it('the definite and English spellings lower to the same objects as «תיכון לבסיס» / «גובה לשוק»', () => {
    const twins: Array<[string, string, string]> = [
      ['התיכון לבסיס', 'תיכון לבסיס', ISO],
      ['the median to the base', 'תיכון לבסיס', ISO],
      ['median to the base', 'תיכון לבסיס', ISO],
      ['הגובה לבסיס', 'גובה לבסיס', ISO],
      ['the altitude to the base', 'גובה לבסיס', ISO],
      ['הגובה לשוק', 'גובה לשוק', ISO],
      ['the altitude to the leg', 'גובה לשוק', ISO],
      ['the median to the leg', 'תיכון לשוק', 'isosceles triangle ABC'],
    ];
    for (const [spelling, canonical, noun] of twins) {
      for (const seed of [0, 1, 2]) {
        expect(objectsOf(built([noun, spelling], seed)), `${spelling} @ ${seed}`).toEqual(objectsOf(built([noun, canonical], seed)));
      }
    }
  });

  it('«AB = AC» first: «תיכון לבסיס» is the median to BC at every seed — the very facts of «תיכון לצלע BC»', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const d = built([ISO, 'AB = AC', 'תיכון לבסיס'], seed);
      expect(apexOf(d)).toBe('A');
      expect(isMid(d, 'M', 'BC')).toBe(true);
      expect(d.construction).toEqual(built([ISO, 'AB = AC', 'תיכון לצלע BC'], seed).construction);
    }
    expect(derive([ISO, 'AB = AC', 'גובה לבסיס'], 0).construction).toEqual(derive([ISO, 'AB = AC', 'גובה לצלע BC'], 0).construction);
  });

  it('«AB = AC» first: «תיכון לשוק» twice takes AB, then AC — fixed, nothing bound', () => {
    const d = built([ISO, 'AB = AC', 'תיכון לשוק', 'תיכון לשוק'], 0);
    expect(isMid(d, 'M', 'AB')).toBe(true);
    expect(isMid(d, 'N', 'AC')).toBe(true);
    expect(d.construction.objects.some((o) => (o.kind === 'derived' || o.kind === 'segment') && o.follows)).toBe(false);
  });

  it('a LATER pin moves it: «תיכון לבסיס» then «AB = BC» → the median goes to AC at every seed', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const d = built([ISO, 'תיכון לבסיס', 'AB = BC'], seed);
      expect(apexOf(d)).toBe('B');
      expect(isMid(d, 'M', 'AC'), `seed ${seed}`).toBe(true);
      expect(drawn(d)).toContain('BM');
    }
  });

  it('the LETTERED base «תיכון לבסיס BC» is the claim «הבסיס BC» (the apex pinned at A) and «תיכון לצלע BC»', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const d = built([ISO, 'תיכון לבסיס BC'], seed);
      expect(apexOf(d), `seed ${seed}`).toBe('A');
      expect(isMid(d, 'M', 'BC')).toBe(true);
      expect(d.construction).toEqual(built([ISO, 'הבסיס BC', 'תיכון לצלע BC'], seed).construction);
    }
  });

  it('a RENAMED vertex: the rewritten lines bind the new ring, and the median still follows the apex', () => {
    const lines = [rewriteLine(ISO, 'A', 'P')!.line, 'תיכון לבסיס'];
    expect(lines[0]).toBe('משולש שווה שוקיים PBC');
    for (const seed of [0, 1, 2]) {
      const d = built(lines, seed);
      const bound = d.construction.objects.find((o) => o.kind === 'derived' && o.follows);
      expect(bound && bound.kind === 'derived' && bound.follows?.ring).toEqual(['P', 'B', 'C']);
      const apex = ['P', 'B', 'C'].find((v) => {
        const [p, q] = ['P', 'B', 'C'].filter((x) => x !== v);
        return Math.abs(len(d, v, p) - len(d, v, q)) < 1e-6 * (len(d, v, p) + len(d, v, q));
      })!;
      expect(isMid(d, 'M', ['P', 'B', 'C'].filter((x) => x !== apex).join('')), `seed ${seed}`).toBe(true);
    }
  });
});

describe('#2018 — every reader reads the letters of the configuration DRAWN', () => {
  /** A seed whose drawn apex is B. */
  const seedAtB = (lines: readonly string[]) => SEEDS.find((s) => apexOf(derive(lines, s)) === 'B')!;

  it('the derivation’s construction, the panel’s segment row and «הצג בנייה» name the median from B, never A', () => {
    const lines = [ISO, 'תיכון לבסיס'];
    const seed = seedAtB(lines);
    const d = built(lines, seed);
    const m = d.construction.objects.find((o) => o.id === 'M');
    expect(m && m.kind === 'derived' && m.rule).toEqual({ t: 'midpoint', a: 'C', b: 'A' });
    const rows = segmentKnowledge(d).map((r) => [...r.ends].sort().join(''));
    expect(rows).toContain('BM');
    expect(rows).not.toContain('AM');
    const scaffold = d.figure.construction.find((k) => k.id === 'M');
    expect(scaffold, 'M shows its construction').toBeDefined();
    const [line] = scaffold!.lines;
    const ends = [line.a, line.b].map((p) => ['A', 'B', 'C'].find((v) => Math.hypot(P(d, v).x - p.x, P(d, v).y - p.y) < 1e-9)).sort();
    expect(ends, 'the midpoint’s construction is the side CA').toEqual(['A', 'C']);
  });

  it('the stated right angle of «גובה לבסיס» stands at H on the base of the drawn apex', () => {
    const lines = [ISO, 'גובה לבסיס'];
    const seed = seedAtB(lines);
    const d = built(lines, seed);
    const knee = d.stated.rights.find((r) => r.v === 'H');
    expect(knee, 'the knee is stated').toBeDefined();
    expect(knee!.a).toBe('B');
  });

  it('the resolver is canonical: re-resolving a resolved list changes nothing, and one with no bound object is the same array', () => {
    const resolved = derive([ISO, 'תיכון לבסיס', 'AB = BC'], 0).construction.objects;
    const again = followObjects(resolved, derive([ISO, 'תיכון לבסיס', 'AB = BC'], 0).construction.constraints);
    expect(again.find((o) => o.id === 'M')).toEqual({ kind: 'derived', id: 'M', rule: { t: 'midpoint', a: 'C', b: 'A' }, follows: { role: 'base', ring: ['A', 'B', 'C'], at: 'B' } });
    const none = derive([ISO], 0).construction.objects;
    expect(followObjects(none, [])).toBe(none);
    expect(roleVertexOf(derive([ISO, 'AB = AC'], 0).construction.constraints, ['A', 'B', 'C'], 'base')).toEqual(['A']);
  });
});

describe('#2018 — no single isosceles triangle: 2-D’s question, 2-D’s sentence', () => {
  const HE_BASE =
    'אין בסרטוט צלע יחידה שמתאימה ל"בסיס" — הצהירו קודם על המשולש המתאים (למשל "משולש ישר זווית ABC" בשביל היתר, "משולש שווה שוקיים ABC" בשביל הבסיס), או ציינו את הצלע באותיות (למשל "תיכון לצלע AB").';
  for (const [noun, line] of [
    ['משולש ABC', 'תיכון לבסיס'],
    ['משולש שווה צלעות ABC', 'תיכון לבסיס'],
    ['טרפז ABCD', 'גובה לבסיס'],
  ] as const) {
    it(`«${noun}» · «${line}» asks (ambiguous-role-side) with 2-D’s sentence`, () => {
      const [first, v] = submit([noun, line]);
      expect(first.kind).toBe('record');
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') return;
      expect(v.error.key).toBe('ambiguous-role-side');
      expect(errorText(v.error, he)).toBe(HE_BASE);
    });
  }

  it('the leg names its own role, and the English sentence is 2-D’s English', () => {
    const [, v] = submit(['משולש ABC', 'תיכון לשוק']);
    expect(v.kind === 'refused' && errorText(v.error, he)).toContain('ל"שוק"');
    const [, w] = submit(['triangle ABC', 'the median to the base']);
    expect(w.kind === 'refused' && errorText(w.error, en)).toBe(
      'The figure has no single side matching "base" — declare the matching triangle first (e.g. "right triangle ABC" for the hypotenuse, "isosceles triangle ABC" for the base), or name the side by its letters (e.g. "median to side AB").',
    );
  });

  it('TAUGHT REMEDY: every spelling the sentence names is one the tool reads', () => {
    expect(submit([ISO, 'תיכון לבסיס']).map((v) => v.kind)).toEqual(['record', 'record']);
    expect(submit(['משולש ABC', 'תיכון לצלע AB']).map((v) => v.kind)).toEqual(['record', 'record']);
    // the hypotenuse example reaches analytic's RULED question (#1620, 2026-10-02), not a dead end
    const [, hyp] = submit(['משולש ישר זווית ABC', 'תיכון ליתר']);
    expect(hyp.kind === 'refused' && hyp.error.key).toBe('ambiguous-hypotenuse');
  });
});

describe('#2018 — unchanged: what 2-D does not read the same way stays with the model', () => {
  for (const line of ['AD תיכון לבסיס', 'גובה לשוק AC', 'חוצה זווית לבסיס']) {
    it(`«${line}» stays not-handled (#1839 owns the typed letters; 2-D reads no bisector role)`, () => {
      const [, v] = submit([ISO, line]);
      expect(v.kind === 'refused' && v.error.key).toBe('not-handled');
    });
  }
});
