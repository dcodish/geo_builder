/**
 * The step-row CONTENT — which of the three renderers a fact's own text goes through (#900,
 * [ADR-3D-216](docs/06b-decisions-3d.md#adr-3d-216)).
 *
 * It lived inline in `App3.tsx`'s JSX, which is exactly why it was wrong for a year: the decision was
 * a ternary inside a `rows={facts.map(...)}` callback, invisible to every test. `vecmath.test.tsx`
 * could assert what `isVectorFact3` RETURNS and could not assert what the row DID with it, so the
 * routing defect — a coordinate power echoed as a literal `^` — was reachable with the whole suite
 * green. Being a component makes the routing assertable, the `symbols3.ts` lesson applied to a render.
 *
 * THE RULE, and it is two questions rather than one:
 *
 *   DECORATION is fact-KIND-gated. `VecMath` adds arrows and vector pairs, and #313 is right that a
 *   prose row naming a segment must never gain one — an arrow asserts a vector-ness the statement
 *   never had. `isVectorFact3` is the correct gate FOR THAT.
 *
 *   STRUCTURE is CONTENT-gated. Rendering `p^2` as p² asserts nothing the student did not write, so
 *   binding it to the same fact-kind gate was the defect: 2-D rendered the notation through
 *   `shell/math` while 3-D showed the caret raw, and after #511 put `²` on the palette the tool was
 *   displaying two spellings it calls byte-identical two different ways.
 *
 * ISOLATE FIRST, then render. `isolateLtrRuns3` puts LRI/PDI at RUN boundaries, and a math token is
 * LTR throughout, so no isolate lands inside one — #482's ordering survives the math path intact.
 * (The VECTOR branch must NOT be pre-isolated: `VecMath`'s tokenizer would see the controls, which is
 * the constraint the B5 docblock in `App3.tsx` states.)
 */
import React from 'react';
import { MathText, hasMath } from '../../shell/math';
import { isolateLtrRuns3, textDir3 } from '../i18n/bidi';
import { factDisplay3, isVectorFact3, vectorNotation } from './notation';
import { isVectorMarked3 } from '../lexicon/marks3';
import { VecMath, tokenizeRow } from './VecMath';

/** The structural shape a row needs — matching `isVectorFact3`, so a test may pass a literal. */
export type FactRowFact3 = {
  utterance: string;
  cmds: { type: string; claim?: { type: string } }[];
};

/**
 * The row's BASE DIRECTION, from the same source text the renderer above receives (#934,
 * [ADR-3D-228](docs/06b-decisions-3d.md#adr-3d-228)).
 *
 * It lives here, beside the routing, for the reason the docblock above gives about the routing
 * itself: a `dir` written inline in `App3.tsx`'s `rows={facts.map(...)}` callback is a decision no
 * test can reach, and that is exactly how `dir="auto"` survived on this row while three docblocks in
 * this repo said never to use it. `dir="auto"` keys off the FIRST STRONG character, so every fact
 * that opens with a Latin point label — «K על AA'…», «E אמצע AB», «∠BAS = 40» — took an LTR base and
 * the Hebrew words between the isolated technical runs were reordered against each other: the row
 * said «K כך ש AA' על …» for a student who typed «K על AA' כך ש…».
 *
 * `textDir3` is the shared content seam (any Hebrew letter ⇒ RTL) that 2-D's box and the shared
 * `InputArea` preview already use. The source text must be the SAME string the renderer gets, or the
 * container and its content can disagree about what the row is.
 */
export function factRowDir3(f: FactRowFact3, vecNames: Set<string>): 'rtl' | 'ltr' {
  return textDir3(factRowText3(f, vecNames));
}

/**
 * The row's STATEMENT TEXT — what the shared `FactList` receives as `FactRow.text` and derives the
 * row's direction from with `textDir3` (#1401, [ADR-W-088](docs/06w-decisions-workspace.md#adr-w-088)).
 * The direction decision moved into the chrome; which string it is decided FROM stays here, beside
 * the renderer, for the reason above — it must be the string `FactRowText3` renders.
 */
export function factRowText3(f: FactRowFact3, vecNames: Set<string>): string {
  return factDisplay3(f, vecNames);
}

export function FactRowText3({ f, vecNames }: { f: FactRowFact3; vecNames: Set<string> }): React.ReactElement {
  if (isVectorFact3(f)) return <VecMath text={factDisplay3(f, vecNames)} vecNames={vecNames} />;
  if (hasMath(f.utterance)) return <MathText text={isolateLtrRuns3(f.utterance)} />;
  return <>{isolateLtrRuns3(f.utterance)}</>;
}

/**
 * The INPUT PREVIEW's content — the same three renderers, chosen from raw text instead of a fact
 * (#1312, [ADR-3D-255](docs/06b-decisions-3d.md#adr-3d-255) Am. 1).
 *
 * It lives here, beside `FactRowText3`, for the reason this file's opening docblock gives about the
 * row: #1195 wrote this decision as a ternary inside `App3.tsx`'s `preview={(s) => …}` callback, and
 * it was wrong in a way no test could see. The preview returned a STRING where the row returns a
 * node, so `U+20D7` — which `VecMath` treats as an internal marker and REPLACES with a stretchy
 * `mover` spanning the pair — reached the DOM as a literal combining mark and attached to the single
 * preceding letter. The arrow sat over `B` in `AB⃗`. The #1195 lock compared the preview string
 * against `factDisplay3`, which is the half that was already right.
 *
 * Two things differ from the row, both necessarily:
 *
 *   THE PREDICATE. A preview runs on text that has not been parsed, so there is no fact to ask
 *   `isVectorFact3` about; the gate is `isVectorMarked3` — what the student explicitly wrote. The
 *   gate is still the CALLER's job either way: `VecMath`'s `PAIR` regex matches a bare `AB` with no
 *   mark required, so handing it an unmarked line would arrow «אורך AB = 5» — the honesty case.
 *
 *   THE ISOLATION. The vector branch passes text that has NOT been isolated, per this file's opening
 *   note: `VecMath`'s tokenizer would otherwise read LRI/PDI as `op` tokens (measured — «וקטור AB = 5»
 *   isolated first tokenizes as `op ⁦ · pair AB · … · op ⁩`). `VecMath` isolates at the render event
 *   itself (ADR-3D-184), so the vector branch must hand it raw text and let it do that.
 *
 * `null` when nothing changes, so the box grows no empty second row — but that test is now about the
 * RENDERING rather than the string; see the note on the vector branch below.
 */
export function inputPreviewNode3(text: string, vecNames: Set<string>): React.ReactElement | null {
  // #1152 — a line carrying an equation is typeset, and this stays FIRST (see #1313, which owns the
  // divergence that leaves: the step row puts the VECTOR branch first, and a line that is both is
  // rendered lossily by either renderer. Ordering is left exactly as each surface already had it.)
  if (hasMath(text)) return <MathText text={isolateLtrRuns3(text, true)} />;
  /**
   * #1312 — THE NULL CONTRACT DOES NOT APPLY TO A LINE `VecMath` WILL TYPESET.
   *
   * #1195 returned `null` for `DC⃗=3AB⃗` on the rule *"the box already shows this"*. That was true
   * while the preview was a STRING — preview and box would have been the same characters. It is false
   * now: the box is a plain `<input>` and can only ever show `U+20D7` as a combining mark over the
   * single preceding letter, while this preview renders the `mover` that spans the pair. Staying
   * silent there leaves the student looking at the malformed arrow with nothing to correct it, which
   * is the operator's original ask verbatim — *"the text should show like in the input box with the
   * arrow above the vector"*.
   *
   * So the test is whether the RENDERING differs from the characters, not whether the string does:
   * preview exactly when `VecMath` will build structure, and otherwise fall through to the plain
   * branch, whose null rule is still right because there preview and box really are the same text.
   */
  if (isVectorMarked3(text)) {
    const shown = vectorNotation(text, vecNames);
    if (typesetsAsVector(shown, vecNames)) return <VecMath text={shown} vecNames={vecNames} />;
  }
  const iso = isolateLtrRuns3(text, true);
  return iso === text ? null : <>{iso}</>;
}

/** True when `VecMath` will emit MathML for this text rather than passing it through as prose —
 *  its own internal test, called rather than reproduced ([ADR-W-053](docs/06w-decisions-workspace.md)). */
function typesetsAsVector(text: string, vecNames: Set<string>): boolean {
  return tokenizeRow(text, vecNames).some((t) => t.k === 'pair' || t.k === 'vec' || t.k === 'frac');
}
