/**
 * #444 (ADR-427): a named shape's own equal sides are SHOWN, marked distinctly, with an explanation.
 *
 * Operator, 2026-08-08 (on the concave kite): "it doesn't look visually like it creates 2 equal sides" —
 * and the panel agreed with them, printing «לא נמצאו צלעות או זוויות שוות בהכרח» (*no necessarily-equal
 * sides found*) on a kite whose two pairs are exact in every sample. Ruling: show them, "not only for
 * kites … any case where a user would expect to see 2 equal sides but he never said which — like משולש
 * שווה שוקיים", and make them "visually different … but there must be text next to it explaining".
 *
 * The cause was NOT a suppression flag. `detectRelationsAcross` pools samples across every variant
 * alternative (`variantConfigs`), so a pair true only in the DRAWN variant correctly fails its
 * holds-in-every-sample bar — which is right, since cycling the variant moves it. What is forced is the
 * DISJUNCTION (that some two sides are equal), and the layer had no way to say it, so it said the one
 * thing that is false: none.
 *
 * This locks the second channel: declared pairs reported SEPARATELY, never folded into the forced rows,
 * and never claimed for a pair the student actually stated.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { detectAll, useGeoStore } from '@/store/geoStore';
import { relationMarks } from '@/render/scene';
import { replay } from '@/store/geoStore';

function build(utterances: string[]) {
  useGeoStore.getState().clear();
  for (const u of utterances) {
    const r = parse(u, { points: [], neighbors: {} } as never);
    if (!r.ok) throw new Error(`parse failed: ${u}`);
    for (const c of r.commands) useGeoStore.getState().execute(c, u);
  }
  const st = useGeoStore.getState();
  return { st, ...detectAll(st.facts) };
}

const pairs = (classes: [string, string][][]) => classes.map((cls) => cls.map(([a, b]) => `${a}${b}`).join('=')).sort();

describe('#444 — a shape whose equal pair the student never chose', () => {
  it('a kite declares both pairs (the reported figure)', () => {
    const { stated, relations } = build(['דלתון ABCD']);
    expect(stated).toHaveLength(1);
    expect(stated[0].shape).toBe('kite');
    expect(pairs(stated[0].classes)).toEqual(['AB=AD', 'CB=CD']);
    expect(relations.equalSegments).toEqual([]); // still NOT forced — cycling the variant moves it
  });

  it('an isosceles triangle declares its pair — the operator generalisation', () => {
    const { stated, relations } = build(['משולש שווה שוקיים ABC']);
    expect(stated).toHaveLength(1);
    expect(stated[0].shape).toBe('isosceles');
    expect(pairs(stated[0].classes)).toEqual(['AB=AC']);
    expect(relations.equalSegments).toEqual([]);
  });

  it('the concave kite too — the figure the operator was looking at', () => {
    const { stated } = build(['דלתון קעור']);
    expect(pairs(stated[0].classes)).toEqual(['AB=AD', 'CB=CD']);
  });
});

describe('#444 — the channel never overlaps the FORCED one', () => {
  it('a shape whose equality is HARD reports it as forced, and declares nothing', () => {
    // an isosceles trapezoid's equal legs are not a variant choice — they are the shape
    const { stated, relations } = build(['טרפז שווה שוקיים ABCD']);
    expect(stated).toEqual([]);
    expect(relations.equalSegments.length).toBeGreaterThan(0);
  });

  it('a square reports four forced sides and declares nothing', () => {
    const { stated, relations } = build(['ריבוע ABCD']);
    expect(stated).toEqual([]);
    expect(relations.equalSegments.length).toBeGreaterThan(0);
  });

  it('an EXPLICIT pair leaves the declared channel — the student stated it, so it is a fact', () => {
    // ADR-234: stating the pair the soft default already drew PINS it. It must then be reported as
    // forced, not as a "?" guess — otherwise the tool second-guesses the student's own words.
    const { stated, relations } = build(['משולש שווה שוקיים ABC', 'AB=AC']);
    expect(stated).toEqual([]);
    expect(relations.equalSegments.length).toBeGreaterThan(0);
  });

  it('a figure with no named shape declares nothing', () => {
    const { stated } = build(['משולש ABC']);
    expect(stated).toEqual([]);
  });
});

describe('#444 — the marks are visually distinct', () => {
  it('declared ticks carry the `stated` flag; forced ticks do not', () => {
    const { st, stated } = build(['דלתון ABCD']);
    const d = replay(st.facts, st.seed);
    const empty = { equalSegments: [], equalAngles: [], definiteAngles: [], definiteLengths: [], samplesUsed: 0 };
    const marks = relationMarks(empty, d.positions, stated.flatMap((s) => s.classes));
    expect(marks.ticks.length).toBe(4); // two classes × two segments
    expect(marks.ticks.every((t) => t.stated === true)).toBe(true);

    // a genuinely forced class stays unflagged, so the renderer can never draw one as the other
    const sq = build(['ריבוע ABCD']);
    const dsq = replay(sq.st.facts, sq.st.seed);
    const forced = relationMarks(sq.relations, dsq.positions);
    expect(forced.ticks.length).toBeGreaterThan(0);
    expect(forced.ticks.some((t) => t.stated)).toBe(false);
  });
});
