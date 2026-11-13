// Exports the 2-D scenario corpus (src/__tests__/scenarios-corpus-{1..4}.ts) as perf items for perf2d.ts (#2867):
// a string step → a submit; an {llm:[…]} step → a submit whose deterministic lane is measured and whose commands are
// FOLLOWED when it does not commit. Scenarios with an edit/delete step are skipped (counted in the console line).
//
// Run by `node scripts/perf/2d/driver.mjs` (its build step). Direct use, from the repo root:
//   node node_modules/vite-node/vite-node.mjs --mode production -c scripts/perf/2d/vite.scenarios.config.mjs scripts/perf/2d/scenarios-export.ts -- [--out <dir>]
// Writes <out>/scenarios.json (default reports/perf/2d/scenarios.json). A few seconds. No timing, no LLM: it only
// reads the corpus arrays — `vitest` is aliased to vitest-stub.ts by the config because the corpus files import
// `expect` at module level.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS_1 } from '@/__tests__/scenarios-corpus-1';
import { SCENARIOS_2 } from '@/__tests__/scenarios-corpus-2';
import { SCENARIOS_3 } from '@/__tests__/scenarios-corpus-3';
import { SCENARIOS_4 } from '@/__tests__/scenarios-corpus-4';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.indexOf('--out') >= 0 ? argv[argv.indexOf('--out') + 1] : path.join(REPO, 'reports', 'perf', '2d'));
const all = [...SCENARIOS_1, ...SCENARIOS_2, ...SCENARIOS_3, ...SCENARIOS_4];
const items: any[] = [];
let skippedEdit = 0;
for (const sc of all) {
  const steps: any[] = [];
  let ok = true;
  for (const st of sc.steps as any[]) {
    if (typeof st === 'string') steps.push({ k: 'submit', u: st, locale: /[֐-׿]/.test(st) ? 'he' : 'en' });
    else if (st && 'llm' in st) {
      // canonical strings are re-parsed at run time by the deterministic lane itself; commands are followed
      const lines = st.llm as any[];
      if (lines.every((l) => typeof l === 'string')) for (const l of lines) steps.push({ k: 'submit', u: l, locale: /[֐-׿]/.test(l) ? 'he' : 'en' });
      else steps.push({ k: 'submit', u: '(llm step)', locale: 'he', follow: lines });
    } else {
      ok = false;
      skippedEdit++;
      break;
    }
  }
  if (!ok || !steps.length) continue;
  steps.push({ k: 'presses', n: 6 }, { k: 'load' }, { k: 'delete' }, { k: 'detect' });
  items.push({ id: `scenario:${sc.id}`, source: 'scenario', ref: sc.id, steps });
}
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'scenarios.json'), JSON.stringify(items));
console.log('scenarios', all.length, 'exported', items.length, 'skipped (edit steps)', skippedEdit);
process.exit(0);
