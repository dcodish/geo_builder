/**
 * #505 ([ADR-444](../../../docs/06-decisions.md#adr-444)) — a BARE 3–4 letter label run declares the
 * obvious shape, one behaviour across casings. Prod session `vgrm5pjb`: the student's very first
 * utterance was `Abcd`; the paid LLM built `quadrilateral A B C D`. The rule DELEGATES to the noun
 * rules, so the lowering is asserted byte-identical to the spelled-out form — identity, not shape.
 */
import { describe, it, expect } from 'vitest';
import { parse, type ParseContext } from '../parse';

const commandsOf = (input: string, ctx?: ParseContext) => {
  const r = parse(input, ctx);
  expect(r.ok, `"${input}" should parse: ${JSON.stringify(r)}`).toBe(true);
  return r.ok ? r.commands : [];
};

describe('#505 — the bare run declares the shape', () => {
  it.each(['ABCD', 'Abcd', 'abcd'])('«%s» lowers byte-identically to «מרובע ABCD»', (u) => {
    expect(commandsOf(u)).toEqual(commandsOf('מרובע ABCD'));
  });

  it.each(['ABC', 'Abc', 'abc'])('«%s» lowers byte-identically to «משולש ABC»', (u) => {
    expect(commandsOf(u)).toEqual(commandsOf('משולש ABC'));
  });

  it('re-issuing is idempotent by construction (same commands as the noun form both times)', () => {
    expect(commandsOf('Abcd')).toEqual(commandsOf('ABCD'));
  });
});

describe('#505 — deliberate boundaries', () => {
  it('a 2-letter run stays a SEGMENT (bareSegment owns it)', () => {
    const c = commandsOf('AB');
    expect(c.some((x) => x.type === 'segment')).toBe(true);
    expect(c.some((x) => x.type === 'quadrilateral' || x.type === 'triangle')).toBe(false);
  });

  it('a repeated letter is not a vertex run', () => {
    for (const u of ['ABBA', 'AAB', 'abab']) {
      const r = parse(u);
      if (r.ok) expect(r.commands.some((x) => x.type === 'quadrilateral' || x.type === 'triangle'), u).toBe(false);
    }
  });

  it('a run over EXISTING points is a statement, not a declaration — the #536 ordered-line lane keeps it', () => {
    const ctx: ParseContext = { points: ['A', 'D', 'B'] };
    const r = parse('ADB', ctx);
    // must NOT become a triangle over the student's existing figure
    if (r.ok) expect(r.commands.some((x) => x.type === 'triangle')).toBe(false);
  });

  it('a 5-letter run is not claimed', () => {
    const r = parse('ABCDE');
    if (r.ok) expect(r.commands.some((x) => x.type === 'quadrilateral' || x.type === 'triangle')).toBe(false);
  });
});
