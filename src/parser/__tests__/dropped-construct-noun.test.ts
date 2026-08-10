/**
 * #456 / [ADR-430](../../../docs/06-decisions.md#adr-430) — a stated CONSTRUCT NOUN must materialise.
 *
 * The class, found by the sibling audit while fixing 3-D's #438/#440 and ported as a PATTERN (docs/20 §12
 * — the products share no code): *a sentence states two objects, a shape and a construct on it; the one
 * rule that recognises its own noun claims the whole utterance, emits only its own object, and silently
 * discards the rest.* `מלבן ABCD עם אלכסונים` committed a bare rectangle with a green ✓, and none of the
 * seven deterministic gates could see it — nothing asked whether a stated OBJECT materialised at all.
 *
 * The half that matters most here is the GENEROSITY half. A tightened gate that refuses working input is
 * strictly worse than the silent drop it replaces, and 3-D measured that risk the hard way: its first
 * draft mapped each noun to the object kind it "should" produce and false-flagged 28 working inputs. So
 * the corpus nets below are not decoration — they are the reason the generic predicate was chosen.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, droppedConstructNoun, parse } from '@/parser';
import { COMMAND_CATALOG } from '@/parser/catalog';
import { isGeoPoint } from '@/engine';
import type { AnyCommand } from '@/engine';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

/** Build a figure from the leading utterances, then gate the LAST one against it — the app's own shape. */
function gate(utterances: string[]): { ok: boolean; dropped: string[] } {
  const facts: Fact[] = [];
  for (const u of utterances.slice(0, -1)) {
    const fig = replay(facts);
    const r = parse(u, buildParseCtx(fig.construction, fig.positions));
    if (!r.ok) throw new Error(`context step did not parse: ${u}`);
    for (const c of r.commands) facts.push({ id: `${facts.length}`, group: u, enabled: true, utterance: u, cmd: c });
  }
  const fig = replay(facts);
  const last = utterances[utterances.length - 1];
  const r = parse(last, buildParseCtx(fig.construction, fig.positions));
  if (!r.ok) return { ok: false, dropped: [] };
  const pts = fig.construction.objects.filter(isGeoPoint).map((o) => o.id);
  return { ok: true, dropped: droppedConstructNoun(last, r.commands, pts) };
}

describe('#456 — a stated construct that no command produced is refused, not committed', () => {
  it('the audit case: «מלבן ABCD עם אלכסונים» now escalates at the PARSE (#497) — never a bare rectangle', () => {
    // The rectangle rule's denylist spelled «אלכסון» with a FINAL nun, so it could never see the
    // plural «אלכסונים» (the lexicon's ADR-3D-035 trap) — which is exactly why this utterance used to
    // half-parse and #456 needed the noun gate. The #497 fail-closed gate flags the plural as an
    // unknown word and the whole line escalates; the noun gate stays the LLM-commit path's net.
    expect(gate(['מלבן ABCD עם אלכסונים']).ok).toBe(false);
  });

  it('names the student\'s WHOLE word, never the regex stem (the honesty invariant)', () => {
    // «אלכסו[ןנ]»/«גבהי»/«תיכו[ןנ]» all stop at an inflection point, so the raw match is a STEM.
    // Asserted against a hand-built bare-shape lowering rather than a phrasing, because which phrasings
    // the grammar happens to claim is not what this property is about (most are `not-handled` today —
    // #456's own table — and a capability landing later must not silently retire this check).
    const bare = [{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }] as unknown as AnyCommand[];
    for (const w of ['אלכסונים', 'אלכסון', 'גבהים', 'תיכונים', 'תיכון']) {
      expect(droppedConstructNoun(`מלבן ABCD עם ${w}`, bare, []), w).toEqual([w]);
    }
  });

  it('a bare shape with NO construct noun is untouched', () => {
    for (const line of ['מלבן ABCD', 'ריבוע ABCD', 'משולש ABC', 'מרובע ABCD']) {
      expect(gate([line]).dropped, line).toEqual([]);
    }
  });
});

describe('#456 — GENEROUS: anything beyond the bare shape accounts for the noun', () => {
  it.each([
    ['a diagonal lowering to a SEGMENT', ['משולש ABC', 'אלכסון AC']],
    ['a diagonal lowering to a POINT', ['מלבן ABCD', 'האלכסונים נחתכים בנקודה E']],
    ['an altitude lowering to a FOOT', ['משולש ABC', 'גובה מ A']],
    ['a median lowering to a MIDPOINT', ['משולש ABC', 'תיכון AD']],
    ['a circle that genuinely materialises', ['משולש ABC חסום במעגל']],
    ['a circle declared on its own', ['מעגל שרדיוסו 5']],
  ])('%s', (_label, lines) => {
    expect(gate(lines).dropped, lines.join(' | ')).toEqual([]);
  });

  it('the ADR-156 REUSE case — a restatement asserts nothing new, so nothing was dropped', () => {
    // Re-typing the inscribe reuses circle O and emits only idempotent re-declarations (no circle
    // command at all). It was the ONLY false flag in 1202 corpus steps, and refusing it would break a
    // working input — the figure already holds the circle the sentence names.
    expect(gate(['מרובע ABCD חסום במעגל', 'מרובע ABCD חסום במעגל']).dropped).toEqual([]);
  });
});

describe('#456 — the false-positive nets that chose the generic predicate', () => {
  it('every supported CATALOG example, both locales, is gate-clean', () => {
    const flagged: string[] = [];
    let checked = 0;
    for (const e of COMMAND_CATALOG) {
      if (!e.supported) continue;
      for (const u of [e.he, e.en]) {
        const fig = replay([]);
        const r = parse(u, buildParseCtx(fig.construction, fig.positions));
        if (!r.ok) continue;
        checked++;
        if (droppedConstructNoun(u, r.commands, []).length) flagged.push(u);
      }
    }
    expect(checked).toBeGreaterThan(250); // the corpus is real, not an empty loop
    expect(flagged).toEqual([]);
  });
});
