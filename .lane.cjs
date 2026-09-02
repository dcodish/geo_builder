const fs = require('fs');
const need = (s, a, f) => { if (!s.includes(a)) throw new Error(f + ' missing: ' + a.slice(0, 60)); };

// ---------- 1) the catalog declares the lane
let c = fs.readFileSync('src3d/parser/catalog3.ts', 'utf8');
const iface = `export interface CatalogEntry3 {
  category: string;
  he: string;
  en: string;
}`;
need(c, iface, 'catalog3');
c = c.replace(iface, `export interface CatalogEntry3 {
  category: string;
  he: string;
  en: string;
  /**
   * WHICH READER of the deterministic lane owns this entry (#578, ADR-3D-211).
   *
   * Absent = the construction lane: \`parse3\` lowers it to commands. That is what the LLM is allowed to
   * emit, what the honesty gates are measured against, and what the rule-ordering shadow matrix covers.
   *
   * \`'rewrite'\` = a line that edits the SESSION rather than the figure — a rename, read by
   * \`parseRename3\` before the grammar and never lowered to a command. It belongs in the catalog because
   * the catalog is the coverage map AND the in-app commands panel (2-D omits rename, and the operator
   * could not find it — that is how #578 came to be filed), but teaching it to the LLM would have the
   * model emit a line the re-parse must refuse, burning a paid call on something that can never commit.
   * Every consumer reads THIS field rather than learning about rename separately.
   */
  lane?: 'rewrite';
}`);
c = c.replace(
  "  { category: 'editing', he: 'שנה שם E ל-O', en: 'rename E to O' },\n  { category: 'editing', he: \"החלף A' ב-M\", en: \"relabel A' to M\" },",
  "  { category: 'editing', lane: 'rewrite', he: 'שנה שם E ל-O', en: 'rename E to O' },\n  { category: 'editing', lane: 'rewrite', he: \"החלף A' ב-M\", en: \"relabel A' to M\" },");
fs.writeFileSync('src3d/parser/catalog3.ts', c);

// ---------- 2) the LLM vocabulary is the construction lane only
let l = fs.readFileSync('src3d/parser/llmShared3.ts', 'utf8');
const vocab = "  const vocab = COMMAND_CATALOG_3D.map((c) => `- ${c.en}   |   ${c.he}`).join('\n');";
need(l, vocab, 'llmShared3');
l = l.replace(vocab, `  // #578: only the CONSTRUCTION lane is emittable. A 'rewrite' entry (a rename) is read before the
  // grammar and never lowers to a command, so teaching it here would produce steps the deterministic
  // re-parse must refuse — the PAR-10 contract, and a paid call spent on a line that cannot commit.
  const vocab = COMMAND_CATALOG_3D.filter((c) => c.lane !== 'rewrite')
    .map((c) => \`- \${c.en}   |   \${c.he}\`)
    .join('\n');`);
fs.writeFileSync('src3d/parser/llmShared3.ts', l);

// ---------- 3) the honesty net measures the emittable surface
let h = fs.readFileSync('src3d/parser/__tests__/honesty3.test.ts', 'utf8');
const loop = '  for (const entry of COMMAND_CATALOG_3D) {';
need(h, loop, 'honesty3');
h = h.replace(loop, `  // #578: the gates guard what the LLM can EMIT, which is the construction lane — a 'rewrite' entry
  // never reaches them (it is read before the grammar and lowers to no command at all).
  for (const entry of COMMAND_CATALOG_3D.filter((c) => c.lane !== 'rewrite')) {`);
fs.writeFileSync('src3d/parser/__tests__/honesty3.test.ts', h);

// ---------- 4) the shadow matrix splits on the declared lane, not on a re-derivation
let m = fs.readFileSync('src3d/parser/__tests__/shadow-matrix3.test.ts', 'utf8');
const split = `  const rewrites = all.filter(({ text }) => parseRename3(text) !== null);
  const corpus = all.filter(({ text }) => parseRename3(text) === null);`;
need(m, split, 'shadow-matrix3');
m = m.replace(split, `  const rewrites = all.filter((e) => e.lane === 'rewrite');
  const corpus = all.filter((e) => e.lane !== 'rewrite');`);
m = m.replace(`  const all = COMMAND_CATALOG_3D.flatMap((c) => [
    { text: c.en, lang: 'en' as const },
    { text: c.he, lang: 'he' as const },
  ]);`, `  const all = COMMAND_CATALOG_3D.flatMap((c) => [
    { text: c.en, lang: 'en' as const, lane: c.lane },
    { text: c.he, lang: 'he' as const, lane: c.lane },
  ]);`);
fs.writeFileSync('src3d/parser/__tests__/shadow-matrix3.test.ts', m);

// ---------- 5) the catalog guard checks each entry against ITS lane's reader
let g = fs.readFileSync('src3d/parser/__tests__/catalog3.test.ts', 'utf8');
const und = `const understood = (u: string): boolean => parse3(u).ok || parseRename3(u) !== null;`;
need(g, und, 'catalog3.test');
g = g.replace(und, `const understood = (u: string, lane: CatalogEntry3['lane']): boolean =>
  lane === 'rewrite' ? parseRename3(u) !== null : parse3(u).ok;`);
g = g.replace('expect(understood(entry.he), entry.he).toBe(true);', 'expect(understood(entry.he, entry.lane), entry.he).toBe(true);');
g = g.replace('expect(understood(entry.en), entry.en).toBe(true);', 'expect(understood(entry.en, entry.lane), entry.en).toBe(true);');
g = g.replace("import { COMMAND_CATALOG_3D } from '../catalog3';", "import { COMMAND_CATALOG_3D, type CatalogEntry3 } from '../catalog3';");
g = g.replace(` * #578 (ADR-3D-211): the deterministic lane has TWO readers — \`parse3\`, which lowers a sentence to
 * commands, and \`parseRename3\`, which reads a rewrite of HISTORY (a rename adds no command, so it is
 * intercepted in \`submit\` before the grammar). The guard asks the honest question — "does the
 * deterministic lane understand this line?" — rather than carrying an exception list, so a catalog
 * entry can never be listed for a lane that would not in fact read it.`,
` * #578 (ADR-3D-211): the deterministic lane has TWO readers — \`parse3\`, which lowers a sentence to
 * commands, and \`parseRename3\`, which reads a rewrite of HISTORY (a rename adds no command, so it is
 * intercepted in \`submit\` before the grammar). Each entry DECLARES its reader, and the guard checks it
 * against that one: an OR would let a construction entry pass because the rename reader happened to
 * claim it, which is the shadow class this suite exists to catch.`);
fs.writeFileSync('src3d/parser/__tests__/catalog3.test.ts', g);
console.log('lane declared and threaded');
