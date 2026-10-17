/**
 * THE META-LOCK (#1837, docs/28 §5c step 5) — the shared radian-angle rows run against deliberately BROKEN
 * gates, and each check is shown to catch its own defect. It calls the same `radianAngleFaults` and the same
 * `findRadianAngle` the builders call — never a copy.
 */
import { describe, expect, it } from 'vitest';
import { radianAngleFaults, RADIAN_ROWS, NOT_RADIAN_ROWS, RADIAN_SENTENCE_HE, type RadianGate } from './fixtures/radian-angle-rows';
import { findRadianAngle } from '../radianAngle';

const gateOf = (detect: (line: string) => boolean): RadianGate => (line) =>
  detect(line) ? { radian: true, recorded: false, escalated: false, text: RADIAN_SENTENCE_HE } : { radian: false, recorded: true, escalated: false, text: null };
const good = gateOf((l) => findRadianAngle(l) !== null);

describe('#1837 — the shared radian-angle rows catch a broken gate', () => {
  it('a gate built on the shared detector conforms', async () => {
    expect(await radianAngleFaults(good)).toEqual([]);
  });

  it('catches a builder with no gate (analytic before #1837: recorded in degrees)', async () => {
    const faults = (await radianAngleFaults(() => ({ radian: false, recorded: true, escalated: false, text: null }))).join('\n');
    expect(faults).toMatch(/«∠ABC = π\/2» was not refused as an angle in radians/);
    expect(faults).toMatch(/an angle in radians became a figure/);
  });

  it('catches a builder that hands the line to the fallback (2-D before #1837)', async () => {
    const faults = (await radianAngleFaults(() => ({ radian: false, recorded: false, escalated: true, text: null }))).join('\n');
    expect(faults).toMatch(/handed to the AI fallback/);
  });

  it('catches a detector that bans π outright (a length is not radians)', async () => {
    const faults = await radianAngleFaults(gateOf((l) => /π|pi/.test(l)));
    expect(faults).toContain('«AB = π» is not an angle in radians, but was refused as one');
    expect(faults).toContain('«B על המישור π2» is not an angle in radians, but was refused as one');
  });

  it('catches a detector that knows the glyph only (the ASCII spelling committed 2° in 2-D)', async () => {
    const faults = await radianAngleFaults(gateOf((l) => findRadianAngle(l) !== null && l.includes('π')));
    expect(faults).toContain('«∠ABC = pi/2» was not refused as an angle in radians');
  });

  it('catches a refusal in other words', async () => {
    const mute: RadianGate = (l) => (findRadianAngle(l) ? { radian: true, recorded: false, escalated: false, text: 'refused' } : { radian: false, recorded: true, escalated: false, text: null });
    expect((await radianAngleFaults(mute)).join('\n')).toMatch(/is not the ruled sentence/);
  });

  it('every row is what the detector says it is', () => {
    for (const l of RADIAN_ROWS) expect(findRadianAngle(l), l).not.toBeNull();
    for (const l of NOT_RADIAN_ROWS) expect(findRadianAngle(l), l).toBeNull();
  });
});

describe('#1837 — findRadianAngle', () => {
  it('reads the measure a shape is given with, and the angle inside a longer line', () => {
    expect(findRadianAngle('גזרה AOB בזווית π/3')?.value).toBe('π/3');
    expect(findRadianAngle('זווית מרכזית COD = π/3')?.value).toBe('π/3');
    expect(findRadianAngle('משולש ABC שבו ∠ABC = 2π/3')?.value).toBe('2π/3');
    expect(findRadianAngle('a sector with angle π/4')?.value).toBe('π/4');
  });
  it('never reads π as a name, a length, a degree value, or a word inside another word', () => {
    for (const l of ['∠ABC = π2', 'AB = π/2', 'גזרה AOB בזווית 80', 'triangle ABC = π', 'מעגל שרדיוסו π', '∠ABC = 3pin', 'ישר-זווית ABC'])
      expect(findRadianAngle(l), l).toBeNull();
  });
  it('the span is the angle measure, at the caller’s indices', () => {
    const line = 'נתון: ∠ABC = π/2';
    const r = findRadianAngle(line)!;
    expect(line.slice(r.span[0], r.span[1])).toBe('∠ABC = π/2');
  });
});
