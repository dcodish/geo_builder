/**
 * #1912 ([ADR-3D-329](../../docs/06b-decisions-3d.md#adr-3d-329)) — A LOOK-ALIKE GLYPH IS THE SYMBOL IT
 * RENDERS AS, in 3-D too.
 *
 * Reported: «AC ⟂ AB» (⟂, U+27C2) was «לא הצלחתי להבין את הנתון» while «AC ⊥ AB» (⊥, U+22A5) built, and
 * 2-D reads both. Measured at pickup, the class was wider: 3-D's `normalize3` folded NONE of the
 * look-alikes 2-D folds, so «∡ABC = 40°», «∢ABC = 40°», «<ABC = 40°», «∠ABC = 40⁰/40º/40˚» and
 * «אורך AB הוא שורש 2» were all not-understood, and the ask lane did not answer «∡SAB» or «<SAB». The
 * fold is now the shared `shell/glyphFold` table, which 2-D's and analytic's boundaries call too.
 *
 * The build + drift net for the reported sequence is the fixture `fixtures3/perp-glyph-u27c2-1912.geo3.json`;
 * these are the bespoke assertions — the twins pairwise identical to their canonical glyph, the ask
 * lane, the guards, and the row keeping what the student typed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, useGeo3, type Fact3 } from '../store/store3';
import { parseQuery } from '../engine/queries';
import { normalize3, parse3 } from '../parser/parse3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);

/** The real submit door, on a fresh canvas: one verdict per line, the figure carried forward. */
const run = (lines: readonly string[]) => {
  let s: { facts: Fact3[]; seed: number } = { facts: [], seed: 0 };
  return lines.map((line) => {
    const v = decideSubmit3(s, line);
    if (v.kind === 'record') s = { facts: v.facts, seed: v.seed };
    return v;
  });
};

beforeEach(reset);

describe('#1912 — the reported sentence', () => {
  it('«משולש ABC» · «AC ⟂ AB» records, exactly as the ⊥ twin does', () => {
    const [, perp] = run(['משולש ABC', 'AC ⟂ AB']);
    expect(perp.kind).toBe('record');
    expect(parse3('AC ⟂ AB')).toEqual(parse3('AC ⊥ AB'));
    expect(parse3('AC⟂AB')).toEqual(parse3('AC⊥AB'));
  });

  it('on a plane too: «SA ⟂ ABC» is «SA ⊥ ABC»', () => {
    const [, perp] = run(['פירמידה SABC', 'SA ⟂ ABC']);
    expect(perp.kind).toBe('record');
    expect(parse3('SA ⟂ ABC')).toEqual(parse3('SA ⊥ ABC'));
  });

  it('the figure verifies — every fact OK', () => {
    submit('משולש ABC');
    submit('AC ⟂ AB');
    const st = useGeo3.getState();
    expect(st.lastError).toBeNull();
    const d = derive3(st.facts, st.seed);
    for (const f of st.facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.positions.size).toBeGreaterThan(0);
  });
});

describe('#1912 — the class: every twin parses as its canonical glyph', () => {
  it.each([
    ['∡ABC = 40°', '∠ABC = 40°'],
    ['∢ABC = 40°', '∠ABC = 40°'],
    ['<ABC = 40°', '∠ABC = 40°'],
    ['∠ABC = 40⁰', '∠ABC = 40°'],
    ['∠ABC = 40º', '∠ABC = 40°'],
    ['∠ABC = 40˚', '∠ABC = 40°'],
    ['∢C = 90°', '∠C = 90°'],
    ['אורך AB הוא שורש 2', 'אורך AB הוא √2'],
    ['|AB| = שורש 2', '|AB| = √2'],
  ])('«%s» ≡ «%s»', (twin, canonical) => {
    expect(normalize3(twin)).toBe(normalize3(canonical));
    expect(parse3(twin)).toEqual(parse3(canonical));
  });

  it.each([
    ['משולש ABC', '∡ABC = 40°'],
    ['משולש ABC', '∢ABC = 40°'],
    ['משולש ABC', '<ABC = 40°'],
    ['משולש ABC', '∠ABC = 40⁰'],
    ['משולש ABC', '∠ABC = 40º'],
    ['משולש ABC', '∠ABC = 40˚'],
    ['משולש ABC', '∢C = 90°'],
    ['משולש ABC', 'אורך AB הוא שורש 2'],
    ['משולש ABC', '|AB| = שורש 2'],
  ])('«%s» · «%s» records through the real door', (shape, line) => {
    const [, v] = run([shape, line]);
    expect(v.kind).toBe('record');
  });

  it('an out-of-range angle written with a twin is REFUSED by name, not "not understood"', () => {
    for (const line of ['∢ABC = -2', '∢ABC = 200']) {
      const [, v] = run(['משולש ABC', line]);
      expect(v.kind, line).toBe('refused');
    }
  });
});

describe('#1912 — the ask lane reads the same vocabulary', () => {
  it('«∡SAB» and «<SAB» are answered as «∠SAB» is', () => {
    submit('פירמידה SABC');
    const c = derive3(useGeo3.getState().facts, 0).construction;
    expect(parseQuery(c, '∠SAB')).not.toBeNull();
    expect(parseQuery(c, '∡SAB')).toEqual(parseQuery(c, '∠SAB'));
    expect(parseQuery(c, '∢SAB')).toEqual(parseQuery(c, '∠SAB'));
    expect(parseQuery(c, '<SAB')).toEqual(parseQuery(c, '∠SAB'));
  });
});

describe('#1912 — the guards', () => {
  it('a `<` between two operands is still less-than, never an angle', () => {
    const angles = (t: string) => (t.match(/∠/g) ?? []).length;
    for (const s of ['AB < CD', 'α<β', 'k < 0', '0 < t < 1', '∠ABC < A', '60 < זווית SAB < 90']) {
      const out = normalize3(s);
      expect(out, s).toContain('<');
      expect(angles(out), s).toBe(angles(s)); // no ∠ is minted from the comparison
    }
  });

  it('a length comparison is not turned into an angle statement', () => {
    const [, v] = run(['משולש ABC', 'AB < CD']);
    expect(v.kind).toBe('not-understood'); // 3-D reads no length comparison at all — but it is not an angle
  });
});

describe('#1912 — the stored row keeps what the student typed', () => {
  it('the fact list shows «AC ⟂ AB», not the folded spelling', () => {
    submit('משולש ABC');
    submit('AC ⟂ AB');
    expect(useGeo3.getState().facts.map((f) => f.utterance)).toEqual(['משולש ABC', 'AC ⟂ AB']);
  });
});
