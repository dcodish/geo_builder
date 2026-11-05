/**
 * #1549 (ADR-3D-425) — A LINE THE TOOL READS AS A VECTOR IS SHOWN AS ONE, ON THE CARD AND IN THE STRIP.
 *
 * Operator, 2026-09-29: *"i tried also to say that the vector BA is (-3,4,5). I wrote it using the arrow symbol. it
 * shows good in the row below but doesnt do mathml in the input boxes. when I removed the arrow and just wrote
 * BA=(-3,4,5) it accepted ok but again didnt turn into a vector on display"*.
 *
 * Every assertion is on RENDERED MARKUP through the real `submit` (the #1312 lesson), and through the same call `App3`
 * makes for the strip.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { statedVectorRows } from '../engine/dataView';
import { vectorNames3 } from '../engine/index';
import { parse3 } from '../parser/parse3';
import { FactRowText3, inputPreviewNode3 } from '../render/FactRow3';
import { isVectorFact3 } from '../render/notation';
import { previewReadsVector3 } from '../app/previewReading3';

const CUBE = "קוביה ABCDA'B'C'D'";

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});

function build(...lines: string[]): { last: Fact3 } {
  for (const l of lines) {
    useGeo3.getState().submit(l);
    expect(useGeo3.getState().lastError, l).toBeNull();
  }
  return { last: useGeo3.getState().facts.at(-1)! };
}

const construction = () => {
  const st = useGeo3.getState();
  return derive3(st.facts, st.seed).construction;
};
const names = () => new Set(vectorNames3(construction()));

function cardMarkup(f: Fact3): string {
  const st = useGeo3.getState();
  return renderToStaticMarkup(<FactRowText3 f={f} vecNames={names()} reading={derive3(st.facts, st.seed).readings[f.id]} />);
}

/** The strip, as `App3` asks for it: against the figure BEFORE the line. */
function stripMarkup(line: string): string | null {
  const node = inputPreviewNode3(line, names(), previewReadsVector3(construction(), line));
  return node === null ? null : renderToStaticMarkup(node);
}

/** Type the line (read the strip), press ↵ (read the card). */
function typeThenCommit(line: string): { strip: string | null; card: string } {
  const strip = stripMarkup(line);
  return { strip, card: cardMarkup(build(line).last) };
}

describe('#1549 — his exact sequence', () => {
  it.each([
    ['with the palette arrow', 'BA→=(-3,4,5)'],
    ['without any mark', 'BA=(-3,4,5)'],
  ])('%s: the card typesets the arrow over BA and keeps no raw arrow', (_n, line) => {
    build(CUBE, 'B(0,7,8)');
    const { card } = typeThenCommit(line);
    expect(card).toContain('<mover');
    expect(card).toContain('<mi mathvariant="normal">BA</mi>');
    expect(card.replace(/<mo[^>]*>→<\/mo>/g, ''), 'a raw arrow survived').not.toContain('→');
  });

  it('the engine is unchanged: A lands where the vector says', () => {
    build(CUBE, 'B(0,7,8)', 'BA=(-3,4,5)');
    const st = useGeo3.getState();
    const A = derive3(st.facts, st.seed).positions.get('A')!;
    expect([A.x, A.y, A.z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-3, 11, 13]);
  });
});

describe('#1549 — the strip and the card agree (the operator: "the preview and the committed card always agree")', () => {
  it.each([
    ['BA→=(-3,4,5)'],
    ['BA=(-3,4,5)'],
    ['BA⃗=(-3,4,5)'],
    ['וקטור BA=(-3,4,5)'],
    ['BD = (1,1,1)'],
  ])('«%s» on the cube', (line) => {
    build(CUBE, 'B(0,7,8)');
    const { strip, card } = typeThenCommit(line);
    expect(strip).not.toBeNull();
    expect(strip).toContain('<mover');
    expect(strip).toBe(card);
  });

  it.each([['|AB→|=5'], ['|AB→|=|AD→|'], ['DC→=AB→'], ['AB→']])('«%s» on the cube', (line) => {
    build(CUBE);
    const { strip, card } = typeThenCommit(line);
    expect(strip).toContain('<mover');
    expect(strip).toBe(card);
  });

  it('a definition, which has only the vector reading, previews the arrows its card shows', () => {
    build(CUBE);
    const def = typeThenCommit('AF = 2AB');
    expect(def.card).toContain('<mover');
    expect(def.strip).toBe(def.card);
  });

  /** ADR-3D-391 Am. 1: the card follows trying both readings on the figure, which no parse can answer. */
  it('an unmarked two-reading equation asserts nothing in the strip', () => {
    build(CUBE);
    expect(stripMarkup('DC=3AB') ?? '').not.toContain('<mover');
  });
});

describe('#1549 — every kind that lowers to a vector statement is read as one', () => {
  it('the fact gate, by kind', () => {
    for (const type of ['inject-pair', 'mag-val', 'mag-rel', 'vec-mag', 'dot-eq-chain', 'draw-arrow', 'declare-vector']) {
      expect(isVectorFact3({ cmds: [{ type }] }), type).toBe(true);
    }
    expect(isVectorFact3({ cmds: [{ type: 'segment3' }, { type: 'mag-val' }] }), 'a vector command anywhere wins').toBe(true);
    expect(isVectorFact3({ cmds: [{ type: 'claim', claim: { type: 'vec-eq' } }] })).toBe(true);
    expect(isVectorFact3({ cmds: [{ type: 'claim', claim: { type: 'length-eq' } }] })).toBe(false);
  });

  /** A registry entry cannot be wrong silently: each line's parse carries a vector operand and the gate agrees. */
  it.each([
    ['BA=(-3,4,5)'],
    ['BA→=(-3,4,5)'],
    ['|AB→|=5'],
    ['|AB→+AD→|=5'],
    ['|AB→|=|AD→|'],
    ['DC→=3AB→'],
    ['u=(1,2,3)'],
    ['|u|=3'],
    ['|u|=|v|=1'],
    ['u·v=3'],
    ['u·v = v·w = u·w'],
    ['AB→'],
    ['וקטור u'],
    ['נסמן: AB = u, AD = v'],
  ])('«%s»', (line) => {
    const p = parse3(line);
    if (!p.ok) throw new Error(`${line} did not parse`);
    expect(isVectorFact3({ cmds: p.commands }), JSON.stringify(p.commands.map((c) => c.type))).toBe(true);
  });

  it('a named vector\'s magnitude wears its underline, and a stated tuple keeps its components', () => {
    expect(renderToStaticMarkup(<FactRowText3 f={{ utterance: '|u|=3', cmds: [{ type: 'vec-mag' }] }} vecNames={new Set(['u'])} />)).toContain('<munder');
    const tuple = renderToStaticMarkup(<FactRowText3 f={{ utterance: 'AB=(k-1,k,√2)', cmds: [{ type: 'inject-pair' }] }} vecNames={new Set()} />);
    expect(tuple).toContain('<mover');
    expect(tuple).toContain('√');
    expect(tuple).toContain('k');
  });
});

describe('#1549 — the honesty guard: a statement about SEGMENTS never gains an arrow', () => {
  it.each([
    ['|AB|=5'],
    ['אורך AD = 5'],
    ['AB=5'],
    ['קטע AB'],
    ['|AB|=|AD|'],
    ['AB ⟂ AD'],
    ['AB מאונך ל-AD'],
  ])('«%s»: neither the strip nor the card', (line) => {
    build(CUBE);
    expect(stripMarkup(line) ?? '').not.toContain('<mover');
    expect(cardMarkup(build(line).last)).not.toContain('<mover');
  });

  it('a shape with a right angle stays prose', () => {
    const p = parse3('משולש ישר זווית ABC');
    if (!p.ok) throw new Error('did not parse');
    expect(isVectorFact3({ cmds: p.commands })).toBe(false);
  });
});

describe('#1549 ruling 2 — a stated vector is listed under the stated vectors', () => {
  it.each([['BA=(-3,4,5)'], ['BA→=(-3,4,5)']])('«%s» on his cube', (line) => {
    build(CUBE, 'B(0,7,8)', line);
    expect(statedVectorRows(construction())).toEqual(['BA⃗ = (-3, 4, 5)']);
  });
});

describe('#1549 — a row that newly takes the vector branch keeps its words', () => {
  it.each([
    ["חץ A'C", ['חץ', "A'C"]],
    ['הווקטורים u, v ו-w', ['u', 'v', 'w']],
    ['וקטור u', ['u']],
  ])('«%s»', (utterance, kept) => {
    const p = parse3(utterance);
    if (!p.ok) throw new Error('did not parse');
    const out = renderToStaticMarkup(<FactRowText3 f={{ utterance, cmds: p.commands }} vecNames={new Set(['u', 'v', 'w'])} />).replace(/&#x27;/g, "'");
    for (const k of kept) expect(out).toContain(k);
  });
});
