/**
 * #1543 (ADR-3D-301) — «משוואת BB⃗' — לא זוהה»: the ask row echoed a REFUSED question with a vector arrow
 * over BB'. The echo went through `VecMath` ungated, and `VecMath` arrows any two-label run; the fact row
 * and the preview both gate it. The question's own parse now decides (`QueryResult.echo`), and the echo
 * renders through `askEchoNode3`, beside the other two gates — the helper `App3.tsx` calls.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { derive3, useGeo3 } from '../store/store3';
import { answerQuery } from '../engine/queries';
import { askEchoNode3 } from '../render/FactRow3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const build = (...lines: string[]) => {
  reset();
  for (const l of lines) useGeo3.getState().submit(l);
  expect(useGeo3.getState().lastError, lines.join(' · ')).toBeNull();
};
/** The ask row's echo exactly as App3 renders it: answer the question, then the echo helper. */
const echo = (q: string) => {
  const st = useGeo3.getState();
  const c = derive3(st.facts, st.seed).construction;
  const r = answerQuery(c, q, st.seed);
  return { r, html: renderToStaticMarkup(askEchoNode3(r.text, r.echo, new Set(c.vectors.keys()))) };
};

// The operator's figure (#1541): the cube, the top plane, B typed.
const HIS = ["קוביה ABCDA'B'C'D'", "מישור A'B'C'D' הוא x+4y-8z-126=0", 'B(0,7,8)'];

beforeEach(reset);

describe('#1543 — the echo wears an arrow only when the question was READ as a vector', () => {
  it("his exact sequence: «משוואת BB'» is refused, and its echo carries no arrow", () => {
    build(...HIS);
    const { r, html } = echo("משוואת BB'");
    expect(r.note).toBe('notUnderstood');
    expect(r.echo).toBe('plain');
    expect(html).not.toContain('<mover');
    expect(html).toContain('BB&#x27;'); // the letters are still there, plain
  });

  it.each([
    'אורך AB', // a SEGMENT length, by the word
    'length AB',
    'משוואת הישר AB', // not understood today; a line once #1541 lands — never a vector
    'המרחק בין A ל-BC', // a distance
    'זווית ABC', // an angle at a vertex
    "מישור A'B'C'D'", // a plane
    'B', // a point
    'שטח ABC',
  ])('«%s» → no arrow', (q) => {
    build(...HIS);
    const { r, html } = echo(q);
    expect(r.echo).toBe('plain');
    expect(html).not.toContain('<mover');
  });

  it.each([
    "BB'", // the vector itself
    'וקטור AB',
    "|BB'|", // the magnitude of the VECTOR — the bars are the vector notation
    'AB·CD',
    '∠(AB,CD)',
  ])('«%s» → the arrow spans the pair', (q) => {
    build(...HIS);
    const { r, html } = echo(q);
    expect(r.echo).toBe('vector');
    expect(html).toContain('<mover');
  });

  it('a named vector reads as a vector in every vector question (typeset, not prose)', () => {
    build('A(0,0,0)', 'B(1,2,3)', 'S(0,0,4)', 'AS=w');
    for (const q of ['w', '|w|', 'w·w']) {
      const { r, html } = echo(q);
      expect(r.echo, q).toBe('vector');
      expect(html, q).toContain('<munder'); // a NAMED vector is typeset underlined (w̲), not arrowed
    }
  });

  it('a plain echo keeps the fact row’s plain rendering: math is typeset, Latin runs are isolated', () => {
    build(...HIS);
    const { html } = echo('אורך AB');
    expect(html).toContain('⁦AB⁩'); // the LTR isolate the fact row puts around a run
  });
});
