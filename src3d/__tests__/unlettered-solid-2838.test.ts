/**
 * #2838 (ADR-3D-486) — an unlettered SOLID noun is read against the figure, as FR-SP-24 reads an unnamed flat one
 * (operator rulings 2026-11-10 and 2026-11-12: *"the cube should use new letters if user didnt specifically say cube
 * ABCDA'B'C'D'. this is the same logic we use for other cases too."*). Through the store: indefinite → a NEW solid on the
 * first free letters (typed again, another one); definite → the drawn one, refused naming them when there are two; a
 * lettered solid keeps its letters.
 *
 * pipeline-lock: the class lives in the submit decision as well as the fold — the twin rule («כבר קיים» vs a second
 * solid), the which-one refusal and its taught remedy — which a fixture (builds green) cannot assert.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { derive3, useGeo3 } from '../store/store3';

const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null } as never);
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const build = (lines: readonly string[]) => {
  reset();
  for (const u of lines) submit(u);
};
const derived = (seed = state().seed) => derive3(state().facts, seed);
const solids = () => derived().construction.solids.map((s) => `${s.kind}:${s.ids.join('')}`);
const allOk = () => {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
};

describe('#2838 — an unlettered solid noun takes the first free letters', () => {
  beforeEach(reset);

  it('beside «משולש ABC»: the right isosceles pyramid on D, E, F + G, the equal pair on the new base, ABC unmoved', () => {
    build(['משולש ABC']);
    const before = derive3(state().facts, 0).positions;
    submit('פירמידה ישרה שבסיסה משולש שווה שוקיים');
    expect(state().lastError).toBeNull();
    expect(state().facts).toHaveLength(2);
    allOk();
    expect(solids()).toEqual(['polygon3:ABC', 'pyramid3:DEFG']);
    for (let seed = 0; seed < 6; seed++) {
      const p = derive3(state().facts, seed).positions;
      const d = (a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y, p.get(a)!.z - p.get(b)!.z);
      expect(Math.abs(d('D', 'E') - d('D', 'F')), `seed ${seed}`).toBeLessThan(1e-6);
    }
    const after = derive3(state().facts, 0).positions;
    for (const id of ['A', 'B', 'C']) expect(after.get(id), id).toEqual(before.get(id)); // stability
  });

  it.each([
    ['קובייה', "cube:DEFGD'E'F'G'"],
    ['תיבה', "box:DEFGD'E'F'G'"],
    ['מנסרה משולשת', "prism3:DEFD'E'F'"],
  ])('beside «משולש ABC», «%s» draws on the next free letters', (noun, drawn) => {
    build(['משולש ABC', noun]);
    expect(state().lastError).toBeNull();
    allOk();
    expect(solids()).toEqual(['polygon3:ABC', drawn]);
  });

  it('a point holding A pushes the run along: «A(0,0,0)» · «קובייה» → B…E', () => {
    build(['A(0,0,0)', 'קובייה']);
    allOk();
    expect(solids()).toEqual(["cube:BCDEB'C'D'E'"]);
  });

  it('typed again it draws another one: «קובייה» twice, three times; a pyramid twice', () => {
    build(['קובייה', 'קובייה']);
    expect(state().facts).toHaveLength(2);
    allOk();
    expect(solids()).toEqual(["cube:ABCDA'B'C'D'", "cube:EFGHE'F'G'H'"]);
    submit('קובייה');
    expect(solids()).toHaveLength(3);
    build(['פירמידה ישרה שבסיסה ריבוע', 'פירמידה ישרה שבסיסה ריבוע']);
    allOk();
    expect(solids()).toEqual(['pyramid4:ABCDS', 'pyramid4:EFGHI']);
  });

  it('a LETTERED repeat is the same cube: a held row with the «כבר קיים» notice (ADR-3D-484), no second cube', () => {
    for (const lines of [["קובייה ABCDA'B'C'D'", "קובייה ABCDA'B'C'D'"], ["קובייה ABCDA'B'C'D'", 'קובייה ABCD']]) {
      build(lines);
      expect(state().facts, lines.join(' · ')).toHaveLength(2);
      expect(state().lastError, lines.join(' · ')).toBeNull();
      expect(state().lastNotice, lines.join(' · ')).toEqual({ code: 'already-held' });
      allOk();
      expect(solids(), lines.join(' · ')).toEqual(["cube:ABCDA'B'C'D'"]);
    }
  });

  it('«הקובייה» with ONE cube drawn is that cube — whatever its letters', () => {
    for (const lines of [['קובייה', 'הקובייה'], ['משולש ABC', 'קובייה', 'הקובייה'], ['קובייה', 'התיבה']]) {
      build(lines);
      expect(state().lastError, lines.join(' · ')).toBeNull();
      expect(state().facts, lines.join(' · ')).toHaveLength(lines.length);
      expect(state().lastNotice, lines.join(' · ')).toEqual({ code: 'already-held' });
      allOk();
      expect(derived().construction.solids.filter((s) => s.kind === 'cube'), lines.join(' · ')).toHaveLength(1);
    }
  });

  it('REFUSAL: «הקובייה» with TWO cubes asks which, with 2-D\'s sentence and a remedy that records', () => {
    build(['קובייה', 'קובייה', 'הקובייה']);
    const err = state().lastError;
    expect(err).toMatchObject({ code: 'ambiguous-definite-shape', shapes: ["ABCDA'B'C'D'", "EFGHE'F'G'H'"], solid: 'cube', example: "הקובייה ABCDA'B'C'D'" });
    expect(state().facts).toHaveLength(2);
    const text = (errorText3((k, o) => i18n3d.t(k, o) as string, err!) ?? '').replace(/[⁦-⁩]/g, '');
    expect(text).toContain('קוביות');
    expect(text).toContain("«הקובייה ABCDA'B'C'D'»");
    submit("הקובייה ABCDA'B'C'D'"); // the taught remedy: the named cube, already held
    expect(state().lastError).toBeNull();
    expect(state().lastNotice).toEqual({ code: 'already-held' });
    expect(state().facts).toHaveLength(3);
    expect(solids()).toHaveLength(2);
  });

  it('a LETTERED pyramid over ABC still binds to the triangle (ADR-3D-434)', () => {
    build(['משולש ABC', 'פירמידה ABCS']);
    allOk();
    expect(solids()).toEqual(['polygon3:ABC', 'tetra:ABCS']);
  });

  it('the flat twin is unchanged: «משולש ABC» · «משולש שווה שוקיים» → DEF', () => {
    build(['משולש ABC', 'משולש שווה שוקיים']);
    expect(solids()).toEqual(['polygon3:ABC', 'polygon3:DEF']);
  });
});
