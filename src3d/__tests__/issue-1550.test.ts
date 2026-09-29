/**
 * #1550 (ADR-3D-281) — «מישור ABCD מקביל לציר z» on a box was refused «הטענה לא מתקיימת בציור».
 *
 * Operator, 2026-09-29: *"מישור ABCD מקביל לציר z - is not recognized as a plane and doesnt show the
 * chip"*. Three defects, each a class:
 *
 *  1. THE DRIVE. `coordPlanePins` (ADR-3D-079) was admitted by the pivot's entry gate and read by no
 *     solve trigger, so a coordinate-frame relation that is true only after the figure TURNS was never
 *     solved when nothing else anchored the figure. The gate and the triggers now read one family list
 *     (`pivotFamilies3`), and the frame lane drives it on the failure path.
 *  2. THE MESSAGE. The #512 honesty guard (`refsCoordFrame`) looked for frame OPERANDS and never matched
 *     a `coord-plane-rel` claim, whose axis is a bare field.
 *  3. THE CHIP. Operator ruling 2026-09-29 (amends #847): the plane chip lives on the FIRST row that
 *     mentions the plane, declaration or relation.
 *
 * Every lock here is anti-luck: the relation it asserts is FALSE in the canonical placement, so it can
 * only pass by driving — the failure mode of the ADR-3D-079 lock it replaces.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { planeChipsByFact, planesNamedBy } from '../store/planeChips';
import { pivotFamilies3 } from '../engine/evaluate';
import { coordPlaneRelHolds, CLAIM_REL_TOL } from '../engine/operands';
import { emptyConstruction3 } from '../engine/types';
import { newellNormal, norm3, type Vec3 } from '../engine/vec3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const st = () => useGeo3.getState();
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const BOX = "תיבה ABCDA'B'C'D'";

const build = (seq: string[]) => {
  reset();
  for (const u of seq) {
    submit(u);
    expect(st().lastError, `«${u}» should commit`).toBeNull();
  }
};
/** every fact verifies at every one of the 24 seeds */
const greenAtEverySeed = () => {
  for (const s of SEEDS) {
    const d = derive3(st().facts, s);
    for (const f of st().facts) expect(d.status[f.id], `«${f.utterance}» at seed ${s}`).toBe('ok');
  }
};
const ringAt = (ids: string[], seed: number): Vec3[] => {
  const d = derive3(st().facts, seed);
  return ids.map((id) => d.positions.get(id)!);
};

describe('#1550 — the operator’s line: a coordinate-frame relation alone TURNS the figure', () => {
  beforeEach(reset);

  for (const solid of [BOX, "קובייה ABCDA'B'C'D'", 'פירמידה SABCD']) {
    it(`${solid} → «מישור ABCD מקביל לציר z»: commits, and ABCD is vertical at all 24 seeds`, () => {
      // anti-luck: the canonical base is horizontal, so the relation is FALSE before the drive
      build([solid]);
      const n0 = newellNormal(ringAt(['A', 'B', 'C', 'D'], 0));
      expect(Math.abs(n0.z) / norm3(n0)).toBeGreaterThan(0.5);
      build([solid, 'מישור ABCD מקביל לציר z']);
      greenAtEverySeed();
      for (const s of SEEDS) {
        const n = newellNormal(ringAt(['A', 'B', 'C', 'D'], s));
        expect(Math.abs(n.z), `seed ${s}`).toBeLessThan(1e-6 * norm3(n));
      }
    });
  }

  it('the drive TURNS the figure, never deforms it — the box keeps its edges (#551 "rotation only")', () => {
    build([BOX]);
    const edges = (s: number) => {
      const d = derive3(st().facts, s);
      const len = (a: string, b: string) => norm3({ x: d.positions.get(a)!.x - d.positions.get(b)!.x, y: d.positions.get(a)!.y - d.positions.get(b)!.y, z: d.positions.get(a)!.z - d.positions.get(b)!.z });
      return [len('A', 'B'), len('A', 'D'), len('A', "A'")];
    };
    const before = SEEDS.map(edges);
    build([BOX, 'מישור ABCD מקביל לציר z']);
    const after = SEEDS.map(edges);
    const ratio = (e: number[]) => [e[1] / e[0], e[2] / e[0]];
    for (const s of SEEDS) {
      const [r1, r2] = ratio(before[s]);
      const [q1, q2] = ratio(after[s]);
      expect(Math.abs(q1 - r1) / r1, `seed ${s}`).toBeLessThan(1e-4);
      expect(Math.abs(q2 - r2) / r2, `seed ${s}`).toBeLessThan(1e-4);
    }
  });
});

describe('#1550 — the whole coordinate-frame family commits and HOLDS at every seed', () => {
  beforeEach(reset);
  // [prefix, line, the ring + relation the line states] — each FALSE in the canonical placement
  const FAMILY: [string[], string, string[], 'x' | 'y' | 'z', 'share' | 'zero' | 'perp' | 'contains'][] = [
    [[BOX], 'מישור ABCD מאונך למישור xy', ['A', 'B', 'C', 'D'], 'z', 'perp'],
    [[BOX], 'מישור ABCD מקביל למישור xz', ['A', 'B', 'C', 'D'], 'y', 'share'],
    [[BOX], 'הבסיס ABCD מונח על מישור שמקביל למישור xz', ['A', 'B', 'C', 'D'], 'y', 'share'],
    [[BOX], 'המישור ABCD מונח על המישור [xz]', ['A', 'B', 'C', 'D'], 'y', 'zero'],
    [[BOX], 'המשולש ABC נמצא במישור xz', ['A', 'B', 'C'], 'y', 'zero'],
    [[BOX], "מישור BDD'B' מקביל למישור xz", ['B', 'D', "D'", "B'"], 'y', 'share'],
    [[BOX], 'המישור ABCD מקביל לציר ה-z', ['A', 'B', 'C', 'D'], 'z', 'perp'],
    [[BOX], 'מישור ABC מקביל לציר z', ['A', 'B', 'C'], 'z', 'perp'],
    [['משולש ABC'], 'המישור ABC מקביל לציר ה-z', ['A', 'B', 'C'], 'z', 'perp'],
    [[], 'המרובע ABCD מונח במישור [xz]', ['A', 'B', 'C', 'D'], 'y', 'zero'],
    [[], 'המרובע ABCD מקביל לציר z', ['A', 'B', 'C', 'D'], 'z', 'perp'],
    [[BOX], 'plane ABCD is parallel to the z-axis', ['A', 'B', 'C', 'D'], 'z', 'perp'], // En mirror
  ];
  for (const [prefix, line, ring, axis, mode] of FAMILY) {
    it(`${prefix.join(' · ') || '(empty canvas)'} → «${line}»`, () => {
      build([...prefix, line]);
      greenAtEverySeed();
      for (const s of SEEDS) expect(coordPlaneRelHolds(ringAt(ring, s), axis, mode, CLAIM_REL_TOL), `seed ${s}`).toBe(true);
    });
  }

  it('a relation the canonical placement ALREADY satisfies runs no solve (failure path only — stability)', () => {
    // Regression guard (unchanged from main): the frame lane solves only an UNMET relation, so these
    // figures are exactly the placement they were before #1550 (the 24-seed sweep compares positions).
    for (const line of ['מישור ABCD ניצב לציר z', 'מישור ABCD מקביל למישור xy', "מישור ABB'A' מקביל לציר z"]) {
      build([BOX, line]);
      greenAtEverySeed();
      for (const s of SEEDS) expect(derive3(st().facts, s).resolved.pivot, `${line} @${s}`).toBeNull();
    }
  });
});

describe('#1550 — honesty: genuinely false stays refused; the message never blames a satisfiable statement', () => {
  beforeEach(reset);

  it('four absolute points that span no plane ∥ z stay claim-refuted (nothing to turn)', () => {
    build(['A(1,0,0)', 'B(0,1,0)', 'C(0,0,1)', 'D(1,1,-1)']);
    submit('מישור ABCD מקביל לציר z');
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('a CONTRADICTION between two frame statements is refuted, never softened to «fix a placement first»', () => {
    // The ring form DRIVES the rotation, so when it cannot be met the givens contradict each other — the
    // #512 «placement-not-fixed» advice («state a placing given first») would be false here. Measured on the
    // first draft of the widening, which returned exactly that.
    build([BOX, 'מישור ABCD מקביל למישור xy']);
    submit("מישור ABB'A' מקביל למישור xy");
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('the #512 guard now SEES a coord-plane-rel claim: the ids-form and the operand-form give one verdict', () => {
    // «BD' ⊥ [xy]» (operand form, no drive) was already `placement-not-fixed`; the same guard reaches the
    // ring form now. Probed through the store's own verdict on a placement nothing fixed.
    build([BOX]);
    submit("BD' מאונך למישור [xy]");
    expect(st().lastError).toEqual({ code: 'placement-not-fixed' });
  });
});

describe('#1550 — the pivot family registry is TOTAL (a family can never again be admitted but untriggered)', () => {
  it('every residual family solvePivot reads is a registry row', () => {
    const src = readFileSync(join(__dirname, '..', 'engine', 'solve3.ts'), 'utf8');
    const read = new Set<string>();
    for (const m of src.matchAll(/\bc\.(\w*[pP]ins)\b/g)) if (m[1] !== 'symbolPins') read.add(`c.${m[1]}`);
    for (const m of src.matchAll(/\b(figurePlaneLinePerps|figureLineRels)\(c\)/g)) read.add(m[1]);
    read.add('members'); // the membership drive's parameter
    const sources = new Set(pivotFamilies3(emptyConstruction3()).map((f) => f.source));
    for (const r of read) expect(sources.has(r), `${r} is read by solvePivot but has no registry row`).toBe(true);
  });
  it('every lane is one the pivot solves', () => {
    for (const f of pivotFamilies3(emptyConstruction3())) expect(['anchor', 'plane-eq', 'frame', 'membership']).toContain(f.lane);
  });
});

describe('#1550 Q2 — the plane chip lives on the FIRST row that mentions the plane (amends #847)', () => {
  beforeEach(reset);
  const chipRows = () => {
    const d = derive3(st().facts, st().seed);
    const chips = planeChipsByFact(st().facts, (id) => d.status[id] === 'ok', (n) => d.resolved.planes.has(n));
    return [...chips].flatMap(([id, names]) => names.map((n) => [st().facts.find((f) => f.id === id)!.utterance, n] as const));
  };

  it('the operator’s line: the relation row that first names ABCD carries its chip', () => {
    build([BOX, 'מישור ABCD מקביל לציר z']);
    expect(chipRows()).toEqual([['מישור ABCD מקביל לציר z', 'ABCD']]);
  });

  // the rule across relation kinds — each row is the FIRST mention, so each owns the chip
  const FIRSTS: [string[], string, string][] = [
    [["קובייה ABCDA'B'C'D'"], 'מישור ABCD', 'ABCD'],
    [["קובייה ABCDA'B'C'D'"], "המישור ABCD מקביל למישור A'B'C'D'", 'ABCD'],
    [["קובייה ABCDA'B'C'D'", 'E אמצע AC'], 'BE מוכל במישור ABCD', 'ABCD'],
    [[BOX], "הזווית בין AC' למישור ABCD היא 30", 'ABCD'],
    [[BOX], 'מישור ABCD מאונך למישור xy', 'ABCD'],
  ];
  for (const [prefix, line, plane] of FIRSTS) {
    it(`«${line}» is the first mention → it carries ${plane}’s chip`, () => {
      build([...prefix, line]);
      expect(chipRows().filter(([, n]) => n === plane)).toEqual([[line, plane]]);
    });
  }

  it('a LATER row mentioning the same plane carries none — one chip per plane', () => {
    build([BOX, 'מישור ABCD מקביל לציר z', 'E אמצע AC', 'BE מוכל במישור ABCD']);
    expect(chipRows()).toEqual([['מישור ABCD מקביל לציר z', 'ABCD']]);
  });

  it('removing the first mention MOVES the chip to the next mentioning row', () => {
    build([BOX, 'מישור ABCD מקביל לציר z', 'E אמצע AC', 'BE מוכל במישור ABCD']);
    const first = st().facts[1];
    useGeo3.getState().remove(first.id);
    expect(chipRows()).toEqual([['BE מוכל במישור ABCD', 'ABCD']]);
  });

  it('a row that is not ok owns nothing — the next ok mention takes the chip (#847 kept)', () => {
    build(["קובייה ABCDA'B'C'D'", 'E אמצע AC', 'BE מוכל במישור ABCD', 'מישור ABCD']);
    useGeo3.getState().remove(st().facts[1].id); // BE's row goes amber: E no longer exists
    const d = derive3(st().facts, st().seed);
    expect(d.status[st().facts[1].id]).not.toBe('ok');
    expect(chipRows()).toEqual([['מישור ABCD', 'ABCD']]);
  });

  it('a plane the figure does not DRAW has no chip anywhere', () => {
    build(["קובייה ABCDA'B'C'D'", "CA' מאונך למישור BC'D"]);
    expect(st().facts[1].cmds.flatMap(planesNamedBy)).toContain("BC'D"); // named — but not drawn
    expect(chipRows()).toEqual([]);
  });
});
