/**
 * #2092 ([ADR-3D-381](../../docs/06b-decisions-3d.md#adr-3d-381)) — «AB = k» IS A VECTOR NAME, AND SAYS SO; «|AB| = k» IS A LENGTH.
 *
 * Measured at d9494206 through the store's real `submit`:
 *   «תיבה ABCDA'B'C'D'» · «AB = k»   → recorded as the vector AB named k, with NO message
 *   «|AB| = k» (any host)             → not understood (no length letter in 3-D)
 *
 * Operator ruling 2026-10-14 (card d14b-2092-k, "A, with teaching"): *"the syntax should be as option A suggests but we
 * say that if the length was the meaning they should write |AB|=k. so we educate also."* — the vector reading stays and
 * is said aloud; the taught form must build.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { bareNamingSlots, type BuildNotice3 } from '../engine/notices';
import { dataView } from '../engine/dataView';
import { errorText3 } from '../i18n/errorText3';
import { deserializeFigure3 } from '../store/figureFile3';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const BOX = "תיבה ABCDA'B'C'D'";
const st = () => useGeo3.getState();
function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null } as never);
  useGeo3.temporal.getState().clear();
}
/** Submit every line; each must record. */
function build(lines: string[]) {
  reset();
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, `«${l}» in ${lines.join(' · ')}`).toBeNull();
  }
  return derive3(st().facts, st().seed);
}
const bareNotes = (n: readonly BuildNotice3[]) => n.filter((x) => x.kind === 'vector-named-bare');
/** The rendered note, bidi isolates stripped (i18n wraps each interpolated value in one). */
const noteText = (n: Extract<BuildNotice3, { kind: 'vector-named-bare' }>, lng: 'he' | 'en') =>
  (i18n3d.t('notice.vectorNamedBare', { ...bareNamingSlots(n), lng }) as string).replace(/[⁦-⁩]/g, '');
const len = (d: ReturnType<typeof derive3>, a: string, b: string) => {
  const p = d.positions.get(a)!;
  const q = d.positions.get(b)!;
  return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
};
const at = (lines: string[], seed: number) => {
  build(lines);
  return derive3(st().facts, seed);
};
const labels = (d: ReturnType<typeof derive3>) =>
  buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1).measures.map((m) => `${[m.a, m.b].sort().join('')}:${m.text}`).sort();

beforeEach(reset);

describe('#2092 — a bare «AB = k» keeps the vector reading and says so', () => {
  it.each([[[BOX, 'AB = k']], [['משולש ABC', 'AB = k']], [[BOX, 'AB=k']]])('%j: the vector is named k, with the note', (lines) => {
    const d = build(lines as string[]);
    expect(d.construction.vectors.get('k')).toMatchObject({ from: 'A', to: 'B' });
    const notes = bareNotes(d.notices);
    expect(notes).toEqual([{ kind: 'vector-named-bare', name: 'k', from: 'A', to: 'B', alt: 'a' }]);
    // #2581 (ADR-3D-385, operator ruling 2026-10-27): the taught length uses a letter the figure does not use
    expect(noteText(notes[0] as never, 'he')).toBe('«AB = k» נקרא כווקטור: k הוא שם הווקטור AB. אם התכוונתם לאורך, כתבו «|AB| = a».');
    expect(noteText(notes[0] as never, 'en')).toBe('«AB = k» is read as a vector: k is the name of the vector AB. If you meant a length, write «|AB| = a».');
  });

  it('every letter, the u, v, w convention included («AB = u»)', () => {
    expect(bareNotes(build([BOX, 'AB = u']).notices)).toEqual([{ kind: 'vector-named-bare', name: 'u', from: 'A', to: 'B', alt: 'a' }]);
  });

  it('the taught letter is one the figure does not use («|AB| = a» · «AD = k» teaches «|AD| = b»)', () => {
    expect(bareNotes(build([BOX, '|AB| = a', 'AD = k']).notices)).toEqual([{ kind: 'vector-named-bare', name: 'k', from: 'A', to: 'D', alt: 'b' }]);
  });

  it('«נסמן: AB = k» says "denote", so it is not ambiguous and shows nothing', () => {
    const d = build([BOX, 'נסמן: AB = k']);
    expect(d.construction.vectors.get('k')).toMatchObject({ from: 'A', to: 'B' });
    expect(bareNotes(d.notices)).toEqual([]);
  });
});

describe('#2092 — «|AB| = k» is a length named by a letter', () => {
  it.each([['|AB| = k'], ['|AB|=k']])('%s builds, AB wears «k» on the canvas, and the length stays free', (line) => {
    const d0 = at([BOX, line], 0);
    expect(d0.construction.lengthMarks).toEqual([{ a: 'A', b: 'B', label: 'k' }]);
    expect(labels(d0)).toEqual(['AB:k']);
    // a bare box's size is a gauge, so "free" is read against another edge: |AB| : |AD| moves with the seed
    const ratios = [0, 1, 2].map((s) => {
      const d = at([BOX, line], s);
      return len(d, 'A', 'B') / len(d, 'A', 'D');
    });
    expect(Math.max(...ratios) - Math.min(...ratios), `|AB|:|AD| across seeds ${ratios.join(', ')}`).toBeGreaterThan(1e-3);
  });

  it('the same letter on two edges makes them equal, at every seed', () => {
    for (const seed of [0, 1, 2]) {
      const d = at([BOX, '|AB| = k', '|AD| = k'], seed);
      expect(len(d, 'A', 'D'), `seed ${seed}`).toBeCloseTo(len(d, 'A', 'B'), 6);
    }
    expect(labels(at([BOX, '|AB| = k', '|AD| = k'], 0))).toEqual(['AB:k', 'AD:k']);
  });

  it('a coefficient states the ratio («|AB| = a» · «|AA\'| = 2a»)', () => {
    const d = build([BOX, '|AB| = a', "|AA'| = 2a"]);
    expect(len(d, 'A', "A'")).toBeCloseTo(2 * len(d, 'A', 'B'), 6);
  });

  it('«|AB| = 2k» · «k = 3» gives |AB| = 6, and the label becomes the value', () => {
    const d = build([BOX, '|AB| = 2k']);
    expect(labels(d)).toEqual(['AB:2k']);
    const v = build([BOX, '|AB| = 2k', 'k = 3']);
    expect(len(v, 'A', 'B')).toBeCloseTo(6, 6);
    expect(labels(v)).toEqual(['AB:6']);
  });

  it('the operator\'s fixture: «|AB| = k» · «|AD| = k» · «k = 3» — both edges 3', () => {
    const d = build([BOX, '|AB| = k', '|AD| = k', 'k = 3']);
    expect(len(d, 'A', 'B')).toBeCloseTo(3, 6);
    expect(len(d, 'A', 'D')).toBeCloseTo(3, 6);
  });
});

describe('#2092 — the taught remedy is accepted on the next Enter', () => {
  /** The spelling the note teaches, read out of the note itself (docs/17 §9: one source). */
  const taught = (d: ReturnType<typeof derive3>) => {
    const n = bareNotes(d.notices)[0] as Extract<BuildNotice3, { kind: 'vector-named-bare' }>;
    return /«(\|[^»]+)»/.exec(noteText(n, 'he'))![1];
  };

  it('typing the taught line after «AB = k» records the length too, under its own letter (#2581)', () => {
    const d = build([BOX, 'AB = k']);
    const line = taught(d);
    expect(line).toBe('|AB| = a');
    st().submit(line);
    expect(st().lastError).toBeNull();
    const after = derive3(st().facts, st().seed);
    expect(after.construction.lengthMarks).toEqual([{ a: 'A', b: 'B', label: 'a' }]);
    expect(after.construction.vectors.get('k')).toMatchObject({ from: 'A', to: 'B' });
  });

  it('editing the «AB = k» row into the taught line builds, and the note goes with the old reading', () => {
    const d = build([BOX, 'AB = k']);
    const line = taught(d);
    const row = st().facts[1];
    expect(st().replaceFact(row.id, line)).toBe(true);
    const after = derive3(st().facts, st().seed);
    expect(after.status[st().facts[1].id]).toBe('ok');
    expect(after.construction.vectors.has('k')).toBe(false);
    expect(bareNotes(after.notices)).toEqual([]);
    expect(after.construction.lengthMarks).toEqual([{ a: 'A', b: 'B', label: 'a' }]);
  });
});

describe('#2092 — outside the ruled scope, unchanged', () => {

  it('«אורך AB הוא k» stays unread, as its 2-D twin is', () => {
    reset();
    st().submit(BOX);
    st().submit('אורך AB הוא k');
    expect((st().lastError as { code: string } | null)?.code).toBe('not-understood');
  });

  it('a numeric «|AB| = 4» is the ordinary length, as before', () => {
    const d = build([BOX, '|AB| = 4']);
    expect(len(d, 'A', 'B')).toBeCloseTo(4, 6);
    expect(d.construction.lengthMarks).toEqual([]);
  });
});

// ─── #2580 / #2582 (ADR-3D-384): a length letter the figure also owns as a NUMBER is the equation |XY| = coef·k ──────

const near = (v: number, w: number) => Math.abs(v - w) < 1e-6;
const posOf = (d: ReturnType<typeof derive3>, id: string) => d.positions.get(id)!;
/** Every line recorded green, then the same facts derived at seeds 0–2. */
const allSeeds = (lines: string[]) => {
  build(lines);
  return [0, 1, 2].map((s) => derive3(st().facts, s));
};
const greenAt = (d: ReturnType<typeof derive3>) => Object.values(d.status).every((x) => x === 'ok');
const T44 = ['C(k,1,0)', 'A(0,0,0)', 'B(1,1,1)', '|AB| = k'];

describe('#2580 — «|AB| = k» binds to a coordinate parameter k (operator T44)', () => {
  it("the operator's four lines build: k = √3, C = (√3,1,0), AB labelled k, at every seed", () => {
    for (const d of allSeeds(T44)) {
      expect(greenAt(d)).toBe(true);
      expect(d.resolved.param?.value).toBeCloseTo(Math.sqrt(3), 9);
      expect(posOf(d, 'C')).toMatchObject({ y: 1, z: 0 });
      expect(posOf(d, 'C').x).toBeCloseTo(Math.sqrt(3), 9);
      expect(labels(d)).toContain('AB:k');
    }
    expect(dataView(derive3(st().facts, 0).construction, 0).params.map((p) => p.text)).toEqual(['k = √3']);
  });

  it('#2582: the mirror order («|AB| = k» before «C(k,1,0)») gives the same figure', () => {
    for (const d of allSeeds(['A(0,0,0)', 'B(1,1,1)', '|AB| = k', 'C(k,1,0)'])) {
      expect(greenAt(d)).toBe(true);
      expect(posOf(d, 'C').x).toBeCloseTo(Math.sqrt(3), 9);
    }
  });

  it('#2582: loading the saved figure (no submit) gives the same figure, in either order', () => {
    const file = readFileSync(resolvePath(__dirname, '../../fixtures3/param-length-letter-2580.geo3.json'), 'utf8');
    const loaded = deserializeFigure3(file);
    if (!loaded.ok) throw new Error('fixture did not load');
    const f = loaded.facts;
    for (const facts of [f, [f[1], f[2], f[3], f[0]]]) {
      for (const seed of [0, 1, 2]) {
        const d = derive3(facts, seed);
        expect(greenAt(d)).toBe(true);
        expect(posOf(d, 'C').x).toBeCloseTo(Math.sqrt(3), 9);
      }
    }
  });

  it('the ✎ edit of the last row re-ties: «|AB| = 2k» edited to «|AB| = k»', () => {
    build(['C(k,1,0)', 'A(0,0,0)', 'B(1,1,1)', '|AB| = 2k']);
    expect(posOf(derive3(st().facts, 0), 'C').x).toBeCloseTo(Math.sqrt(3) / 2, 9);
    expect(st().replaceFact(st().facts[3].id, '|AB| = k')).toBe(true);
    const d = derive3(st().facts, 0);
    expect(greenAt(d)).toBe(true);
    expect(posOf(d, 'C').x).toBeCloseTo(Math.sqrt(3), 9);
  });

  it('«|AB| = 2k» gives k = √3/2', () => {
    for (const d of allSeeds(['C(k,1,0)', 'A(0,0,0)', 'B(1,1,1)', '|AB| = 2k'])) expect(d.resolved.param?.value).toBeCloseTo(Math.sqrt(3) / 2, 9);
  });

  it('a length that cannot equal its parameter («|AC| = k»: √(k²+1) = k) is the honest no-roots, on the newest line', () => {
    reset();
    for (const l of ['C(k,1,0)', 'A(0,0,0)']) st().submit(l);
    st().submit('|AC| = k');
    expect(st().lastError).toMatchObject({ code: 'no-roots', sym: 'k', stated: '|AC| = k' });
  });

  it('a later «k = 3» against the tie is the contradiction naming both lines', () => {
    build(T44);
    st().submit('k = 3');
    expect(st().lastError).toMatchObject({ code: 'no-roots', stated: 'k = 3', others: ['|AB| = k'] });
  });

  it("an equation's parameter («π: x + (m-2)y + z = 0» · «|AB| = m») is tied the same way: m = √3", () => {
    for (const d of allSeeds(['π: x + (m-2)y + z = 0', 'A(0,0,0)', 'B(1,1,1)', '|AB| = m'])) {
      expect(greenAt(d)).toBe(true);
      expect(d.resolved.param?.value).toBeCloseTo(Math.sqrt(3), 9);
    }
  });
});

describe('#2580 — the other number owners carry the tie in their own lane, in either order', () => {
  const lenAB = (d: ReturnType<typeof derive3>) => len(d, 'A', 'B');

  it.each([[['משולש ABC', 'AN = k·AC', '|AB| = k']], [['משולש ABC', '|AB| = k', 'AN = k·AC']]])(
    'a vector-definition ratio %j: |AN| = |AB|·|AC| at every seed',
    (lines) => {
      for (const d of allSeeds(lines as string[])) {
        expect(greenAt(d)).toBe(true);
        expect(len(d, 'A', 'N')).toBeCloseTo(lenAB(d) * len(d, 'A', 'C'), 6);
      }
    },
  );

  it.each([[["קובייה ABCDA'B'C'D'", 'C(p,1,0)', '|AB| = p']], [["קובייה ABCDA'B'C'D'", '|AB| = p', 'C(p,1,0)']]])(
    'a named component %j: |AB| = the x of C, and the cube still varies with the seed',
    (lines) => {
      const ds = allSeeds(lines as string[]);
      for (const d of ds) {
        expect(greenAt(d)).toBe(true);
        expect(lenAB(d)).toBeCloseTo(posOf(d, 'C').x, 6);
      }
      expect(near(lenAB(ds[0]), lenAB(ds[1])) && near(lenAB(ds[1]), lenAB(ds[2]))).toBe(false);
    },
  );

  it("a rider's parameter («E על SA כך ש-SE = t·SA» · «|AB| = t»): |AB| = |SE|/|SA|", () => {
    for (const d of allSeeds(['פירמידה SABCD', 'E על SA כך ש-SE = t·SA', '|AB| = t'])) {
      expect(greenAt(d)).toBe(true);
      expect(lenAB(d)).toBeCloseTo(len(d, 'S', 'E') / len(d, 'S', 'A'), 6);
    }
  });

  it('a pivot symbol («C(p^2,1,0)» on a cube · «|AB| = p»): |AB|² = the x of C', () => {
    for (const d of allSeeds(["קובייה ABCDA'B'C'D'", 'C(p^2,1,0)', '|AB| = p'])) {
      expect(greenAt(d)).toBe(true);
      // the pivot solves to the verifier's tolerance (relative 2e-5), not to machine precision
      expect(lenAB(d) ** 2).toBeCloseTo(posOf(d, 'C').x, 4);
    }
  });
});

// ─── #2581 / #2580 (ADR-3D-385): one letter, two meanings that cannot share it — refused in either order ────────────

const refusal = (lng: 'he' | 'en') => (errorText3((k, o) => i18n3d.t(k, { ...o, lng }) as string, st().lastError) ?? '').replace(/[⁦-⁩]/g, '');
/** Every line but the last records; the last is refused with the letter error. */
const refused = (lines: string[]) => {
  build(lines.slice(0, -1));
  st().submit(lines[lines.length - 1]);
  expect((st().lastError as { code: string } | null)?.code, lines.join(' · ')).toBe('letter-meaning-taken');
  return { he: refusal('he'), en: refusal('en') };
};

describe('#2581 — a vector letter is not a length, and a length letter is not a vector', () => {
  it('«AB = k» · «|AB| = k» is refused with the different-letter sentence (He + En)', () => {
    expect(refused([BOX, 'AB = k', '|AB| = k'])).toEqual({
      he: 'בשורה «AB = k» k כבר נקבע כשם הווקטור AB, ולכן הוא לא יכול להיות גם אורך. כתבו את האורך באות אחרת, למשל «|AB| = a».',
      en: 'In the line «AB = k», k was already set as the name of the vector AB, so it cannot also be a length. Write the length with a different letter, for example «|AB| = a».',
    });
  });

  it('any edge, any naming form: «|AD| = k» after «AB = k», «|AD| = u» after «נסמן: AB = u»', () => {
    expect(refused([BOX, 'AB = k', '|AD| = k']).he).toBe('בשורה «AB = k» k כבר נקבע כשם הווקטור AB, ולכן הוא לא יכול להיות גם אורך. כתבו את האורך באות אחרת, למשל «|AD| = a».');
    expect(refused([BOX, 'נסמן: AB = u', '|AD| = u']).he).toBe('בשורה «נסמן: AB = u» u כבר נקבע כשם הווקטור AB, ולכן הוא לא יכול להיות גם אורך. כתבו את האורך באות אחרת, למשל «|AD| = a».');
  });

  it('the mirror order: «|AB| = k» then «AD = k» or «נסמן: AD = k»', () => {
    const he = 'בשורה «|AB| = k» k כבר נקבע כאורך הקטע AB, ולכן הוא לא יכול להיות גם שם של וקטור. בחרו לווקטור אות אחרת, למשל «נסמן: AD = a».';
    expect(refused([BOX, '|AB| = k', 'AD = k'])).toEqual({
      he,
      en: 'In the line «|AB| = k», k was already set as the length of the segment AB, so it cannot also name a vector. Pick a different letter for the vector, for example «denote: AD = a».',
    });
    expect(refused([BOX, '|AB| = k', 'נסמן: AD = k']).he).toBe(he);
  });

  it('load (no submit): the second meaning is the refused fact, whichever order the file holds', () => {
    build([BOX, 'AB = k']);
    const vec = st().facts[1];
    build([BOX, '|AD| = k']);
    const lenFact = st().facts[1];
    const box = st().facts[0];
    expect(derive3([box, vec, lenFact], 0).status[lenFact.id]).toMatchObject({ code: 'letter-meaning-taken', had: 'vector', now: 'length', line: 'AB = k' });
    expect(derive3([box, lenFact, vec], 0).status[vec.id]).toMatchObject({ code: 'letter-meaning-taken', had: 'length', now: 'vector', line: '|AD| = k' });
  });

  it("controls: «|AB| = a» after «AB = k» builds, and «|k| = 3» is still the vector's magnitude", () => {
    build([BOX, 'AB = k', '|AB| = a']);
    build([BOX, 'AB = k', '|k| = 3']);
  });
});

describe('#2581 (ruling 2026-10-28) — a vector letter is not a parameter, in either order', () => {
  it('«AB = k» after «C(k,1,0)» is refused, naming the line that made k a parameter', () => {
    expect(refused(['A(0,0,0)', 'B(1,1,1)', 'C(k,1,0)', 'AB = k'])).toEqual({
      he: 'בשורה «C(k,1,0)» k כבר נקבע כפרמטר, ולכן הוא לא יכול להיות גם שם של וקטור. בחרו לווקטור אות אחרת, למשל «נסמן: AB = a».',
      en: 'In the line «C(k,1,0)», k was already set as a parameter, so it cannot also name a vector. Pick a different letter for the vector, for example «denote: AB = a».',
    });
  });

  it('«C(k,1,0)» after «AB = k» is refused, naming the line that made k a vector', () => {
    expect(refused(['A(0,0,0)', 'B(1,1,1)', 'AB = k', 'C(k,1,0)'])).toEqual({
      he: 'בשורה «AB = k» k כבר נקבע כשם הווקטור AB, ולכן הוא לא יכול להיות גם פרמטר. כתבו את הפרמטר באות אחרת, למשל a.',
      en: 'In the line «AB = k», k was already set as the name of the vector AB, so it cannot also be a parameter. Write the parameter with a different letter, for example a.',
    });
  });

  it('a named component on a solid is a parameter too («C(p,1,0)» on a cube · «AB = p»)', () => {
    expect(refused(["קובייה ABCDA'B'C'D'", 'C(p,1,0)', 'AB = p']).he).toBe('בשורה «C(p,1,0)» p כבר נקבע כפרמטר, ולכן הוא לא יכול להיות גם שם של וקטור. בחרו לווקטור אות אחרת, למשל «נסמן: AB = a».');
  });
});

describe('#2580 (ruling 2026-10-27) — an angle letter is not a length, in either order', () => {
  it("«∠BAD' = k» · «|AB| = k» is refused", () => {
    expect(refused([BOX, "∠BAD' = k", '|AB| = k'])).toEqual({
      he: "בשורה «∠BAD' = k» k כבר נקבע כשם הזווית BAD', ולכן הוא לא יכול להיות גם אורך. כתבו את האורך באות אחרת, למשל «|AB| = a».",
      en: "In the line «∠BAD' = k», k was already set as the name of the angle BAD', so it cannot also be a length. Write the length with a different letter, for example «|AB| = a».",
    });
  });

  it("«|AB| = k» · «∠BAD' = k» is refused", () => {
    expect(refused([BOX, '|AB| = k', "∠BAD' = k"])).toEqual({
      he: "בשורה «|AB| = k» k כבר נקבע כאורך הקטע AB, ולכן הוא לא יכול להיות גם שם של זווית. כתבו את הזווית באות אחרת, למשל «∠BAD' = a».",
      en: "In the line «|AB| = k», k was already set as the length of the segment AB, so it cannot also name an angle. Write the angle with a different letter, for example «∠BAD' = a».",
    });
  });
});
