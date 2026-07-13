/** Public surface of the grammar parser (Phase 4). The `utterance → command[]` boundary. */

export { parse, parseRename, parseMerge, parseSwap, parseNameCenter, droppedNewLabels, droppedGivenNumbers, droppedGivenRelations, droppedGivenVerbs, droppedRadiusSymbol, normalizeUtterance } from './parse';
export type { ParseResult, ParseContext } from './parse';
export { buildParseCtx } from './context';
export { classifyOutOfScope, looksCompound } from './scope';
export type { ScopeCategory, ScopeMatch } from './scope';
export { COMMAND_CATALOG, CATEGORY_ORDER, CATEGORY_LABELS } from './catalog';
export type { CommandDoc, Category } from './catalog';
