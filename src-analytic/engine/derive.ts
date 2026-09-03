/**
 * Lines → figure, in one place.
 *
 * The composition `parse → fold → evaluate` is the product's whole derivation, and it is written
 * once so that the app, the tests and (later) the save/load path all take the same route. A line
 * that fails is reported with its own index and its own words — never dropped, and never blamed on
 * a different line (the honesty invariant: an error message names the conflicting STATEMENT).
 */
import { fold, type ApplyError } from './apply';
import { evaluate, viewBox, type Figure } from './evaluate';
import type { Box } from './curves';
import { parseLine, type ParseFailure } from '../parser/parseAnalytic';
import { EMPTY_CONSTRUCTION, type Construction, type Fact } from './types';

/** What went wrong with one line — a parse refusal or an apply refusal, with the line's own text. */
export interface LineFault {
  index: number;
  code: ParseFailure['code'] | ApplyError['code'];
  detail: string;
}

export interface Derivation {
  construction: Construction;
  figure: Figure;
  box: Box;
  /** One entry per failing line. An empty array means every line landed. */
  faults: LineFault[];
}

export function derive(lines: readonly string[], seed = 0): Derivation {
  const facts: Fact[] = [];
  const faults: LineFault[] = [];
  /** Which line produced each fact, so an apply refusal can be blamed on the right one. */
  const owner: number[] = [];

  lines.forEach((line, index) => {
    const r = parseLine(line);
    if (!r.ok) {
      faults.push({ index, code: r.code, detail: r.detail });
      return;
    }
    for (const f of r.facts) {
      facts.push(f);
      owner.push(index);
    }
  });

  const { construction, errors } = fold(facts);
  errors.forEach((e, i) => {
    if (e) faults.push({ index: owner[i], code: e.code, detail: e.detail });
  });

  const figure = evaluate(construction, seed);
  return { construction, figure, box: viewBox(figure), faults };
}

export const EMPTY_DERIVATION: Derivation = {
  construction: EMPTY_CONSTRUCTION,
  figure: { env: {}, points: [], curves: [], vacant: [] },
  box: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  faults: [],
};
