/** Public surface of the grammar parser (Phase 4). The `utterance → command[]` boundary. */

export { parse, parseRename, parseMerge } from './parse';
export type { ParseResult } from './parse';
export { COMMAND_CATALOG, CATEGORY_ORDER, CATEGORY_LABELS } from './catalog';
export type { CommandDoc, Category } from './catalog';
