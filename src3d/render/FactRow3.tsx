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
import { isolateLtrRuns3 } from '../i18n/bidi';
import { factDisplay3, isVectorFact3 } from './notation';
import { VecMath } from './VecMath';

/** The structural shape a row needs — matching `isVectorFact3`, so a test may pass a literal. */
export type FactRowFact3 = {
  utterance: string;
  cmds: { type: string; claim?: { type: string } }[];
};

export function FactRowText3({ f, vecNames }: { f: FactRowFact3; vecNames: Set<string> }): React.ReactElement {
  if (isVectorFact3(f)) return <VecMath text={factDisplay3(f, vecNames)} vecNames={vecNames} />;
  if (hasMath(f.utterance)) return <MathText text={isolateLtrRuns3(f.utterance)} />;
  return <>{isolateLtrRuns3(f.utterance)}</>;
}
