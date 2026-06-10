/** Public surface of the grammar parser (Phase 4). The `utterance → command[]` boundary. */

export { parse } from './parse';
export type { ParseResult } from './parse';
export { COMMAND_CATALOG } from './catalog';
export type { CommandDoc } from './catalog';
