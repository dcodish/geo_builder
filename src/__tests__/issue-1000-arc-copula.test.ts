/**
 * #1000 — A BARE COPULA BETWEEN TWO ARCS IS TAUGHT, NOT ACCEPTED.
 *
 * **Operator, 2026-09-13, playing round #998 T10:** *"the syntax is wrong. When you say «קשת CD היא קשת
 * DE» it is the same arc (which doesn't make sense). So the user should have said arc X is equal to arc Y
 * — I tested this and it works."*
 *
 * **Ruling, 2026-09-14, verbatim:** *"for 1000 - this is the ruling: «קשת CD שווה לקשת DE»."*
 *
 * In Hebrew «היא» between two arcs reads as IDENTITY — this arc *is* that arc — which between two
 * differently-named arcs says nothing at all. [ADR-507](../../docs/06-decisions.md#adr-507) admitted the
 * bare copulas "for labelled angle and arc references alike" and generalised in one step; that was never
 * wrong for angles and never right for arcs, because what a copula between two of them MEANS differs.
 * Accepting a sentence that means something else teaches it, which is what
 * [ADR-W-030](../../docs/06w-decisions-workspace.md#adr-w-030) forbids.
 *
 * ## The row that matters most is the LAST block
 *
 * A refusal that teaches a spelling must DRIVE that spelling. #1156 shipped a remedy that returned the
 * same refusal, and the lesson is that the taught sentence is a claim like any other. So the taught form
 * here is composed from the refusal's OWN labels and pushed back through the real parser — never written
 * out by hand beside the message, which would pass while the two drifted apart.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { useGeoStore, replay } from '@/store/geoStore';

function ctxOf() {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return buildParseCtx(d.construction, d.positions);
}

/** «מעגל O» with C, D, E on it, plus a triangle so the angle rows have vertices. */
function circleFigure() {
  const st = useGeoStore.getState();
  st.clear();
  for (const u of ['מעגל O', 'C על המעגל O', 'D על המעגל O', 'E על המעגל O', 'משולש ABF']) {
    const r = parse(u, ctxOf());
    expect(r.ok, `setup «${u}»`).toBe(true);
    if (!r.ok) return;
    for (const c of r.commands) st.execute(c, u, `g-${u}`);
  }
}

const read = (utterance: string) => {
  circleFigure();
  return parse(utterance, ctxOf());
};

/** The commands a line lowers to, as a comparable string. */
const shapeOf = (utterance: string) => {
  const r = read(utterance);
  return r.ok ? r.commands.map((c) => c.type).join('+') : `REFUSED:${r.reason}`;
};

describe('#1000 — the canonical spellings are untouched', () => {
  it.each([
    'קשת CD שווה לקשת DE',
    'קשת CD = קשת DE',
    'arc CD equals arc DE',
    'arc CD is equal to arc DE',
  ])('«%s» still states equal arcs', (utterance) => {
    expect(shapeOf(utterance)).toBe('set-angle-ratio');
  });
});

describe('#1000 — the bare copula is refused, and the refusal knows the arcs', () => {
  it.each([
    'קשת CD היא קשת DE',
    'קשת CD הוא קשת DE',
    'קשת CD שווה קשת DE',
    'arc CD is arc DE',
  ])('«%s» is refused as arc-copula, naming CD and DE', (utterance) => {
    const r = read(utterance);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('arc-copula');
    if (r.reason !== 'arc-copula') return;
    expect([r.a, r.b]).toEqual(['CD', 'DE']);
  });

  /**
   * It must not fall to `not-handled`, which is the LLM escalation seam: sending a form the tool
   * deliberately declines to a paid model asks it to accept the very spelling the ruling rejected
   * (the #957 lesson).
   */
  it.each(['קשת CD היא קשת DE', 'arc CD is arc DE'])('«%s» does NOT escalate', (utterance) => {
    const r = read(utterance);
    expect(r.ok === false && r.reason === 'not-handled').toBe(false);
  });
});

/**
 * THE TAUGHT SENTENCE IS DRIVEN (#1156's lesson).
 *
 * Composed from the refusal's own labels — the same two the message interpolates — and pushed back
 * through the real parser. A remedy that returns the same refusal is worse than no remedy.
 */
describe('#1000 — what the refusal teaches actually works', () => {
  it.each([
    'קשת CD היא קשת DE',
    'קשת CD הוא קשת DE',
    'קשת CD שווה קשת DE',
    'arc CD is arc DE',
  ])('the form offered for «%s» parses and states equal arcs', (utterance) => {
    const r = read(utterance);
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== 'arc-copula') return;
    const taught = `קשת ${r.a} שווה לקשת ${r.b}`;
    expect(shapeOf(taught), `the taught sentence «${taught}» must build`).toBe('set-angle-ratio');
  });
});

/**
 * WHERE A COPULA CANNOT MEAN IDENTITY, IT IS STILL READ.
 *
 * The ruling is about an ambiguity: «קשת CD היא קשת DE» can be read as *this arc IS that arc*. With a
 * COEFFICIENT that reading is impossible — nothing is identical to twice itself — so the sentence is the
 * comparison it plainly is, and narrowing there would take away a working capability for no reason the
 * operator gave. This is the boundary of the fix, asserted rather than left to be rediscovered.
 */
describe('#1000 — a SCALED arc reference is not identity, so the copula still reads', () => {
  it.each(['קשת CD היא 2 קשת DE', 'arc CD is 2 arc DE'])('«%s» still states the ratio', (utterance) => {
    const r = read(utterance);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.type)).toContain('set-angle-ratio');
  });

  it('and the bare form beside it is still refused — the two differ only by the coefficient', () => {
    expect(shapeOf('קשת CD היא קשת DE')).toBe('REFUSED:arc-copula');
  });
});
/**
 * THE ANGLE ROWS DO NOT MOVE. ADR-507 was ruled for angles and stands there; this narrows the ARC half
 * only. This is the block that would catch an over-wide narrowing, which is the one way this change can
 * take something away that was working.
 */
describe('#1000 — ADR-507 still holds for angles', () => {
  it.each(['זווית ABC היא זווית DEF', 'זווית ABC שווה לזווית DEF'])(
    '«%s» still states equal angles',
    (utterance) => {
      expect(shapeOf(utterance)).toContain('set-angle-ratio');
    },
  );

  /**
   * And the lane that is neither: «זווית ABC היא זווית ישרה» carries no LABEL after the second keyword,
   * so it was never in the copula seam. Measured `not-handled` before and after — asserted so a later
   * widening of this fix cannot quietly claim it.
   */
  it('«זווית ABC היא זווית ישרה» keeps its own lane, untouched', () => {
    expect(shapeOf('זווית ABC היא זווית ישרה')).toBe('REFUSED:not-handled');
  });
});
