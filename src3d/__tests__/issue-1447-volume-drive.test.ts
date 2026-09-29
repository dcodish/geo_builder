/**
 * #1447 — A VOLUME/AREA ON FREE DIMS DRIVES, WHATEVER THE ENTRY ORDER (ADR-3D-276).
 *
 * External review: «נפח הפירמידה = 12» after «AB = 3» answered «הטענה לא מתקיימת בציור» though
 * height 4 satisfies it — a magnitude's ability to drive depended on its POWER (only length had a
 * pin kind) and on ENTRY ORDER (#754's rescale owned the size). Ruled 2026-09-27: a later
 * volume/area may move free shape dims. The claim stays the arbiter (ADR-3D-030), and a scale
 * given in force is demoted to its own pin so both magnitudes drive together.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';
import { resolveSolidSubject, subjectVolume } from '../engine/solidSubject';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
beforeEach(reset);

const allOk = (seed: number) => {
  const st = useGeo3.getState();
  const d = derive3(st.facts, seed);
  return st.facts.every((f) => d.status[f.id] === 'ok');
};
const volumeAt = (seed: number, noun: Parameters<typeof resolveSolidSubject>[1], ids: string[]) => {
  const st = useGeo3.getState();
  const d = derive3(st.facts, seed);
  return subjectVolume(resolveSolidSubject(d.construction, noun, ids), d.resolved.positions);
};

describe('#1447 — the three reported sequences build green, the value exact, across seeds', () => {
  it('pyramid: AB = 3 then volume = 12 — the free height drives', () => {
    submit('פירמידה ישרה SABCD');
    submit('AB = 3');
    submit('נפח הפירמידה = 12');
    for (const seed of [0, 1, 2, 5, 11, 23]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(volumeAt(seed, 'pyramid', []), `seed ${seed}`).toBeCloseTo(12, 3);
    }
  });

  it('pyramid with the height named: SO גובה · AB = 3 · volume = 12', () => {
    submit('פירמידה ישרה ריבועית SABCD');
    submit('SO גובה הפירמידה');
    submit('AB = 3');
    submit('נפח הפירמידה = 12');
    for (const seed of [0, 3, 7]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(volumeAt(seed, 'pyramid', []), `seed ${seed}`).toBeCloseTo(12, 3);
    }
  });

  it('box: AB = 3 · AD = 4 · volume = 60 — the third edge drives to 5', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('AB = 3');
    submit('AD = 4');
    submit('נפח התיבה = 60');
    for (const seed of [0, 2, 9]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(volumeAt(seed, 'box', []), `seed ${seed}`).toBeCloseTo(60, 3);
    }
  });

  it('REVERSED order: volume = 12 then AB = 3 — the demotion makes both drive', () => {
    submit('פירמידה ישרה SABCD');
    submit('נפח הפירמידה = 12');
    submit('AB = 3');
    for (const seed of [0, 4]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(volumeAt(seed, 'pyramid', []), `seed ${seed}`).toBeCloseTo(12, 3);
    }
  });
});

describe('#1447 — the gates that must not loosen', () => {
  it('a volume alone still rescales uniformly (the #754 lock)', () => {
    submit('פירמידה ישרה SABCD');
    submit('נפח הפירמידה = 12');
    expect(allOk(0)).toBe(true);
    expect(volumeAt(0, 'pyramid', [])).toBeCloseTo(12, 3);
  });

  it('an impossible volume on a RIGID figure is still refused', () => {
    submit("קובייה ABCDA'B'C'D'");
    submit('AB = 3');
    submit('נפח הקובייה = 100'); // a cube's volume is forced: 27
    const st = useGeo3.getState();
    const d = derive3(st.facts, st.seed);
    const volFact = st.facts.find((x) => x.utterance === 'נפח הקובייה = 100');
    // the line is refused at the gate (keep-prior, never a fact) or sits red — never a green lie
    if (volFact) expect(d.status[volFact.id]).not.toBe('ok');
    else expect(st.lastError, 'refused at the gate').not.toBeNull();
  });
});
