/**
 * #827 (ADR-3D-194) — a TWO-BRANCH quantity never prints as knowledge, at any seed.
 *
 * The operator's exam pyramid, no sign given. `|AD| = 5` with `AD = (3, p, 0)` forces p = ±4, and
 * both configurations are genuinely reachable («p חיובי» / «p שלילי» each select one). Measured
 * before the fix:
 *
 *   | seed        | panel          |
 *   | 0, 1, 3, 42 | D(3, ?, 0)  ✅ |
 *   | 17, 99      | D(3, 4, 0)  ❌ printed as knowledge, though −4 holds equally |
 *
 * ADR-052's cardinal sin in its exact stated form, reached through the panel's sampling rather than
 * through DOF accounting: `chosen = pool[seed % pool.length]` makes the branch a function of the
 * seed, and the panel judged a coordinate by comparing three sampled configurations. When the
 * deterministic pick lands in the same branch for all three, a branch choice reads as a fact — and
 * «הציגו תצורה אחרת» changes the seed, so the same figure prints 4 and then ?.
 *
 * This is #797 (ADR-3D-168 Am. 1) one lane over: that ADR established for PIN SYMBOLS that
 * seed-stability alone is not determinedness. Coordinates had no equivalent guard.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const st = () => useGeo3.getState();
const build = (us: string[]) => {
  reset();
  for (const u of us) {
    st().submit(u);
    expect(st().lastError, `«${u}» should build`).toBeNull();
  }
};
const coordsAt = (seed: number, id: string) => {
  const d = derive3(st().facts, seed);
  return dataView(d.construction, seed).pointCoords[id]?.text;
};

/** The operator's sequence, verbatim. */
const PYRAMID = [
  'פירמידה SABCD שבסיסה מקבילית',
  'המקצוע SA הוא גובה בפירמידה',
  'M אמצע אלכסון BD',
  'נסמן: AB = u, AD = v, AS = w',
  'A(0,0,0)',
  'B(0,5,0)',
  'S(0,0,6)',
  'D(3,p,0)',
  '|u| = |v|',
];

/** 17 and 99 are the seeds that printed a value before the fix; the rest were already honest. */
const SEEDS = [0, 1, 3, 17, 42, 99];

describe('#827 — with NO sign given, the two-branch coordinate reads open', () => {
  beforeEach(reset);

  it('D reads (3, ?, 0) at EVERY seed — including 17 and 99, which printed 4 before', () => {
    build(PYRAMID);
    for (const seed of SEEDS) {
      expect(coordsAt(seed, 'D'), `seed ${seed}`).toBe('(3, ?, 0)');
    }
  });

  it('the verdict is seed-INVARIANT, which is the property that failed', () => {
    // The reported defect was not "wrong at seed 17" but "different at different seeds": the same
    // figure printed 4 and then ?, and «הציגו תצורה אחרת» moved between them.
    build(PYRAMID);
    const seen = new Set(SEEDS.map((s) => coordsAt(s, 'D')));
    expect([...seen]).toEqual(['(3, ?, 0)']);
  });
});

describe('#827 — a STATED sign is knowledge, and still prints', () => {
  beforeEach(reset);

  it('«p חיובי» selects +4 at every seed', () => {
    build([...PYRAMID, 'p חיובי']);
    for (const seed of SEEDS) expect(coordsAt(seed, 'D'), `seed ${seed}`).toBe('(3, 4, 0)');
  });

  it('«p שלילי» selects −4 at every seed', () => {
    build([...PYRAMID, 'p שלילי']);
    for (const seed of SEEDS) expect(coordsAt(seed, 'D'), `seed ${seed}`).toBe('(3, -4, 0)');
  });

  it('the fix does not just suppress coordinates — narrowing to one branch restores the value', () => {
    // The failure mode opposite to the reported one, and the one a blunt fix would cause: a panel
    // that prints `?` for everything is honest and useless. The sign given is what makes it
    // determined, so the value must come back.
    build(PYRAMID);
    expect(coordsAt(17, 'D')).toBe('(3, ?, 0)');
    st().submit('p חיובי');
    expect(st().lastError).toBeNull();
    expect(coordsAt(17, 'D')).toBe('(3, 4, 0)');
  });
});

describe('#827 — the VECTOR lane tells the same story as the point lane', () => {
  beforeEach(reset);

  // Found by driving the real app after the point-lane fix landed: D read (3, ?, 0) while two rows
  // below v⃗ = AD printed (3, 4, 0) — same seeds, same branch, one surface over, and a panel
  // contradicting itself on screen. A student reading «D(3, ?, 0)» and «v = (3, 4, 0)» together
  // learns the value anyway, which is the defect the point-lane fix was supposed to remove.
  const vecOf = (seed: number, label: string) => {
    const d = derive3(st().facts, seed);
    return dataView(d.construction, seed).vectors.find((e) => e.label === label);
  };

  it('v = AD prints NO coordinates at any seed — D is two-branch, so v is too', () => {
    build(PYRAMID);
    for (const seed of SEEDS) expect(vecOf(seed, 'v')?.coords, `seed ${seed}`).toBeNull();
  });

  it('but |v| = 5 STILL prints — the magnitude is forced by |u| = |v|, whichever branch holds', () => {
    // The distinction that makes this a real fix rather than blanket suppression: the length is
    // knowledge, the components are not.
    build(PYRAMID);
    for (const seed of SEEDS) expect(vecOf(seed, 'v')?.mag, `seed ${seed}`).toBe('|v| = 5');
  });

  it('u and w — both endpoints determined — still print their coordinates', () => {
    build(PYRAMID);
    for (const seed of SEEDS) {
      expect(vecOf(seed, 'u')?.coords, `u at seed ${seed}`).toBe('(0, 5, 0)');
      expect(vecOf(seed, 'w')?.coords, `w at seed ${seed}`).toBe('(0, 0, 6)');
    }
  });

  it('once the sign is stated, v prints its coordinates too', () => {
    build([...PYRAMID, 'p חיובי']);
    for (const seed of SEEDS) expect(vecOf(seed, 'v')?.coords, `seed ${seed}`).toBe('(3, 4, 0)');
  });

  it('the panel never contradicts itself: D open ⟺ v open', () => {
    // The property, not the instance. Whatever the figure, the point and the vector derived from it
    // must agree about whether the givens determine that component.
    for (const seq of [PYRAMID, [...PYRAMID, 'p חיובי'], [...PYRAMID, 'p שלילי']]) {
      build(seq);
      for (const seed of SEEDS) {
        const dOpen = (coordsAt(seed, 'D') ?? '').includes('?');
        const vOpen = vecOf(seed, 'v')?.coords === null;
        expect(vOpen, `D open=${dOpen} but v open=${vOpen} at seed ${seed}`).toBe(dOpen);
      }
    }
  });
});

describe('#827 — determined coordinates are untouched', () => {
  beforeEach(reset);

  it('the INJECTED points still print their stated coordinates at every seed', () => {
    // A, B and S were typed by the student. If branch coverage started suppressing those, the guard
    // would be over-reaching — the regression this class of fix most easily causes.
    build(PYRAMID);
    for (const seed of SEEDS) {
      expect(coordsAt(seed, 'A'), `A at seed ${seed}`).toBe('(0, 0, 0)');
      expect(coordsAt(seed, 'B'), `B at seed ${seed}`).toBe('(0, 5, 0)');
      expect(coordsAt(seed, 'S'), `S at seed ${seed}`).toBe('(0, 0, 6)');
    }
  });

  it('a single-solution figure prints normally — no pool, no branch, no suppression', () => {
    build(['קובייה ABCDA\'B\'C\'D\'', 'A(0,0,0)', 'B(4,0,0)', 'D(0,4,0)']);
    for (const seed of [0, 17]) {
      expect(coordsAt(seed, 'A'), `seed ${seed}`).toBe('(0, 0, 0)');
      expect(coordsAt(seed, 'B'), `seed ${seed}`).toBe('(4, 0, 0)');
    }
  });
});
