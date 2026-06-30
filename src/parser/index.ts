/** Public surface of the grammar parser (Phase 4). The `utterance → command[]` boundary. */

export { parse, parseRename, parseMerge, parseSwap, droppedNewLabels } from './parse';
export type { ParseResult } from './parse';
export { classifyOutOfScope } from './scope';
export type { ScopeCategory, ScopeMatch } from './scope';
export { COMMAND_CATALOG, CATEGORY_ORDER, CATEGORY_LABELS } from './catalog';
export type { CommandDoc, Category } from './catalog';
