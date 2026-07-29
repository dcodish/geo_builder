/** Public surface of the grammar parser (Phase 4). The `utterance → command[]` boundary. */

export { parse, parseRename, parseMerge, parseSwap, parseNameCenter, impliedCircleBinding, droppedNewLabels, droppedGivenNumbers, droppedGivenRelations, droppedWordRelations, droppedCompoundRelation, droppedGivenVerbs,
  droppedComparison, droppedRadiusSymbol, droppedRegionSubject, droppedMidsegment, normalizeUtterance } from './parse';
export type { ParseResult, ParseContext } from './parse';
export { buildParseCtx } from './context';
export { classifyOutOfScope, looksCompound, looksLikeLatex, wordRootMagnitude } from './scope';
export type { ScopeCategory, ScopeMatch } from './scope';
export { COMMAND_CATALOG, CATEGORY_ORDER, CATEGORY_LABELS } from './catalog';
export type { CommandDoc, Category } from './catalog';
