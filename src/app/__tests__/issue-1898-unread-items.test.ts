/**
 * #1898 ([ADR-627](../../../docs/06-decisions.md#adr-627)) — ONE MERGE FOR THE UNREAD-ITEM LIST.
 *
 * The partial-reading notice said «לא הצלחתי למקם את D, D». D was stated once; the battery's label gate
 * and its span accountant each named it, and the accountant names each OCCURRENCE besides. The
 * deterministic battery (`honestyGateReport`) had merged its gates since ADR-461; the AI seam in
 * `submitPipeline` kept its own concatenation and merged nothing.
 *
 * So the merge is a function — `unreadItems` — and it is where the list is ASSEMBLED, not where it is
 * rendered. These tests lock the merge itself and lock that the battery's `items` IS that merge, so a
 * seam (or a gate added later) cannot grow a list that repeats a name.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { honestyGateReport, unreadItems } from '../honestyGates';
import type { AnyCommand } from '@/engine';

describe('#1898 — unreadItems is the one merge', () => {
  it('names each item once, in the order first stated, across every list', () => {
    expect(unreadItems(['D'], ['D'])).toEqual(['D']);
    expect(unreadItems(['D', 'E'], ['D', 'E'])).toEqual(['D', 'E']);
    expect(unreadItems(['D'], ['D', 'D', 'D'])).toEqual(['D']);
    expect(unreadItems(['E', 'D'], ['D'])).toEqual(['E', 'D']); // order of DISTINCT items is untouched
  });

  it('a number and its string spelling are one item (the gates disagree on type, not on the thing)', () => {
    expect(unreadItems([7], ['7'])).toEqual(['7']);
    expect(unreadItems([7, 3], ['3'], [7])).toEqual(['7', '3']);
  });

  it('an empty or blank item is never shown to the student', () => {
    expect(unreadItems([''], ['  '], ['D'])).toEqual(['D']);
    expect(unreadItems([], [])).toEqual([]);
  });
});

/** The battery's verdict on one utterance parsed against a given point context. */
const gateOf = (utterance: string, points: string[] = []) => {
  const r = parse(utterance, { points });
  expect(r.ok, `precondition: «${utterance}» must parse for this to be a GATE question`).toBe(true);
  return honestyGateReport(utterance, r.ok ? r.commands : ([] as AnyCommand[]), { points });
};

describe('#1898 — the battery assembles its list through that merge', () => {
  // Utterances whose lowering leaves something unread, so more than one gate has something to say.
  // #2234 (ADR-737): «משולש ABC ישר זווית ב-B» no longer parses (refused by its words), so its twin with a lost vertex tail stands in
  const rows = ['מרכזו O. שתי נקודות על המעגל A ו B', 'משולש ABC שווה שוקיים ב-B', 'AD גובה לצלע BC שהוא גם תיכון'];

  for (const u of rows) {
    it(`«${u}» — items is exactly unreadItems over the gate outputs, with no repeats`, () => {
      const g = gateOf(u);
      expect(g.items).toEqual(
        unreadItems(
          g.dropped,
          g.droppedNums,
          g.droppedRels,
          g.droppedVerbs,
          g.droppedCompound,
          g.droppedWordRels,
          g.droppedConstruct,
          g.unaccounted.map((x) => x.text),
          g.latinProse,
          g.unread?.items ?? [],
          g.unreadRole?.items ?? [],
        ),
      );
      expect(new Set(g.items).size, 'no item is named twice').toBe(g.items.length);
    });
  }
});
