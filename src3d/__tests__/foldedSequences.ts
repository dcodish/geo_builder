/**
 * #2739 (ADR-W-191) — the folded case files' sequences. A case file whose figure is already locked by a fixture was
 * deleted; the string-array literals it held are frozen in `folded-sequences.json` (keyed by the deleted file), so
 * every harvest of this folder's arrays (#1394, #1455, #1560) still replays exactly the corpus it did.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.join(__dirname, 'folded-sequences.json');

/** Every frozen sequence, file by file, in source order (duplicates kept, as the harvests keep them). */
export function foldedSequences(): string[][] {
  if (!existsSync(FILE)) return [];
  return Object.values(JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string[][]>).flat();
}
