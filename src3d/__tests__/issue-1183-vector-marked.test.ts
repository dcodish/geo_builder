/**
 * #1183 — THE VECTOR READING OF «XY = k·ZW» IS REACHABLE, AND THE MESSAGE TEACHES A KEY THAT WORKS.
 *
 * The operator, quoting the tool back at it:
 *
 * > לא ברור אם הכוונה לווקטור או לאורך — כתבו |DC| = 3|AB| אם התכוונתם לאורכים, או DC⃗ = 3AB⃗ אם
 * > התכוונתם לווקטורים
 * >
 * > *"how would i write that a vector is really 3 times another vector (not only size)"*
 *
 * **They could not.** Every vector spelling — including the one that message tells them to type —
 * returned that same message. The tool asked a question, offered two answers, and rejected one of
 * them with the question. The ask (#1156 / ADR-3D-249) was right; it was unanswerable, because the
 * answer was indistinguishable from the question:
 *
 * ```
 * AA'=3BC   AA'⃗ = 3BC⃗   AA'→ = 3BC→   וקטור AA' = 3 וקטור BC
 *   → all four lowered to the BYTE-IDENTICAL command, so apply could not tell them apart
 * ```
 *
 * `markVectorContext` set `VEC_MARKED` from the arrow, used it to choose the vector lane over the
 * length lane, and then threw it away. docs/17's *capability bound to a code path rather than to the
 * concept*: a real fact about the utterance living only inside one parse-time variable.
 *
 * ## Three arms, because two of them alone still leave the student accused
 *
 * 1. the marking travels on the command (`marked`);
 * 2. the ambiguity guard declines to ask someone who already answered;
 * 3. a VECTOR EQUATION DRIVES a figure with free dims. Without this the student's very next attempt —
 *    «נסמן: AB = u» then «DC = 3u», satisfiable on any trapezoid — came back `claim-refuted`, the
 *    same ADR-052 sin #1156 fixed for the pair form, one spelling over.
 *
 * ## What this file will not let happen again
 *
 * The #1156 lock asserted the ask fires and that `|AA'|=3|BC|` builds — it contains no `⃗` and no `→`
 * anywhere, so the half that WORKS was locked and the half the tool ADVERTISES was not. So the
 * remedy here is read OUT OF THE MESSAGE and driven, rather than hardcoded beside it: change the
 * message to teach a different key and this file drives that key instead. A taught remedy is a
 * hypothesis until something types it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { SYMBOL_PALETTE_3 } from '../ui/symbols3';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

const st = () => useGeo3.getState();
const build = (lines: string[]) => {
  lines.forEach((l) => st().submit(l));
  return { err: st().lastError, facts: st().facts.length };
};

/** The vector between two points, at the session's current seed. */
const vec = (a: string, b: string) => {
  const pos = derive3(st().facts, st().seed).positions;
  const P = pos.get(a)!;
  const Q = pos.get(b)!;
  return { x: Q.x - P.x, y: Q.y - P.y, z: Q.z - P.z };
};

/**
 * THE MARKER THE MESSAGE ACTUALLY TEACHES, pulled out of the locale string.
 *
 * `err.ambiguousVectorLength` names the vector spelling as `AB<marker> = CD<marker>`; the marker is
 * whatever character sits between the pair and the `=`. Extracted rather than assumed, so this file
 * tests the CURRENT remedy — #1185 moved it from `⃗` to `→` and this needed no edit.
 */
const taughtMarker = (msg: string): string => {
  const m = msg.match(/AB(\S+?)\s*=\s*CD/u);
  if (!m) throw new Error(`the message no longer spells the vector remedy as «AB… = CD…»: ${msg}`);
  return m[1];
};

beforeEach(() => {
  st().clear();
});

describe('#1183 — the taught vector spelling is reachable', () => {
  const MARKERS = ['⃗', '→', '⟶'];

  /** Every spelling that MARKS the statement as a vector one. The bare form is deliberately absent. */
  const MARKED: [string, string][] = [
    ...MARKERS.map((m): [string, string] => [`with ${JSON.stringify(m)}`, `DC${m} = 3AB${m}`]),
    ['with the Hebrew word', 'וקטור DC = 3 וקטור AB'],
    ['with the English word', 'vector DC = 3 vector AB'],
  ];

  it.each(MARKED)('a statement marked %s carries the marking onto the command', (_label, line) => {
    const r = parse3(line);
    expect(r.ok, line).toBe(true);
    if (!r.ok) return;
    const cmd = r.commands.find((c) => c.type === 'vec-rel');
    expect(cmd, `${line} must lower to a vec-rel`).toBeDefined();
    expect(
      cmd && 'marked' in cmd ? cmd.marked : undefined,
      `${line} states a VECTOR explicitly — apply cannot honour what the parser discards`,
    ).toBe(true);
  });

  it.each(MARKED)('a statement marked %s BUILDS on the operator’s own figure', (_label, line) => {
    const { err } = build(['טרפז ABCD', line]);
    expect(err, `${line} was answered with the very question it answers`).toBeNull();
  });

  /**
   * #773's PROPERTY, which the `marked` bit made visible: a missing space at a Hebrew↔Latin boundary
   * is INVISIBLE to a student in an RTL box, so the glued spelling must mean what the spaced one does.
   *
   * `normalize3` already splits that boundary, and its own comment says it must happen before the
   * vector word can be read — but the marking was taken off the RAW utterance, upstream of the split,
   * so «וקטורSE» quietly lost its vector meaning while «וקטור SE» kept it. Caught by the catalog-wide
   * despacing property in `script-boundary-773.test.ts`, which is that test working as designed.
   */
  it('a GLUED vector word marks the statement exactly as the spaced one does', () => {
    const spaced = parse3('וקטור DC = 3 וקטור AB');
    const glued = parse3('וקטורDC = 3 וקטורAB');
    expect(glued.ok).toBe(true);
    expect(spaced.ok).toBe(true);
    if (!glued.ok || !spaced.ok) return;
    expect(glued.commands, 'a boundary the student cannot see must not change the meaning').toEqual(
      spaced.commands,
    );
  });

  /**
   * THE TRIPWIRE. #1156's ruling — an UNMARKED `XY = k·ZW` has two readings and the tool refuses
   * rather than picks (#748), asking which was meant — must be untouched. If this moves, the fix has
   * drifted into the routing option round #1169 escalated on, and that is an escalation, not an
   * adjustment.
   */
  it('an UNMARKED statement still ASKS — #748 and ADR-3D-249 stand', () => {
    const { err } = build(['תיבה', "AA'=3BC"]);
    expect(err).toEqual({ code: 'ambiguous-vector-length', a1: 'A', b1: "A'", a2: 'B', b2: 'C', c: 3 });
  });

  it('the LENGTH half the message offers still builds', () => {
    const { err } = build(['תיבה', "|AA'|=3|BC|"]);
    expect(err).toBeNull();
  });

  /**
   * THE HONESTY ARM. Reaching the vector lane must not mean being believed: between two
   * PERPENDICULAR edges of a box the vector statement is genuinely impossible, and the recorded claim
   * — kept alongside the drive, the ADR-3D-030 pattern — is what still refuses it.
   */
  it('a marked statement that CANNOT hold is still refused', () => {
    const { err } = build(['תיבה', "AA'→ = 3BC→"]);
    expect(err).toEqual({ code: 'claim-refuted' });
  });

  it('a marked statement that DOES hold on a box builds', () => {
    const { err } = build(['תיבה', "AA'→ = BB'→"]);
    expect(err).toBeNull();
  });
});

/**
 * THE MESSAGE IS DRIVEN, NOT READ. #1156 shipped a remedy nobody typed; #1183 is the bill for that.
 * Both locales, because a student on either one is told to type it.
 */
describe('#1183 — the remedy the message teaches is one the tool accepts', () => {
  it.each([
    ['he', he.err.ambiguousVectorLength],
    ['en', en.err.ambiguousVectorLength],
  ])('the vector spelling taught in %s BUILDS', (_loc, msg) => {
    const marker = taughtMarker(msg);
    const { err } = build(['טרפז ABCD', `DC${marker} = 3AB${marker}`]);
    expect(err, `the message teaches ${JSON.stringify(marker)} and the tool refuses it`).toBeNull();
  });

  it('both locales teach the SAME character, and it is the one the palette inserts', () => {
    const marker = taughtMarker(he.err.ambiguousVectorLength);
    expect(taughtMarker(en.err.ambiguousVectorLength), 'one remedy, not two').toBe(marker);
    const inserts = SYMBOL_PALETTE_3.map(([, insert]) => insert);
    expect(
      inserts,
      'the arrow is offered precisely because an Israeli keyboard cannot produce it — a message that ' +
        'teaches a character the palette does not offer is a dead end (#1185)',
    ).toContain(marker);
  });

  /** #1185's own half: the character the palette inserts must reach the vector lane when typed. */
  it('the character the palette inserts MARKS a statement as a vector one', () => {
    const inserts = SYMBOL_PALETTE_3.map(([, insert]) => insert);
    const arrow = inserts.find((i) => /^[→⃗⟶]$/u.test(i));
    expect(arrow, 'the palette must still offer a vector arrow').toBeDefined();
    const r = parse3(`DC${arrow} = 3AB${arrow}`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const cmd = r.commands.find((c) => c.type === 'vec-rel');
      expect(cmd && 'marked' in cmd ? cmd.marked : undefined).toBe(true);
    }
  });
});

/**
 * ARM 3 — A VECTOR EQUATION IS A GIVEN ON A FREE FIGURE, whichever spelling states it.
 *
 * The named-vector detour was the student's next move after the arrow was refused, and it traded the
 * loop for a false accusation. A bare trapezoid has free dims and `DC = 3AB` is satisfiable on it.
 */
describe('#1183 — a vector equation DRIVES rather than being checked against a sample', () => {
  it('«נסמן: AB = u» then «DC = 3u» builds instead of refuting', () => {
    const { err } = build(['טרפז ABCD', 'נסמן: AB = u', 'DC = 3u']);
    expect(err, 'a satisfiable given refuted against self-sampled proportions is ADR-052’s sin').toBeNull();
  });

  /**
   * THE FIGURE, NOT THE VERDICT. A green "no error" only says nothing refused; the deliverable is that
   * the drawing the student is looking at actually satisfies what they stated — at EVERY configuration,
   * since «הציגו תצורה אחרת» moves it.
   */
  it.each([
    ['the named-vector spelling', ['טרפז ABCD', 'נסמן: AB = u', 'DC = 3u']],
    ['the marked-pair spelling', ['טרפז ABCD', 'DC→ = 3AB→']],
  ])('%s produces a figure where DC really is 3·AB, at every seed', (_label, lines) => {
    build(lines as string[]);
    expect(st().lastError).toBeNull();
    for (let seed = 0; seed < 4; seed++) {
      useGeo3.setState({ seed });
      const dc = vec('D', 'C');
      const ab = vec('A', 'B');
      const residual = Math.hypot(dc.x - 3 * ab.x, dc.y - 3 * ab.y, dc.z - 3 * ab.z);
      expect(residual, `seed ${seed}: the canvas must not show a figure that contradicts the given`).toBeLessThan(1e-6);
      // and not the degenerate escape of collapsing both to zero
      expect(Math.hypot(ab.x, ab.y, ab.z), `seed ${seed}: AB must not collapse`).toBeGreaterThan(1e-3);
    }
  });
});
