/**
 * #1608 (ADR-3D-298) — «נקודה E במישור ABC» was not understood, while «E נמצאת במישור ABC» and
 * «E על המישור ABC» built.
 *
 * Class: the VERBLESS «ב-» containment form had no rule. `membership`/`pointRelPlane` read «על» (verb
 * optional); the shared containment frame (`CONTAINED_SPLIT`, #614/#963) read «ב…» only after a verb.
 * The gap was not point-specific — «AB במישור ABC» and «ℓ במישור π1» escalated alike — so the bare
 * preposition is admitted in the one frame both containment rules share, gated on an explicit plane
 * noun, and the operand kinds decide the lowering exactly as for the verb-headed form.
 *
 * The grid drives the store's real submit path on a pyramid, then compares the stored commands.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
beforeEach(() => {
  st().clear();
});

/** Submit on a fresh pyramid; return the error and the commands the LAST line committed. */
const onPyramid = (line: string) => {
  st().clear();
  st().submit('פירמידה SABCD');
  expect(st().lastError, 'the pyramid itself').toBeNull();
  const before = st().facts.length;
  st().submit(line);
  const err = st().lastError;
  const added = st().facts.slice(before);
  return { err, added, allOk: Object.values(derive3(st().facts, 0).status).every((s) => s === 'ok') };
};

const cmds = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`expected «${u}» to parse, got ${r.reason}`);
  return r.commands;
};

describe('#1608 — point-in-plane: {נקודה E, E} × {ב, על, נמצאת ב, נמצאת על} × {ABC, ABCD}', () => {
  const subjects = ['נקודה E', 'E'];
  const preps = ['במישור', 'על המישור', 'נמצאת במישור', 'נמצאת על המישור'];
  for (const plane of ['ABC', 'ABCD']) {
    const expected = [
      { type: 'plane-through', name: plane, ids: [...plane] },
      { type: 'on-planes', id: 'E', plane },
    ];
    for (const subj of subjects) {
      for (const prep of preps) {
        const u = `${subj} ${prep} ${plane}`;
        it(`«${u}» builds the same on-planes as «E על המישור ${plane}»`, () => {
          expect(cmds(u)).toEqual(expected);
          const r = onPyramid(u);
          expect(r.err, u).toBeNull();
          expect(r.added.length, u).toBe(1);
          expect(r.allOk, u).toBe(true);
        });
      }
    }
  }

  it('a named plane and the face/base nouns read the same way', () => {
    expect(cmds('E במישור π1')).toEqual(cmds('E על המישור π1'));
    expect(cmds('E בפאה SBC')).toEqual(cmds('E על המישור SBC'));
    expect(cmds('E ב-מישור ABC')).toEqual(cmds('E על המישור ABC'));
    expect(cmds('E in plane ABC')).toEqual(cmds('E on plane ABC'));
  });
});

describe('#1608 — the verbless form for a LINE: the operand kind decides, as with the verb', () => {
  it.each([
    ['AB במישור ABC', 'AB מוכל במישור ABC'],
    ['הישר AB במישור ABC', 'הישר AB מוכל במישור ABC'],
    ['ℓ במישור π1', 'ℓ מוכל במישור π1'],
    ['הישר ℓ במישור ABCD', 'הישר ℓ מוכל במישור ABCD'],
  ])('«%s» lowers exactly like «%s»', (verbless, verbed) => {
    expect(cmds(verbless)).toEqual(cmds(verbed));
  });
});

describe('#1608 — what the verbless form must still refuse', () => {
  it('without a plane noun, «ב» is not containment (a segment is no container)', () => {
    for (const u of ['C ב-AB', 'C בקטע AB', 'E ב-ABC', 'E במישור']) {
      expect(parse3(u).ok, u).toBe(false);
    }
  });

  it('the coordinate frame keeps its own cell', () => {
    expect(parse3('E במישור xy').ok).toBe(false);
  });
});
