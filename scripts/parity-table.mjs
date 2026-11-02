#!/usr/bin/env node
/**
 * THE CROSS-BUILDER PARITY TABLE (#2654 idea 2, ADR-W-170) — the sentence × builder view of the shared
 * parity rows, `shell/__tests__/fixtures/geo-input-parity.ts`. The rows are the source of truth and the
 * thin locks hold them; this script only reads them, so it can never disagree with what the tests assert.
 *
 * Every (row, builder) pair is one CELL:
 *   agrees       the builder is held to the row's verdict (builds / refused / asks / not-handled)
 *   scheduled    a known gap whose port an open issue owns (#N)
 *   unscheduled  a known gap with no issue: the table is its record; port rounds pick these up
 *   parked       a known gap whose issue was closed or iceboxed as a decision not to port (ADR-W-119)
 *   exception    an EXCEPTIONS family this builder must refuse honestly (Xn)
 *   unchecked    the row does not involve this builder (another family's spelling, `only`)
 *
 * Usage:
 *   npm run parity-table                         counts, then every gap cell grouped by builder and state
 *   npm run parity-table -- --all                the full sentence × builder table (Markdown)
 *   npm run parity-table -- --product analytic --state unscheduled
 *                                                one builder's cells of one state (a port round's pick list)
 *   npm run parity-table -- --html               writes reports/parity-table.html (filterable)
 *   npm run parity-table -- --json               counts and cells as JSON
 *
 * Node ≥ 22.18 / 23.6 imports the .ts fixture directly (type stripping); the fixture uses erasable syntax only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = resolve(ROOT, 'shell/__tests__/fixtures/geo-input-parity.ts');

export const STATES = ['agrees', 'scheduled', 'unscheduled', 'parked', 'exception', 'unchecked'];

/**
 * Every cell of the table. `fx` is the fixture module (PARITY_ROWS, PRODUCTS, EXCEPTIONS, roleOf, gapState),
 * passed in so a test can hand it synthetic rows.
 */
export function parityCells(fx, rows = fx.PARITY_ROWS) {
  return rows.map((row) => ({
    id: row.id,
    family: row.family,
    sentence: row.steps[row.steps.length - 1],
    context: row.steps.slice(0, -1),
    expect: row.expect,
    exception: row.exception ?? null,
    note: row.note ?? null,
    cells: Object.fromEntries(fx.PRODUCTS.map((p) => [p, cellOf(fx, row, p)])),
  }));
}

function cellOf(fx, row, product) {
  const role = fx.roleOf(row, product);
  if (role === 'gap') {
    const g = row.knownGap.find((k) => k.product === product);
    return { state: fx.gapState(g), issue: g.issue ?? null };
  }
  if (role === 'expected') return { state: 'agrees', verdict: row.expect };
  if (role === 'must-refuse') return { state: 'exception', exception: row.exception };
  return { state: 'unchecked' };
}

/** Counts per builder and in total, every state present (zeros included). */
export function countCells(table, products) {
  const zero = () => Object.fromEntries(STATES.map((s) => [s, 0]));
  const by = Object.fromEntries(products.map((p) => [p, zero()]));
  const total = zero();
  for (const r of table) for (const p of products) {
    by[p][r.cells[p].state]++;
    total[r.cells[p].state]++;
  }
  return { rows: table.length, byProduct: by, total };
}

/** The text of one cell. */
export function cellText(c, row) {
  switch (c.state) {
    case 'agrees': return row?.exception ? `${c.verdict} · ${row.exception}` : c.verdict;
    case 'scheduled': return `gap · scheduled ${c.issue}`;
    case 'unscheduled': return 'gap · unscheduled';
    case 'parked': return `gap · parked ${c.issue}`;
    case 'exception': return `refuses · ${c.exception}`;
    default: return '—';
  }
}

const md = (s) => String(s).replace(/\|/g, '\\|');

export function renderCounts(counts, products) {
  const lines = [`Parity table: ${counts.rows} rows × ${products.length} builders = ${counts.rows * products.length} cells`, ''];
  lines.push(`| state | ${products.join(' | ')} | total |`, `|---|${products.map(() => '---:').join('|')}|---:|`);
  for (const s of STATES) lines.push(`| ${s} | ${products.map((p) => counts.byProduct[p][s]).join(' | ')} | ${counts.total[s]} |`);
  return lines.join('\n');
}

export function renderMarkdown(table, products, { all = false, product = null, state = null } = {}) {
  const want = (r) => products.some((p) => (!product || p === product) && (!state || r.cells[p].state === state));
  const shown = table.filter((r) => all || state || product ? want(r) : products.some((p) => r.cells[p].state === 'scheduled' || r.cells[p].state === 'unscheduled' || r.cells[p].state === 'parked'));
  const cols = product ? [product] : products;
  const head = [`| row | sentence | ${cols.join(' | ')} |`, `|---|---|${cols.map(() => '---').join('|')}|`];
  const body = shown.map((r) => `| ${md(r.id)} | ${md([...r.context, r.sentence].join(' · '))} | ${cols.map((p) => md(cellText(r.cells[p], r))).join(' | ')} |`);
  return [...head, ...body].join('\n');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderHtml(table, products, counts, stamp) {
  const rows = table.map((r) => `<tr data-states="${products.map((p) => `${p}:${r.cells[p].state}`).join(' ')}"><td class="id">${esc(r.id)}</td><td class="fam">${esc(r.family)}</td><td dir="auto">${r.context.length ? `<span class="ctx">${esc(r.context.join(' · '))} · </span>` : ''}${esc(r.sentence)}</td>${products.map((p) => `<td class="c ${r.cells[p].state}">${esc(cellText(r.cells[p], r))}</td>`).join('')}</tr>`).join('\n');
  const countRows = STATES.map((s) => `<tr><th>${s}</th>${products.map((p) => `<td>${counts.byProduct[p][s]}</td>`).join('')}<td><b>${counts.total[s]}</b></td></tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Parity Table</title>
<style>
:root{--bg:#fbfbfa;--fg:#1d1d1b;--muted:#6b6b66;--line:#e2e2dd;--agree:#e7f3ea;--sched:#fff1d6;--unsched:#fde2e1;--parked:#ececea;--exc:#e6eefb}
@media (prefers-color-scheme:dark){:root{--bg:#18181a;--fg:#ececea;--muted:#9a9a95;--line:#33332f;--agree:#1f3326;--sched:#3d321a;--unsched:#46201f;--parked:#2a2a28;--exc:#1d2a40}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:20px;margin:0 0 4px}p{color:var(--muted);margin:0 0 12px}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--line);padding:4px 8px;text-align:start;vertical-align:top}
.counts{width:auto;margin-bottom:16px}.counts td{text-align:end;font-variant-numeric:tabular-nums}
.id,.fam,.ctx{color:var(--muted)}.id{font-family:ui-monospace,monospace;font-size:12px}
.c{white-space:nowrap}.agrees{background:var(--agree)}.scheduled{background:var(--sched)}.unscheduled{background:var(--unsched)}.parked{background:var(--parked)}.exception{background:var(--exc)}
.wrap{overflow-x:auto}label{margin-inline-end:12px}select{font:inherit}
</style></head><body>
<h1>Parity table</h1>
<p>Sentence × builder, generated from <code>shell/__tests__/fixtures/geo-input-parity.ts</code> (${esc(stamp)}). A gap is a cell, not an issue (ADR-W-170).</p>
<div class="wrap"><table class="counts"><tr><th>state</th>${products.map((p) => `<th>${p}</th>`).join('')}<th>total</th></tr>${countRows}</table></div>
<label>Builder <select id="p"><option value="">any</option>${products.map((p) => `<option>${p}</option>`).join('')}</select></label>
<label>State <select id="s"><option value="">any</option>${STATES.map((s) => `<option>${s}</option>`).join('')}</select></label>
<div class="wrap"><table><thead><tr><th>row</th><th>family</th><th>sentence</th>${products.map((p) => `<th>${p}</th>`).join('')}</tr></thead><tbody id="t">
${rows}
</tbody></table></div>
<script>
const p=document.getElementById('p'),s=document.getElementById('s');
function f(){const pv=p.value,sv=s.value;for(const tr of document.getElementById('t').rows){const st=tr.dataset.states.split(' ');tr.hidden=!st.some(x=>{const[a,b]=x.split(':');return(!pv||a===pv)&&(!sv||b===sv)})}}
p.onchange=s.onchange=f;
</script>
</body></html>
`;
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] ?? null : null;
}

async function main(argv) {
  const fx = await import(pathToFileURL(FIXTURE).href);
  const products = fx.PRODUCTS;
  const table = parityCells(fx);
  const counts = countCells(table, products);
  const product = arg(argv, '--product');
  const state = arg(argv, '--state');
  if (product && !products.includes(product)) throw new Error(`--product must be one of ${products.join(', ')}`);
  if (state && !STATES.includes(state)) throw new Error(`--state must be one of ${STATES.join(', ')}`);
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ counts, table }, null, 2) + '\n');
    return;
  }
  if (argv.includes('--html')) {
    const out = resolve(ROOT, 'reports/parity-table.html');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderHtml(table, products, counts, new Date().toISOString().slice(0, 10)));
    console.log(renderCounts(counts, products));
    console.log(`\nwrote ${out}`);
    return;
  }
  console.log(renderCounts(counts, products));
  console.log('');
  console.log(renderMarkdown(table, products, { all: argv.includes('--all'), product, state }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
