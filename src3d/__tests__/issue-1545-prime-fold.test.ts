/**
 * #1545 (ADR-3D-300) — «קוביה ABCDA׳B׳C׳D׳» (Hebrew GERESH ׳, U+05F3) was refused «bad-solid» and the ask
 * «BB׳» was not understood. The prime fold was spelled in three places (`normalize3`, the ask lane's
 * `parseQuery`, the LLM sequence gate) and ׳ was in none of them; unfolded, it is not a label character,
 * so the label RUN stopped at it and restarted after it — the cube's top ring silently duplicated the
 * base. The fold is now ONE set (`PRIME_GLYPHS3` / `foldPrimes3`) that all three readers call.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { answerQuery, parseQuery } from '../engine/queries';
import { foldPrimes3, normalize3, parse3, PRIME_GLYPHS3 } from '../parser/parse3';
import { restoreStatedSequences3 } from '../parser/honesty3';
import { bidiSegments3 } from '../i18n/bidi';
import { normalizeLabel3, relabelTokens3 } from '../store/rename3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const ask = (text: string) => {
  const st = useGeo3.getState();
  return answerQuery(derive3(st.facts, st.seed).construction, text, st.seed);
};
const GLYPHS = [...PRIME_GLYPHS3];
const prime = (g: string, s: string) => s.replace(/'/g, g);

beforeEach(reset);

describe('#1545 — every prime glyph is a prime, in every reader', () => {
  it('the set holds the geresh and the modifier primes, and each is one code unit (length-preserving)', () => {
    for (const g of ['׳', 'ʹ', 'ʼ', '′', '’', '‘', '´', '`']) expect(GLYPHS).toContain(g);
    for (const g of GLYPHS) expect(g.length).toBe(1);
    expect(GLYPHS).not.toContain('״'); // gershayim is a quote, not a prime
  });

  it.each(GLYPHS)('«%s»: the cube parses exactly as the ASCII spelling', (g) => {
    expect(parse3(prime(g, "קוביה ABCDA'B'C'D'"))).toEqual(parse3("קוביה ABCDA'B'C'D'"));
    expect(parse3(prime(g, "cube ABCDA'B'C'D'"))).toEqual(parse3("cube ABCDA'B'C'D'"));
  });

  it.each(GLYPHS)('«%s»: a primed point with coordinates parses', (g) => {
    expect(parse3(prime(g, "B'(2,15,-8)"))).toEqual({ ok: true, commands: [{ type: 'point3', id: "B'", x: 2, y: 15, z: -8 }] });
  });

  it.each(GLYPHS)('«%s»: the ask lane and the parser fold it the same way', (g) => {
    reset();
    submit("קוביה ABCDA'B'C'D'");
    const c = derive3(useGeo3.getState().facts, 0).construction;
    expect(parseQuery(c, prime(g, "BB'"))).toEqual(parseQuery(c, "BB'"));
    expect(normalize3(`A${g}`)).toBe("A'");
    expect(foldPrimes3(`A${g}B${g}`)).toBe("A'B'");
  });

  it.each(GLYPHS)('«%s»: the LLM sequence gate canonicalises an emitted line the same way', (g) => {
    // the LLM reorders the run; the gate must still see it as the stated run and restore the order
    const out = restoreStatedSequences3(prime(g, "קוביה ABCDA'B'C'D'"), [prime(g, "קוביה BACDA'B'C'D'")]);
    expect(out.lines).toEqual(["קוביה ABCDA'B'C'D'"]);
  });

  it('no src3d source spells its own prime CLASS in a regex literal (the fold is defined once)', () => {
    const root = resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) { if (n !== '__tests__') walk(p); }
        else if (/\.tsx?$/.test(n)) files.push(p);
      }
    };
    walk(root);
    const offenders = files.filter((f) => /\/\[[^\]\n]*[′’‘´׳ʹʼ][^\]\n]*\]/.test(
      readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l) && !l.includes('PRIME_GLYPHS3 =')).join('\n'),
    ));
    expect(offenders).toEqual([]);
  });

  it.each(GLYPHS)('«%s»: the display keeps a primed run whole (the last prime stays inside the isolate)', (g) => {
    const segs = bidiSegments3(prime(g, "קוביה ABCDA'B'C'D'"));
    expect(segs.filter((x) => x.ltr).map((x) => x.text)).toEqual([prime(g, "ABCDA'B'C'D'")]);
  });

  it.each(GLYPHS)('«%s»: the rename dialog reads it as a prime, and a rename keeps A and its primed twin apart', (g) => {
    expect(normalizeLabel3(`b${g}`)).toBe("B'");
    const u = prime(g, "קוביה ABCDA'B'C'D'");
    expect(relabelTokens3(u, 'A', 'M')).toBe(prime(g, "קוביה MBCDA'B'C'D'"));
    expect(relabelTokens3(u, "A'", "M'")).toBe(prime(g, "קוביה ABCDM'B'C'D'"));
  });
});

describe('#1545 — the operator figure, typed with the geresh', () => {
  it('the cube builds with A׳…D׳ as eight distinct vertices (before: «bad-solid»)', () => {
    submit('קוביה ABCDA׳B׳C׳D׳');
    expect(useGeo3.getState().lastError).toBeNull();
    const ids = derive3(useGeo3.getState().facts, 0).construction;
    for (const id of ["A'", "B'", "C'", "D'"]) expect(ids.points.has(id)).toBe(true);
  });

  it('ask «BB׳» answers what «BB\'» answers on the #1541 figure', () => {
    for (const l of ['קוביה ABCDA׳B׳C׳D׳', 'מישור A׳B׳C׳D׳ הוא x+4y-8z-126=0', 'B(0,7,8)']) submit(l);
    expect(useGeo3.getState().lastError).toBeNull();
    expect(ask("BB'").answer).toBe('(2, 8, -16)');
    expect(ask('BB׳').answer).toBe('(2, 8, -16)');
    expect({ ...ask('משוואת BB׳'), text: '' }).toEqual({ ...ask("משוואת BB'"), text: '' });
  });
});
