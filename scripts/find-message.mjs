#!/usr/bin/env node
/**
 * #2201 phase 4 — `npm run find-message -- "<text or key>"`: where does this sentence live?
 *
 * Searches every locale table (2-D, 3-D and shell JSON; the analytic and complex TS tables), the files the
 * inline-Hebrew ratchet still allows, and the 2-D engine's refusal codes, and prints `file · key · value` for every
 * match (case-insensitive substring of the key or the value). The search is `scripts/lib/find-message-core.mjs`.
 */
import { findMessage, formatResult } from './lib/find-message-core.mjs';

const query = process.argv.slice(2).join(' ');
if (!query.trim()) {
  console.error('usage: npm run find-message -- "<text, key or engine code>"');
  process.exit(2);
}
const result = await findMessage(query);
console.log(formatResult(result));
process.exit(result.rows.length + result.codes.length > 0 ? 0 : 1);
