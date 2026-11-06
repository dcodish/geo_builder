/**
 * #2684 (ADR-3D-421 Am. 1), found pre-playing PR #2723 — A «כך ש-» SENTENCE IS PROSE, AND ONLY ITS CLAUSE IS TYPESET.
 *
 * Measured before in the browser: «E על AC' כך ש-AE = t·p» rendered a minus on AE (the clause's hyphen as an `<mo>`), t·p
 * as «pt ·» (the letter t left its island as prose, so the row reordered it) and an arrow on the host segment AC'.
 * «P על AM כך ש-KP = αu + βv» rendered a minus on KP and an arrow on AM. The figures were right; the row stated a false
 * sign. These assert the markup, so they read what the browser is handed: which tokens sit inside which `<math>`.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FactRowText3 } from '../FactRow3';
import { parse3 } from '../../parser/parse3';
import { vectorNotation } from '../notation';
import { tokenizeRow } from '../VecMath';

const row = (utterance: string, names: string[]) => {
  const r = parse3(utterance);
  if (!r.ok) throw new Error(`not parsed: ${utterance}`);
  return renderToStaticMarkup(<FactRowText3 f={{ utterance, cmds: r.commands }} vecNames={new Set(names)} />);
};
const islands = (html: string) => [...html.matchAll(/<math[^>]*>(.*?)<\/math>/g)].map((m) => m[1]);
/** An island's token texts, in order. */
const unescape = (t: string) => t.replace(/&#x27;/g, "'");
const tokens = (island: string) => [...island.matchAll(/<(?:mi|mo|mn|mtext)(?: [^>]*)?>([^<]*)</g)].map((m) => unescape(m[1])).filter((t) => t !== "→" && t !== "_");
const prose = (html: string) => unescape(html).replace(/<math[^>]*>.*?<\/math>/g, '§').replace(/<[^>]+>/g, '').replace(/[⁦-⁩]/g, '');

describe('#2684 — the clause', () => {
  it('«E על AC׳ כך ש-AE = t·p»: one island, in the order typed, no minus, no arrow on the host', () => {
    const html = row("E על AC' כך ש-AE = t·p", ['p']);
    const isl = islands(html);
    expect(isl).toHaveLength(1);
    expect(tokens(isl[0])).toEqual(['AE', '=', 't', '·', 'p']);
    expect(html).not.toContain('−');
    expect(prose(html)).toBe("E על AC' כך ש-§");
  });

  it('«P על AM כך ש-KP = αu + βv»: the same, and no letter glued to the prose', () => {
    const html = row('P על AM כך ש-KP = αu + βv', ['u', 'v']);
    const isl = islands(html);
    expect(isl).toHaveLength(1);
    expect(tokens(isl[0])).toEqual(['KP', '=', 'α', 'u', '+', 'β', 'v']);
    expect(html).not.toContain('−');
    expect(prose(html)).toBe('P על AM כך ש-§');
  });

  it('a real minus inside the clause stays one: «E על AB כך ש-AE = AC - AD»', () => {
    const html = row('E על AB כך ש-AE = AC - AD', []);
    expect(tokens(islands(html)[0])).toEqual(['AE', '=', 'AC', '−', 'AD']);
    expect(prose(html)).toBe('E על AB כך ש-§'); // an anchored clause too: the host AB takes no arrow
  });

  it('a ratio on the host is no vector row: «K על AA׳ כך ש-AK = 2KA׳» stays one sentence', () => {
    const html = row("K על AA' כך ש-AK = 2KA'", []);
    expect(islands(html)).toEqual([]);
    expect(html).not.toContain('−');
  });

  it.each(["D על AB כך ש-AD = 1", 'D על AB כך ש-AD = 1/2'])('a plain length is no vector row: «%s» keeps its sentence, with no minus', (line) => {
    const html = row(line, []);
    expect(html).not.toContain('−');
    expect(html).not.toContain('→');
  });

  it('the English frame reads the same way', () => {
    const toks = tokenizeRow("E on AC' such that AE = 2AB", new Set());
    expect(toks[0]).toEqual({ k: 'text', text: "E on AC' such that " });
    expect(toks.some((t) => t.k === 'pair' && t.text === 'AE')).toBe(true);
  });

  it('the notation string agrees: the host takes no arrow', () => {
    expect(vectorNotation("E על AC' כך ש-AE = t·p", new Set(['p']))).toBe("E על AC' כך ש-AE⃗ = t·p̲");
  });
});

describe('#2684 — a hyphen glued to a Hebrew word is its joiner, everywhere', () => {
  it('«AB מקביל ל-CD»', () => {
    const toks = tokenizeRow('AB מקביל ל-CD', new Set());
    expect(toks.some((t) => t.k === 'op' && t.text === '-')).toBe(false);
  });
});
