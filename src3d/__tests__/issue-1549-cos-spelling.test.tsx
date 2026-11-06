/**
 * #1549 (ADR-3D-430) — A ROW TYPED WITH COS WEARS ARROWS; PERPENDICULARITY, WHICH SHARES ITS KIND, DOES NOT.
 *
 * Operator, 2026-11-06, on the escalation: *"I agree with recommendation"*: arrows on the cos spelling only.
 * Assertions are on RENDERED MARKUP through the real `submit` and the same preview call `App3` makes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { derive3, statedCommand3, useGeo3, type Fact3 } from '../store/store3';
import { vectorNames3 } from '../engine/index';
import { parse3 } from '../parser/parse3';
import { FactRowText3, inputPreviewNode3 } from '../render/FactRow3';
import { VecMath } from '../render/VecMath';
import { isVectorFact3 } from '../render/notation';
import { previewReadsVector3 } from '../app/previewReading3';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';

const CUBE = "קוביה ABCDA'B'C'D'";

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});

function build(...lines: string[]): Fact3 {
  for (const l of lines) {
    useGeo3.getState().submit(l);
    expect(useGeo3.getState().lastError, l).toBeNull();
  }
  return useGeo3.getState().facts.at(-1)!;
}
const construction = () => {
  const st = useGeo3.getState();
  return derive3(st.facts, st.seed).construction;
};
const names = () => new Set(vectorNames3(construction()));
const card = (f: Fact3) => renderToStaticMarkup(<FactRowText3 f={f} vecNames={names()} />);
function strip(line: string): string | null {
  const node = inputPreviewNode3(line, names(), previewReadsVector3(construction(), line));
  return node === null ? null : renderToStaticMarkup(node);
}

describe('#1549 — the cos spelling wears arrows, on the card and in the strip', () => {
  it.each([
    ['cos(AB,AD)=0'],
    ['cos(AB→,AD→)=0'],
    ['cos(AB⃗,AD⃗)=0'],
    ['cos(AB,AD)=1/2'],
    ['cos(AB,AD)=√3/2'],
    ['קוסינוס הזווית בין AB ל-AD הוא 1/2'],
  ])('«%s»', (line) => {
    build('משולש ABD');
    const s = strip(line);
    const out = card(build(line));
    expect(out).toContain('<mi mathvariant="normal">AB</mi>');
    expect(out).toContain('<mi mathvariant="normal">AD</mi>');
    expect(out.replace(/<mo[^>]*>→<\/mo>/g, ''), 'a raw arrow survived').not.toContain('→');
    expect(s).toBe(out);
  });

  it('a named vector keeps its underline, and cos is one word even with a vector named s', () => {
    const out = renderToStaticMarkup(<FactRowText3 f={{ utterance: 'cos(s,v)=1/2', cmds: [{ type: 'cos-angle', spelled: 'cos' }] }} vecNames={new Set(['s', 'v'])} />);
    expect(out).toContain('cos');
    expect(out.match(/<munder/g)).toHaveLength(2);
  });
});

describe('#1549 — what shares the kind stays plain', () => {
  it.each([['AB ⟂ AD'], ['AB ⊥ AD'], ['AB מאונך ל-AD']])('«%s»', (line) => {
    build(CUBE);
    expect(strip(line) ?? '').not.toContain('<mover');
    expect(card(build(line))).not.toContain('<mover');
  });

  it.each([['משולש ישר זווית ABC'], ['מנסרה שבסיסה מלבן'], ['SM מאונך ל-DB']])('«%s» does not read as vectors', (line) => {
    const p = parse3(line);
    if (!p.ok) throw new Error('did not parse');
    expect(isVectorFact3({ cmds: p.commands })).toBe(false);
  });

  it('the vertex form names no pair, so it stays as it was', () => {
    const p = parse3('cos∠ABC = 1/2');
    if (!p.ok) throw new Error('did not parse');
    expect(isVectorFact3({ cmds: p.commands })).toBe(false);
  });
});

describe('#1549 — the field is how a line was written, never what it states', () => {
  const cosCmd = () => {
    const p = parse3('cos(AB,AD)=0');
    if (!p.ok) throw new Error('did not parse');
    return p.commands.find((c) => c.type === 'cos-angle')!;
  };

  it('the parser sets it and the stated command drops it', () => {
    expect(cosCmd()).toMatchObject({ spelled: 'cos' });
    expect(statedCommand3(cosCmd())).not.toHaveProperty('spelled');
  });

  it('a file saved before the field loads, and its row stays plain', () => {
    const f = build(CUBE, 'cos(AB,AD)=0');
    const st = useGeo3.getState();
    const saved = JSON.parse(serializeFigure3(st.facts, st.seed));
    for (const fact of saved.facts) for (const c of fact.cmds) delete c.spelled;
    const loaded = deserializeFigure3(JSON.stringify(saved));
    if (!('facts' in loaded) || !loaded.facts) throw new Error('did not load');
    const old = loaded.facts.at(-1)!;
    expect(old.utterance).toBe(f.utterance);
    expect(renderToStaticMarkup(<FactRowText3 f={old as Fact3} vecNames={new Set()} />)).not.toContain('<mover');
  });
});

describe('#1549 — the tokens a cos row reaches', () => {
  it('a root over a number is the numerator: √3/2 is never √(3/2)', () => {
    const out = renderToStaticMarkup(<VecMath text="AB⃗ = √3/2" vecNames={new Set()} />);
    expect(out).toContain('<mfrac><msqrt><mn>3</mn></msqrt><mn>2</mn></mfrac>');
  });

  it('a bare root is unchanged', () => {
    expect(renderToStaticMarkup(<VecMath text="AB⃗ = √2" vecNames={new Set()} />)).not.toContain('<msqrt');
  });
});

describe('#1549 — the data panel row spans the name', () => {
  it('«BA⃗ = (-3, 4, 5)» renders a mover over BA and no combining mark', () => {
    const out = renderToStaticMarkup(<VecMath text="BA⃗ = (-3, 4, 5)" vecNames={new Set()} />);
    expect(out).toContain('<mi mathvariant="normal">BA</mi>');
    expect(out).not.toContain('⃗');
  });
});
