/**
 * The management console's HTML (#2868, ADR-W-209). Hebrew, right to left; GitHub's own terms (issue, PR,
 * commit, deploy, label) stay in English (operator, 2026-11-13). Server-rendered strings with plain HTML forms:
 * no script, so the page works on a phone and passes a strict CSP.
 *
 * Two kinds of screen: the console screens that show the state (since, plan, live, backlog, usage, cost) and
 * the working screens where he answers (home: decisions, tests, plans; an issue's own page).
 */
import type { Issue } from './snapshot';
import {
  STATUS_LABEL, kindOf, priorityOf, productOf,
  type NeedsMe, type Pace, type SinceLast, type UnitRow, type WsRow,
} from './sections';
import type { BuilderUsage } from './usage';
import { FAILED_LABEL } from './usage';
import { t } from './text';

export const REPO_URL = 'https://github.com/dcodish/geo_builder';

export interface Frame {
  base: string;
  csrf: string;
  /** `on` writes to GitHub; `dry` shows what it would write; `off` hides the forms. */
  writes: 'on' | 'dry' | 'off';
  flash?: { ok: boolean; text: string } | null;
  asOf: string;
  errors: string[];
  ref: string;
}

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Text that may mix Hebrew and English, isolated so neither direction reorders its neighbour. */
const bdi = (s: unknown) => `<bdi>${esc(s)}</bdi>`;

/** `#123` in plain text → a link to that issue's page in the console. */
export const linkify = (base: string, s: string) => esc(s).replace(/#(\d{2,5})\b/g, `<a href="${base}/issue?n=$1">#$1</a>`);

const he = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', timeZone: 'Asia/Jerusalem' });
const heTime = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
export const fmtDay = (iso: string | null | undefined) => (iso ? he.format(new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso)) : '—');
export const fmtTime = (iso: string | null | undefined) => (iso ? heTime.format(new Date(iso)) : '—');

export function ago(iso: string, now: string): string {
  const m = Math.round((Date.parse(now) - Date.parse(iso)) / 60000);
  if (m < 60) return `${t('render.ago.1')}${Math.max(m, 1)}${t('render.ago.2')}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${t('render.ago.1')}${h}${t('render.ago.3')}`;
  return `${t('render.ago.1')}${Math.round(h / 24)}${t('render.ago.4')}`;
}

const PRODUCT_HE: Record<string, string> = { analytic: `${t('render.PRODUCT_HE.1')}`, '3d': '3-D', '2d': '2-D', complex: `${t('render.PRODUCT_HE.2')}`, server: `${t('render.PRODUCT_HE.3')}`, workspace: 'workspace' };
export const productHe = (p: string | null) => (p ? (PRODUCT_HE[p] ?? p) : '—');

function chips(i: Issue): string {
  const out: string[] = [];
  const pr = priorityOf(i);
  if (pr !== '—') out.push(`<span class="chip ${pr === 'P1' ? 'bad' : pr === 'P2' ? 'warn' : ''}">${pr}</span>`);
  out.push(`<span class="chip">${kindOf(i)}</span>`);
  const p = productOf(i);
  if (p) out.push(`<span class="chip">${esc(productHe(p))}</span>`);
  if (i.labels.includes('wrong-answer')) out.push(`<span class="chip bad" title="wrong-answer">${t('render.chips.1')}</span>`);
  if (i.labels.includes('reported')) out.push(`<span class="chip" title="reported">${t('render.chips.2')}</span>`);
  if (i.labels.includes('needs-operator')) out.push(`<span class="chip warn">${t('render.chips.3')}</span>`);
  if (i.labels.includes('auto-ok')) out.push(`<span class="chip good">${t('render.chips.4')}</span>`);
  if (!i.open) out.push(`<span class="chip">${i.reason === 'not_planned' ? `${t('render.chips.5')}` : `${t('render.chips.6')}`}</span>`);
  return out.join('');
}

export const issueLink = (base: string, i: { n: number; title: string }) =>
  `<a class="num" href="${base}/issue?n=${i.n}">#${i.n}</a> <span class="t">${bdi(i.title)}</span>`;

function issueRow(base: string, i: Issue, extra = ''): string {
  return `<li class="row"><div>${issueLink(base, i)}</div><div class="chips">${chips(i)}${extra}</div></li>`;
}

const ghLink = (n: number, label = 'GitHub ↗') => `<a class="ext" href="${REPO_URL}/issues/${n}" target="_blank" rel="noopener">${label}</a>`;

// ── page frame ───────────────────────────────────────────────────────────────

export const SCREENS: { path: string; label: string; kind: 'work' | 'console' }[] = [
  { path: '', label: `${t('render.SCREENS.1')}`, kind: 'work' },
  { path: '/since', label: `${t('render.SCREENS.2')}`, kind: 'console' },
  { path: '/plan', label: `${t('render.SCREENS.3')}`, kind: 'console' },
  { path: '/live', label: `${t('render.SCREENS.4')}`, kind: 'console' },
  { path: '/backlog', label: 'Backlog', kind: 'console' },
  { path: '/usage', label: `${t('render.SCREENS.5')}`, kind: 'console' },
  { path: '/cost', label: `${t('render.SCREENS.6')}`, kind: 'console' },
];

const CSS = `
:root{--bg:#f5f6f8;--paper:#fff;--fg:#1a2130;--muted:#5b6678;--line:#dce1e8;--soft:#eef1f5;--accent:#2b4c9b;--accent-soft:#e5ebf8;
--bad:#b3261e;--bad-soft:#fbe8e6;--warn:#8a5a00;--warn-soft:#fbf0d9;--good:#1d6b45;--good-soft:#e1f2e8;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#11151c;--paper:#1a2029;--fg:#e4e8ef;--muted:#9ba6b7;--line:#2d3543;--soft:#222935;--accent:#90b0f2;--accent-soft:#223152;
--bad:#f29a90;--bad-soft:#3d1f1c;--warn:#e8c070;--warn-soft:#362b14;--good:#82d2a6;--good-soft:#173326;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
a{color:var(--accent);text-underline-offset:2px}
.top{background:var(--paper);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
@media (max-width:640px){.top{position:static}}
.top .in{max-width:1180px;margin:0 auto;padding:10px 16px;display:flex;gap:8px 18px;align-items:center;flex-wrap:wrap}
.brand{font-weight:700;margin-inline-end:6px}
nav{display:flex;gap:4px;flex-wrap:wrap}
nav a{padding:5px 10px;border-radius:6px;text-decoration:none;color:var(--fg);font-size:.92rem}
nav a.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
nav a.work::before{content:"✎ ";color:var(--muted)}
.meta{margin-inline-start:auto;color:var(--muted);font-size:.8rem;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
main{max-width:1180px;margin:0 auto;padding:20px 16px 64px;display:grid;gap:18px}
h1{margin:0;font-size:1.45rem}
h2{margin:0;font-size:1.05rem}
h3{margin:4px 0;font-size:.98rem}
.lede{color:var(--muted);margin:2px 0 0;max-width:80ch}
.panel{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:16px;display:grid;gap:12px;min-width:0}
.panel-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
.panel-head>*{min-width:0;overflow-wrap:anywhere}
.scroll>table{min-width:620px}
.panel>*,main>*{min-width:0;max-width:100%}
.scroll{max-width:100%}
.note{color:var(--muted);font-size:.84rem}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.tile{background:var(--paper);border:1px solid var(--line);border-top:4px solid var(--line);border-radius:8px;padding:12px 14px;display:grid;gap:2px;text-decoration:none;color:inherit}
.tile .n{font-size:1.8rem;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.1}
.tile .l{color:var(--muted);font-size:.84rem}
.tile.bad{border-top-color:var(--bad)}.tile.bad .n{color:var(--bad)}
.tile.warn{border-top-color:var(--warn)}.tile.good{border-top-color:var(--good)}
ul.list{list-style:none;margin:0;padding:0;display:grid;border:1px solid var(--line);border-radius:6px}
ul.list>li{padding:9px 12px;border-bottom:1px solid var(--line);display:grid;gap:4px}
ul.list>li:last-child{border-bottom:0}
.row{grid-template-columns:1fr auto;align-items:center}
@media (max-width:640px){.row{grid-template-columns:1fr}}
.num{font-family:ui-monospace,Consolas,monospace;font-size:.88rem;white-space:nowrap}
.t{overflow-wrap:anywhere}
.chips{display:flex;gap:4px;flex-wrap:wrap}
.chip{font-size:.72rem;font-weight:600;padding:1px 8px;border-radius:999px;background:var(--soft);color:var(--muted);white-space:nowrap}
.chip.bad{background:var(--bad-soft);color:var(--bad)}.chip.warn{background:var(--warn-soft);color:var(--warn)}.chip.good{background:var(--good-soft);color:var(--good)}
.card{border:1px solid var(--line);border-radius:8px;padding:12px 14px;display:grid;gap:8px;background:var(--paper)}
.card.hot{border-inline-start:4px solid var(--warn)}
.card.p1{border-inline-start:4px solid var(--bad)}
pre,.body{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:inherit;font-size:.9rem;background:var(--soft);border-radius:6px;padding:8px 10px;max-height:340px;overflow:auto}
code,.lines{font-family:ui-monospace,Consolas,monospace}
.lines{white-space:pre;direction:rtl;unicode-bidi:plaintext;background:var(--soft);border-radius:6px;padding:8px 10px;font-size:.9rem;overflow-x:auto;margin:0}
form{display:grid;gap:8px;margin:0}
.opts{display:grid;gap:6px}
.opt{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:start;border:1px solid var(--line);border-radius:6px;padding:7px 10px;cursor:pointer}
.opt input{margin-top:4px}
.opt .rec{color:var(--good);font-weight:600;font-size:.75rem;margin-inline-start:6px}
textarea,input[type=text],input[type=number],select{font:inherit;font-size:.9rem;border:1px solid var(--line);border-radius:6px;padding:6px 8px;background:var(--paper);color:var(--fg);width:100%}
textarea{min-height:42px;resize:vertical}
.btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button{font:inherit;font-weight:600;border:0;border-radius:6px;padding:7px 14px;cursor:pointer;background:var(--accent);color:#fff}
button.good{background:var(--good)}button.bad{background:var(--bad)}
button.ghost{background:transparent;color:var(--accent);border:1px solid var(--line)}
.flash{border-radius:8px;padding:10px 14px;font-weight:600}
.flash.ok{background:var(--good-soft);color:var(--good)}.flash.err{background:var(--bad-soft);color:var(--bad)}
.flash.dry{background:var(--warn-soft);color:var(--warn)}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}
th{font-size:.76rem;color:var(--muted);font-weight:600;background:var(--soft)}
td.n,th.n{text-align:end;font-variant-numeric:tabular-nums}
.bar{height:8px;border-radius:4px;background:var(--soft);overflow:hidden;display:flex;min-width:120px}
.bar i{display:block;height:100%}
.bar .g{background:var(--good)}.bar .p{background:var(--warn)}.bar .r{background:var(--bad)}.bar .u{background:var(--line)}
.st-done,.st-ontrack{color:var(--good)}.st-early{color:var(--accent)}.st-watch{color:var(--warn)}.st-behind{color:var(--bad)}.st-idle{color:var(--muted)}
.weeks{display:grid;gap:2px;min-width:420px}
.wk{font-size:.72rem;color:var(--muted);text-align:center}
.wk.cur{color:var(--accent);font-weight:700}
.cell{height:18px;border-radius:3px;background:var(--soft)}
.cell.on{background:var(--accent-soft);border:1px solid var(--accent)}
.cell.on.st-done,.cell.on.st-ontrack{background:var(--good-soft);border-color:var(--good)}
.cell.on.st-watch{background:var(--warn-soft);border-color:var(--warn)}
.cell.on.st-behind{background:var(--bad-soft);border-color:var(--bad)}
details>summary{cursor:pointer}
details.more>summary{color:var(--accent);font-size:.88rem}
.ext{font-size:.8rem}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.empty{color:var(--muted);padding:8px 0}
`;

export function page(f: Frame, current: string, title: string, lede: string, body: string): string {
  const nav = SCREENS.map((s) => `<a class="${s.kind}${s.path === current ? ' on' : ''}" href="${f.base}${s.path || '/'}">${s.label}</a>`).join('');
  const flash = f.flash ? `<div class="flash ${f.flash.ok ? (f.writes === 'dry' ? 'dry' : 'ok') : 'err'}">${esc(f.flash.text)}</div>` : '';
  const errs = f.errors.length
    ? `<div class="flash err">${t('render.page.1')}${esc(f.errors.join(' · '))}</div>`
    : '';
  const mode = f.writes === 'on' ? '' : f.writes === 'dry' ? `<span class="chip warn">${t('render.page.2')}</span>` : `<span class="chip">${t('render.page.3')}</span>`;
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}${t('render.page.4')}</title><style>${CSS}</style></head><body>
<header class="top"><div class="in"><span class="brand">${t('render.page.5')}</span><nav>${nav}</nav>
<span class="meta">${mode}${f.ref !== 'main' ? `<span class="chip warn">${t('render.page.9')}${esc(f.ref)}</span>` : ''}<span title="${esc(f.asOf)}${t('render.page.6')}${fmtTime(f.asOf)}</span>
<form method="post" action="${f.base}/refresh"><input type="hidden" name="csrf" value="${esc(f.csrf)}"><input type="hidden" name="back" value="${esc(current)}"><button class="ghost" type="submit">${t('render.page.7')}</button></form>
<a href="${f.base}${t('render.page.8')}</a></span></div></header>
<main><div><h1>${esc(title)}</h1><p class="lede">${lede}</p></div>${flash}${errs}${body}</main></body></html>`;
}

// ── forms ────────────────────────────────────────────────────────────────────

function form(f: Frame, back: string, fields: Record<string, string | number>, inner: string): string {
  if (f.writes === 'off') return '';
  const hidden = Object.entries({ ...fields, csrf: f.csrf, back }).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  return `<form method="post" action="${f.base}/act">${hidden}${inner}</form>`;
}

const noteBox = (placeholder: string, required = false) =>
  `<textarea name="note" placeholder="${esc(placeholder)}"${required ? ' required' : ''}></textarea>`;

function passFail(): string {
  return `<div class="btns"><button class="good" name="verdict" value="pass" type="submit">${t('render.passFail.1')}</button><button class="bad" name="verdict" value="fail" type="submit">${t('render.passFail.2')}</button></div>`;
}

// ── 1 · what needs me ────────────────────────────────────────────────────────

export function homePage(f: Frame, nm: NeedsMe, now: string, summary: { fixed: number; filed: number; deploys: number; since: string }): string {
  const tiles = `<div class="tiles">
<a class="tile ${nm.p1.length ? 'bad' : 'good'}" href="#p1"><span class="n">${nm.p1.length}</span><span class="l">${t('render.homePage.1')}</span></a>
<a class="tile ${nm.decisions.length ? 'warn' : 'good'}" href="#decisions"><span class="n">${nm.decisions.length}</span><span class="l">${t('render.homePage.2')}</span></a>
<a class="tile ${nm.prs.length ? 'warn' : 'good'}" href="#prs"><span class="n">${nm.prs.length}</span><span class="l">${t('render.homePage.3')}</span></a>
<a class="tile ${nm.audits.length ? 'warn' : 'good'}" href="#audits"><span class="n">${nm.audits.length}</span><span class="l">${t('render.homePage.4')}</span></a>
<a class="tile ${nm.plans.length ? 'warn' : 'good'}" href="#plans"><span class="n">${nm.plans.length}</span><span class="l">${t('render.homePage.5')}</span></a>
<a class="tile" href="${f.base}/since"><span class="n">${summary.fixed}</span><span class="l">${t('render.homePage.6')}${fmtTime(summary.since)} · ${summary.filed}${t('render.homePage.7')}${summary.deploys} deploys</span></a>
</div>`;

  const p1 = `<section class="panel" id="p1"><div class="panel-head"><h2>${t('render.homePage.8')}</h2><span class="note">${t('render.homePage.9')}</span></div>
${nm.p1.length ? `<ul class="list">${nm.p1.map((i) => issueRow(f.base, i)).join('')}</ul>` : `<p class="empty">${t('render.homePage.10')}</p>`}</section>`;

  const decisions = `<section class="panel" id="decisions"><div class="panel-head"><h2>${t('render.homePage.2')}</h2><span class="note">${t('render.homePage.11')}</span></div>
${nm.decisions.length ? nm.decisions.map((d) => `<div class="card hot"><div>${issueLink(f.base, d.issue)} ${ghLink(d.issue.n)}</div><div class="chips">${chips(d.issue)}</div>
<details><summary>${t('render.homePage.12')}</summary><div class="body">${linkify(f.base, d.question)}</div></details>
${form(f, '', { action: 'rule', issue: d.issue.n }, `${d.options.length ? `<div class="opts">${d.options.map((o) => `<label class="opt"><input type="radio" name="option" value="${o.key}"><span><b>${o.key}</b> · ${bdi(o.label)}${d.recommended === o.key ? `<span class="rec">${t('render.homePage.14')}</span>` : ''}</span></label>`).join('')}</div>` : ''}
${noteBox(d.options.length ? `${t('render.homePage.15')}` : `${t('render.homePage.16')}`)}<div class="btns"><button type="submit">${t('render.homePage.13')}</button></div>`)}</div>`).join('') : `<p class="empty">${t('render.homePage.17')}</p>`}</section>`;

  const prs = `<section class="panel" id="prs"><div class="panel-head"><h2>${t('render.homePage.3')}</h2><span class="note">${t('render.homePage.18')}</span></div>
${nm.prs.length ? nm.prs.map((p) => `<div class="card"><div><a class="num" href="${REPO_URL}/pull/${p.n}" target="_blank" rel="noopener">PR #${p.n}</a> <span class="t">${bdi(p.title)}</span></div>
<div class="note">${t('render.homePage.19')}${p.closes.map((n) => `<a href="${f.base}/issue?n=${n}">#${n}</a>`).join(' ') || '—'}${t('render.homePage.20')}<code>${esc(p.branch)}</code>${t('render.homePage.21')}${fmtDay(p.created)}</div>
${p.plays.length ? p.plays.map((b) => `<div><div class="note">${t('render.homePage.22')}<code>${esc(b.path)}</code></div><pre class="lines">${esc(b.lines.join('\n'))}</pre>${b.note ? `<div class="note">${linkify(f.base, b.note)}</div>` : ''}</div>`).join('') : `<p class="note">${t('render.homePage.23')}` + REPO_URL + '/pull/' + p.n + `${t('render.homePage.24')}</a></p>`}
${form(f, '', { action: 'play', pr: p.n }, `${noteBox(`${t('render.homePage.25')}`)}${passFail()}`)}</div>`).join('') : `<p class="empty">${t('render.homePage.26')}</p>`}</section>`;

  const audits = `<section class="panel" id="audits"><div class="panel-head"><h2>${t('render.homePage.4')}</h2><span class="note">${t('render.homePage.27')}</span></div>
${nm.audits.length ? `<div class="grid2">${nm.audits.map((a) => `<div class="card"><div><b>${esc(a.sheet)} · ${esc(a.id)}</b> <span class="chip">${esc(productHe(a.product))}</span></div>
<div class="note">${t('render.homePage.28')}${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)}</a>${t('render.homePage.29')}</div><pre class="lines">${esc(a.lines.join('\n'))}</pre>
<div><b>${t('render.homePage.30')}</b> ${bdi(a.lookFor)}</div>${form(f, '', { action: 'audit', sheet: a.sheet, id: a.id }, `${noteBox(`${t('render.homePage.25')}`)}${passFail()}`)}</div>`).join('')}</div>` : `<p class="empty">${t('render.homePage.31')}</p>`}</section>`;

  const plans = `<section class="panel" id="plans"><div class="panel-head"><h2>${t('render.homePage.5')}</h2><span class="note">${t('render.homePage.32')}</span></div>
${nm.plans.length ? nm.plans.map((p) => `<div class="card"><div>${issueLink(f.base, p.issue)} ${ghLink(p.issue.n)}</div><div class="chips">${chips(p.issue)}</div>
<ul>${p.proposed.map((l) => `<li>${bdi(l)}</li>`).join('')}</ul>
${form(f, '', { action: 'approve', issue: p.issue.n }, `${noteBox(`${t('render.homePage.35')}`)}<div class="btns"><button class="good" type="submit">${t('render.homePage.33')}</button><a href="${f.base}/issue?n=${p.issue.n}${t('render.homePage.34')}</a></div>`)}</div>`).join('') : `<p class="empty">${t('render.homePage.36')}</p>`}</section>`;

  const round = nm.round
    ? `<section class="panel"><div class="panel-head"><h2>${t('render.homePage.37')}</h2>${ghLink(nm.round.issue.n, `#${nm.round.issue.n} ↗`)}</div><div class="t">${bdi(nm.round.issue.title)}</div>
<h3>${t('render.chips.3')}</h3><div class="body">${linkify(f.base, nm.round.waiting ?? `${t('render.homePage.38')}`)}</div></section>`
    : '';

  return page(f, '', `${t('render.SCREENS.1')}`, `${t('render.homePage.39')}${ago(now, now) === `${t('render.homePage.40')}` ? `${t('render.homePage.41')}` : fmtTime(now)}.`, tiles + p1 + decisions + prs + audits + plans + round);
}

// ── 2 · since I last looked ──────────────────────────────────────────────────

export function sincePage(f: Frame, s: SinceLast, choices: { label: string; since: string }[]): string {
  const pick = `<div class="btns">${choices.map((c) => `<a class="chip${c.since === s.since ? ' good' : ''}" href="${f.base}/since?from=${encodeURIComponent(c.since)}">${esc(c.label)}</a>`).join('')}</div>`;
  const commits = s.commits.length
    ? `<ul class="list">${s.commits.slice(0, 80).map((c) => `<li class="row"><div><a class="num" href="${REPO_URL}/commit/${c.sha}" target="_blank" rel="noopener">${c.sha.slice(0, 8)}</a> <span class="t">${linkify(f.base, c.subject)}</span></div><span class="note">${fmtTime(c.date)}</span></li>`).join('')}</ul>${s.commits.length > 80 ? `<p class="note">${t('render.sincePage.1')}${s.commits.length - 80}.</p>` : ''}`
    : `<p class="empty">${t('render.sincePage.2')}</p>`;
  const list = (xs: Issue[], empty: string) => (xs.length ? `<ul class="list">${xs.map((i) => issueRow(f.base, i)).join('')}</ul>` : `<p class="empty">${empty}</p>`);
  const deploys = s.deploys.length
    ? `<ul class="list">${s.deploys.map((d) => `<li><div><b>${esc(d.tag)}</b> · ${fmtDay(d.date)} · ${esc(d.apps)}</div><div class="note">${linkify(f.base, d.what.slice(0, 400))}${d.what.length > 400 ? '…' : ''}</div></li>`).join('')}</ul>`
    : `<p class="empty">${t('render.sincePage.3')}</p>`;
  const round = s.round
    ? `<section class="panel"><div class="panel-head"><h2>${t('render.sincePage.4')}</h2>${ghLink(s.round.n, `#${s.round.n} ↗`)}</div><div>${bdi(s.round.title)}</div><div class="note">${s.round.open ? `${t('render.sincePage.5')}` : `${t('render.sincePage.6')}${fmtTime(s.round.closed)}`}</div></section>`
    : '';
  return page(f, '/since', `${t('render.sincePage.7')}`, `${t('render.sincePage.8')}${fmtTime(s.since)}${t('render.sincePage.9')}`,
    `${pick}<div class="tiles"><div class="tile good"><span class="n">${s.fixed.length}</span><span class="l">${t('render.sincePage.10')}</span></div><div class="tile"><span class="n">${s.shelved.length}</span><span class="l">${t('render.sincePage.11')}</span></div><div class="tile warn"><span class="n">${s.filed.length}</span><span class="l">${t('render.sincePage.12')}</span></div><div class="tile"><span class="n">${s.commits.length}</span><span class="l">${t('render.sincePage.13')}</span></div><div class="tile"><span class="n">${s.deploys.length}</span><span class="l">deploys</span></div></div>
${round}
<section class="panel"><h2>Deploys</h2>${deploys}</section>
<section class="panel"><h2>${t('render.sincePage.14')}</h2>${list(s.fixed, `${t('render.sincePage.18')}`)}</section>
<section class="panel"><h2>${t('render.sincePage.15')}</h2>${list(s.filed, `${t('render.sincePage.18')}`)}</section>
<section class="panel"><h2>${t('render.sincePage.16')}</h2>${list(s.shelved, `${t('render.sincePage.18')}`)}</section>
<section class="panel"><h2>${t('render.sincePage.17')}</h2>${commits}</section>`);
}

// ── 3 · on pace ──────────────────────────────────────────────────────────────

function unitBlock(base: string, u: UnitRow): string {
  const total = u.questions.length || 1;
  const delta = u.greenWeekAgo == null ? '' : u.green - u.greenWeekAgo === 0 ? `${t('render.unitBlock.1')}` : ` · ${u.green - u.greenWeekAgo > 0 ? '+' : ''}${u.green - u.greenWeekAgo}${t('render.unitBlock.2')}`;
  const qs = u.questions
    .filter((q) => q.status !== 'green')
    .map((q) => `<li class="row"><div><b>${esc(q.id)}</b> ${q.title ? bdi(q.title) : ''}${q.where ? ` <span class="note">${bdi(q.where)}</span>` : ''}${q.failing ? `<div class="note">${bdi(q.failing)}</div>` : ''}</div><div class="chips"><span class="chip ${q.status === 'red' ? 'bad' : q.status === 'partial' ? 'warn' : ''}">${q.status === 'red' ? `${t('render.unitBlock.3')}` : q.status === 'partial' ? `${t('render.unitBlock.4')}` : `${t('render.unitBlock.5')}`}</span>${q.issue ? `<a href="${base}/issue?n=${q.issue}">#${q.issue}</a>` : ''}</div></li>`)
    .join('');
  return `<div class="card"><div class="panel-head"><h3>${esc(u.name)} <span class="note">· ${esc(productHe(u.builder))} · ${fmtDay(u.from)}${u.to ? ` – ${fmtDay(u.to)}` : ''}</span></h3><b>${u.green} / ${u.questions.length}${t('render.unitBlock.6')}</b></div>
<div class="bar" title="${u.green}${t('render.unitBlock.7')}${u.partial}${t('render.unitBlock.8')}${u.red}${t('render.unitBlock.9')}${u.untried}${t('render.unitBlock.10')}${(u.green / total) * 100}%"></i><i class="p" style="width:${(u.partial / total) * 100}%"></i><i class="r" style="width:${(u.red / total) * 100}%"></i><i class="u" style="width:${(u.untried / total) * 100}%"></i></div>
<div class="note">${u.green}${t('render.unitBlock.7')}${u.partial}${t('render.unitBlock.11')}${u.red}${t('render.unitBlock.9')}${u.untried}${t('render.unitBlock.12')}${delta}${u.measuredAt ? `${t('render.unitBlock.13')}${fmtDay(u.measuredAt)}${u.commit ? `${t('render.unitBlock.14')}${esc(u.commit.slice(0, 8))}` : ''}` : `${t('render.unitBlock.15')}`}</div>
${qs ? `<details class="more"><summary>${t('render.unitBlock.16')}${u.partial + u.red + u.untried})</summary><ul class="list">${qs}</ul></details>` : ''}</div>`;
}

function boardRow(base: string, r: WsRow, weeks: number, cur: number): string {
  const cells = Array.from({ length: weeks }, (_, k) => {
    const w = k + 1;
    const on = w >= r.ws.from && w <= r.ws.to;
    return `<div class="cell${on ? ` on st-${r.status}` : ''}"${w === cur ? ' style="outline:2px solid var(--fg);outline-offset:-1px"' : ''}></div>`;
  }).join('');
  const facts = r.ws.milestone ? `${t('render.boardRow.1')}` : `${r.closed}${t('render.boardRow.2')}${r.open + r.closed}${t('render.boardRow.3')}${r.bugOpen ? ` · ${r.bugOpen} bugs` : ''}${r.featOpen ? ` · ${r.featOpen} features` : ''}${r.needs ? ` · ${r.needs}${t('render.boardRow.4')}` : ''}`;
  const issues = r.ws.issues.map((n) => `<a href="${base}/issue?n=${n}">#${n}</a>`).join(' ');
  return `<tr><td><details><summary><b>${bdi(r.ws.name)}</b></summary>${r.ws.goal ? `<div class="note">${bdi(r.ws.goal)}</div>` : ''}<div class="note">${issues || '—'}</div></details>
<div class="note"><span class="st-${r.status}"><b>${STATUS_LABEL[r.status]}</b></span> · ${esc(facts)}</div><div class="note">${esc(r.why)}</div></td>
<td><div class="weeks" style="grid-template-columns:repeat(${weeks},1fr)">${cells}</div></td></tr>`;
}

export function planPage(f: Frame, p: Pace): string {
  if (!p.plan) {
    return page(f, '/plan', `${t('render.SCREENS.3')}`, `${t('render.planPage.1')}`, p.units.length ? p.units.map((u) => unitBlock(f.base, u)).join('') : '');
  }
  const plan = p.plan;
  const W = plan.weeks.length;
  const behind = p.rows.filter((r) => r.status === 'behind').length;
  const tiles = `<div class="tiles">
<div class="tile ${behind ? 'bad' : 'good'}"><span class="n">${Math.min(p.week, W)}<small> / ${W}</small></span><span class="l">${p.week > W ? `${t('render.planPage.4')}` : `${t('render.planPage.5')}${p.week}`} · ${behind ? `${behind}${t('render.planPage.6')}` : `${t('render.planPage.7')}`}</span></div>
<div class="tile ${p.planClosed >= p.expected ? 'good' : 'warn'}"><span class="n">${p.planClosed}<small> / ${p.planOpen + p.planClosed}</small></span><span class="l">${t('render.planPage.2')}${p.expected}</span></div>
<div class="tile ${p.outside.length ? 'warn' : 'good'}"><span class="n">${p.outside.length}</span><span class="l">${t('render.planPage.3')}</span></div>
</div>`;
  const cal = plan.calendar
    ? `<section class="panel"><h2>${t('render.planPage.8')}</h2><ul class="list">${plan.calendar.topics.map((topic) => `<li class="row"><div><b>${bdi(topic.name)}</b></div><span class="note">${fmtDay(topic.from)}${topic.to ? ` – ${fmtDay(topic.to)}` : `${t('render.planPage.9')}`}</span></li>`).join('')}</ul>${plan.calendar.note ? `<p class="note">${bdi(plan.calendar.note)}</p>` : ''}</section>`
    : '';
  const groups = plan.groups.map((g) => {
    const rows = p.rows.filter((r) => r.ws.p === g.p);
    if (!rows.length) return '';
    return `<tr><th colspan="2">${bdi(g.label)}</th></tr>${rows.map((r) => boardRow(f.base, r, W, p.week)).join('')}`;
  }).join('');
  const weekHead = plan.weeks.map((w) => `<div class="wk${w.n === p.week ? ' cur' : ''}">${w.n}<br>${esc(w.label)}</div>`).join('');
  const board = `<section class="panel"><div class="panel-head"><h2>${t('render.planPage.10')}</h2><span class="note">${t('render.planPage.11')}</span></div>
<div class="scroll"><table><thead><tr><th style="width:45%">${t('render.planPage.12')}</th><th><div class="weeks" style="grid-template-columns:repeat(${W},1fr)">${weekHead}</div></th></tr></thead><tbody>${groups}</tbody></table></div></section>`;
  const units = `<section class="panel"><div class="panel-head"><h2>${t('render.planPage.13')}</h2><span class="note">${t('render.planPage.14')}</span></div>
${p.units.length ? p.units.map((u) => unitBlock(f.base, u)).join('') : `<p class="empty">${t('render.planPage.15')}</p>`}</section>`;
  const weeks = plan.weeks.filter((w) => w.n >= Math.max(p.week, 1));
  const outside = `<section class="panel"><div class="panel-head"><h2>${t('render.planPage.16')}</h2><span class="note">${t('render.planPage.17')}</span></div>
${p.outside.length ? `<ul class="list">${p.outside.slice(0, 40).map((i) => `<li class="row"><div>${issueLink(f.base, i)}<div class="chips">${chips(i)}</div></div><div>${form(f, '/plan', { action: 'pull', issue: i.n }, `<div class="btns"><select name="week" aria-label="${t('render.planPage.18')}">${weeks.map((w) => `<option value="${w.n}${t('render.planPage.20')}${w.n} · ${esc(w.label)}</option>`).join('')}</select><button type="submit" class="ghost">${t('render.planPage.19')}</button></div>`)}</div></li>`).join('')}</ul>${p.outside.length > 40 ? `<p class="note">${t('render.sincePage.1')}${p.outside.length - 40}.</p>` : ''}` : `<p class="empty">${t('render.sincePage.18')}</p>`}</section>`;
  const pulled = p.pulled.length
    ? `<section class="panel"><h2>${t('render.planPage.21')}${p.pulled.length})</h2><details class="more"><summary>${t('render.planPage.22')}</summary><ul class="list">${p.pulled.slice().reverse().map((x) => `<li class="row"><div>${x.issue ? issueLink(f.base, x.issue) : `<a class="num" href="${f.base}/issue?n=${x.n}">#${x.n}</a>`}<div class="note">${t('render.planPage.5')}${x.week} · ${fmtDay(x.at)} · ${bdi(x.by)}</div></div><div class="chips">${x.issue ? chips(x.issue) : ''}</div></li>`).join('')}</ul></details></section>`
    : '';
  return page(f, '/plan', `${t('render.SCREENS.3')}`, `${bdi(plan.title)}${t('render.planPage.23')}`, tiles + units + board + cal + outside + pulled);
}

// ── 4 · live ─────────────────────────────────────────────────────────────────

export function livePage(f: Frame, l: ReturnType<typeof import('./sections').live>): string {
  const head = l.live
    ? `<div class="tiles"><div class="tile"><span class="n" style="font-size:1.2rem">${esc(l.live.tag)}</span><span class="l">${t('render.livePage.1')}${fmtTime(l.live.date)}</span></div><div class="tile ${l.live.aheadBy ? 'warn' : 'good'}"><span class="n">${l.live.aheadBy}</span><span class="l">${t('render.livePage.2')}</span></div></div>`
    : `<p class="empty">${t('render.livePage.3')}</p>`;
  const apps = `<section class="panel"><h2>${t('render.livePage.4')}</h2><ul class="list">${l.perApp.map((a) => `<li class="row"><div><b>${esc(a.he)}</b>${a.path ? ` · <a href="https://themathbible.com${a.path}" target="_blank" rel="noopener">${a.path}</a>` : ''}</div><span class="note">${a.last ? `${esc(a.last.tag)} · ${fmtDay(a.last.date)}` : '—'}</span></li>`).join('')}</ul></section>`;
  const ahead = l.live && l.live.ahead.length
    ? `<section class="panel"><h2>${t('render.livePage.5')}</h2><ul class="list">${l.live.ahead.map((c) => `<li class="row"><div><a class="num" href="${REPO_URL}/commit/${c.sha}" target="_blank" rel="noopener">${c.sha.slice(0, 8)}</a> <span class="t">${linkify(f.base, c.subject)}</span></div><span class="note">${fmtTime(c.date)}</span></li>`).join('')}</ul></section>`
    : '';
  const log = `<section class="panel"><h2>${t('render.livePage.6')}</h2><ul class="list">${l.deploys.map((d) => `<li><div><b>${esc(d.tag)}</b> · ${fmtDay(d.date)} · <code>${esc(d.commit)}</code> · ${esc(d.apps)}</div><details class="more"><summary>${t('render.livePage.8')}</summary><div class="body">${linkify(f.base, d.what)}</div></details></li>`).join('')}</ul><p class="note">${t('render.livePage.7')}</p></section>`;
  return page(f, '/live', `${t('render.SCREENS.4')}`, `${t('render.livePage.9')}`, head + apps + ahead + log);
}

// ── 5 · backlog ──────────────────────────────────────────────────────────────

export function backlogPage(f: Frame, b: ReturnType<typeof import('./sections').backlog>, now: string): string {
  const dirs = b.directions.length
    ? `<section class="panel"><div class="panel-head"><h2>${t('render.backlogPage.1')}</h2><span class="note">${t('render.backlogPage.2')}${fmtDay(b.directionsAsOf)}${t('render.backlogPage.3')}</span></div>
${b.directions.map((p) => `<details${p.id === 'analytic' || p.id === '3d' ? ' open' : ''}><summary><b>${esc(p.name)}</b> <span class="note">· ${esc(p.stage)} · ${p.directions.length}${t('render.backlogPage.4')}</span></summary><div class="scroll"><table><thead><tr><th>${t('render.backlogPage.5')}</th><th>${t('render.backlogPage.6')}</th><th>${t('render.backlogPage.7')}</th><th class="n">${t('render.backlogPage.8')}</th><th>issues</th></tr></thead><tbody>
${p.directions.map((d) => `<tr><td><b>${bdi(d.name)}</b>${d.size ? ` <span class="note">${esc(d.size)}</span>` : ''}</td><td>${bdi(d.what)}</td><td>${d.status ? bdi(d.status) : ''}</td><td class="n">${d.open}/${d.open + d.closed}</td><td>${d.issues.map((n) => `<a href="${f.base}/issue?n=${n}">#${n}</a>`).join(' ') || '—'}</td></tr>`).join('')}
</tbody></table></div>${p.longTail ? `<p class="note">${linkify(f.base, p.longTail)}</p>` : ''}${p.outOfScope ? `<p class="note">${linkify(f.base, p.outOfScope)}</p>` : ''}</details>`).join('')}
${b.threads ? `<p class="note">${linkify(f.base, b.threads)}</p>` : ''}</section>`
    : '';
  const prodBlocks = b.byProduct.filter((p) => p.rows.length).map((p) => {
    const outside = p.rows.filter((r) => !r.inPlan);
    return `<details><summary><b>${esc(productHe(p.product))}</b> <span class="note">· ${p.rows.length}${t('render.backlogPage.9')}${outside.length}${t('render.backlogPage.10')}</span></summary>
<ul class="list">${p.rows.map((r) => `<li class="row"><div>${issueLink(f.base, r.issue)}<div class="note">${t('render.backlogPage.11')}${r.ageDays}${t('render.ago.4')}${r.inPlan ? `${t('render.backlogPage.12')}` : ''}</div></div><div class="chips">${chips(r.issue)}</div></li>`).join('')}</ul></details>`;
  }).join('');
  const later = b.later.length ? `<ul class="list">${b.later.map((i) => issueRow(f.base, i)).join('')}</ul>` : `<p class="empty">${t('render.sincePage.18')}</p>`;
  const parked = b.parked.length ? `<details class="more"><summary>${b.parked.length}${t('render.backlogPage.13')}</summary><ul class="list">${b.parked.map((i) => issueRow(f.base, i)).join('')}</ul></details>` : `<p class="empty">${t('render.sincePage.18')}</p>`;
  return page(f, '/backlog', 'Backlog', `${t('render.backlogPage.14')}${b.total}${t('render.backlogPage.15')}${b.total - b.inPlan}${t('render.backlogPage.16')}${fmtTime(now)}.`,
    `${dirs}<section class="panel"><h2>${t('render.backlogPage.17')}</h2>${prodBlocks || `<p class="empty">${t('render.sincePage.18')}</p>`}</section>
<section class="panel"><h2>${t('render.backlogPage.18')}</h2>${later}</section><section class="panel"><h2>${t('render.backlogPage.19')}</h2>${parked}</section>`);
}

// ── 6 · usage ────────────────────────────────────────────────────────────────

const trend = (a: number, b: number) => (b === 0 ? (a ? '↑' : '') : a > b ? `↑ ${Math.round(((a - b) / b) * 100)}%` : a < b ? `↓ ${Math.round(((b - a) / b) * 100)}%` : '=');

export function usagePage(f: Frame, us: BuilderUsage[], mineCount: number, now: string, days = 7): string {
  const span = days === 7 ? `${t('render.usagePage.1')}` : `${days}${t('render.ago.4')}`;
  const pick = `<div class="btns">${[7, 30].map((d) => `<a class="chip${d === days ? ' good' : ''}" href="${f.base}/usage${d === 7 ? '' : '?days=30'}">${d === 7 ? `${t('render.usagePage.2')}` : `${t('render.usagePage.3')}`}</a>`).join('')}</div>`;
  const cards = `<div class="tiles">${us.map((u) => `<div class="tile"><span class="l"><b>${esc(u.builder.he)}</b></span>${u.hasLog
    ? `<span class="n">${u.week.visitors}</span><span class="l">${t('render.usagePage.4')}${span} ${esc(trend(u.week.visitors, u.prevWeek.visitors))} · ${u.week.sessions} sessions · ${u.week.submits}${t('render.usagePage.5')}${u.week.failed}${t('render.usagePage.6')}</span>`
    : `<span class="l">${t('render.usagePage.7')}</span>`}</div>`).join('')}</div>`;
  const tables = us.filter((u) => u.hasLog).map((u) => {
    const rows = u.groups.slice(0, 60).map((g) => {
      const link = u.builder.admin && g.sessions[0] ? `${u.builder.admin}?view=sessions&sid=${encodeURIComponent(g.sessions[0])}` : '';
      const still = g.stillFails == null ? `<span class="chip">${t('render.usagePage.8')}</span>` : g.stillFails ? `<span class="chip bad">${t('render.usagePage.9')}</span>` : `<span class="chip good">${t('render.usagePage.10')}</span>`;
      const issue = g.issue ? `<a href="${f.base}/issue?n=${g.issue.n}">#${g.issue.n}</a>${g.issue.open ? '' : ' <span class="chip">' + (g.issue.labels.includes('icebox') ? `${t('render.usagePage.11')}` : `${t('render.usagePage.12')}`) + '</span>'}` : `<span class="chip warn">${t('render.usagePage.13')}</span>`;
      const fileForm = !g.issue && g.stillFails !== false
        ? form(f, '/usage', { action: 'file', builder: u.builder.id, line: g.line, outcome: g.outcome, sessions: g.sessions.slice(0, 5).join(' '), link: link ? `https://themathbible.com${link}` : '' }, `<button class="ghost" type="submit">${t('render.usagePage.14')}</button>`)
        : '';
      return `<tr><td><span class="lines" style="display:inline-block;padding:2px 6px">${esc(g.line)}</span></td><td>${esc(FAILED_LABEL[g.outcome] ?? g.outcome)}</td><td class="n">${g.sessions.length}</td><td class="n">${g.count}</td><td>${still}</td><td>${issue}</td><td>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">timeline</a>` : '—'}</td><td>${fileForm}</td></tr>`;
    }).join('');
    return `<section class="panel"><div class="panel-head"><h2>${esc(u.builder.he)}${t('render.usagePage.15')}${span})</h2><span class="note">${u.verdictsAge ? `${t('render.usagePage.16')}${fmtDay(u.verdictsAge)}` : `${t('render.usagePage.17')}`}${u.mine.submits ? ` · ${u.mine.submits}${t('render.usagePage.18')}` : ''}</span></div>
${rows ? `<div class="scroll"><table><thead><tr><th>${t('render.usagePage.19')}</th><th>${t('render.SCREENS.2')}</th><th class="n">sessions</th><th class="n">${t('render.usagePage.20')}</th><th>${t('render.usagePage.21')}</th><th>issue</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${u.groups.length > 60 ? `<p class="note">${t('render.sincePage.1')}${u.groups.length - 60}${t('render.usagePage.22')}</p>` : ''}` : `<p class="empty">${t('render.usagePage.23')}${span}.</p>`}</section>`;
  }).join('');
  return page(f, '/usage', `${t('render.SCREENS.5')}`, `${span}${t('render.usagePage.24')}${span}${t('render.usagePage.25')}${mineCount ? `${t('render.usagePage.27')}${mineCount}${t('render.usagePage.28')}` : `${t('render.usagePage.29')}`}${t('render.usagePage.26')}${fmtTime(now)}.`, pick + cards + tables);
}

// ── 7 · cost ─────────────────────────────────────────────────────────────────

export function costPage(f: Frame, rows: ReturnType<typeof import('./sections').cost>): string {
  const body = rows.length
    ? `<div class="scroll"><table><thead><tr><th>${t('render.costPage.1')}</th><th>${t('render.costPage.2')}</th><th class="n">${t('render.costPage.3')}</th><th class="n">${t('render.costPage.4')}</th><th class="n">${t('render.costPage.5')}</th><th class="n">${t('render.costPage.6')}</th><th class="n">${t('render.costPage.7')}</th><th class="n">${t('render.costPage.8')}</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${ghLink(r.issue.n, `#${r.issue.n}`)} ${r.running ? `<span class="chip warn">${t('render.costPage.10')}</span>` : ''}<div class="note">${bdi(r.issue.title.replace(/^fix-round\s*/i, '').slice(0, 90))}</div></td><td>${fmtDay(r.date)}</td><td class="n">${r.hours}</td>
<td class="n">${r.queue?.onMain ?? '—'}</td><td class="n">${r.queue?.onApproval ?? '—'}</td><td class="n">${r.queue?.filed ?? '—'}</td><td class="n">${r.queue?.foundInRound ?? '—'}</td><td class="n">${r.minutes == null ? '—' : `≈${r.minutes}`}</td></tr>`).join('')}
</tbody></table></div><p class="note">${t('render.costPage.9')}</p>`
    : `<p class="empty">${t('render.costPage.11')}</p>`;
  return page(f, '/cost', `${t('render.costPage.12')}`, `${t('render.costPage.13')}`, `<section class="panel">${body}</section>`);
}

// ── an issue's own page: read it, act on it ──────────────────────────────────

export function issuePage(f: Frame, i: Issue | null, n: number): string {
  if (!i) return page(f, '/issue', `#${n}`, `${t('render.issuePage.1')}`, `<p>${ghLink(n, `${t('render.issuePage.2')}`)}</p>`);
  const back = `/issue?n=${i.n}`;
  const cur = ['P1', 'P2', 'P3', 'later'].filter((p) => i.labels.includes(p)).join(',');
  const acts = i.open
    ? `<section class="panel"><h2>${t('render.issuePage.3')}</h2><div class="grid2">
<div class="card"><h3>${t('render.issuePage.4')}</h3>${form(f, back, { action: i.labels.includes('needs-operator') ? 'rule' : 'note', issue: i.n }, `${noteBox(i.labels.includes('needs-operator') ? `${t('render.issuePage.8')}` : `${t('render.issuePage.9')}`, !i.labels.includes('needs-operator'))}<div class="btns"><button type="submit">${t('render.issuePage.7')}</button></div>`)}</div>
<div class="card"><h3>${t('render.issuePage.5')}</h3>${form(f, back, { action: 'priority', issue: i.n, from: cur }, `<div class="btns"><select name="to">${['P1', 'P2', 'P3', 'later'].map((p) => `<option${i.labels.includes(p) ? ' selected' : ''}>${p}</option>`).join('')}</select></div>${noteBox(`${t('render.issuePage.11')}`)}<div class="btns"><button type="submit" class="ghost">${t('render.issuePage.10')}</button></div>`)}</div>
<div class="card"><h3>${t('render.issuePage.6')}</h3>${form(f, back, { action: 'park', issue: i.n }, `${noteBox(`${t('render.issuePage.13')}`, true)}<div class="btns"><button type="submit" class="bad">${t('render.issuePage.12')}</button></div>`)}</div>
${!i.labels.includes('auto-ok') && /what the student will see/i.test(i.body) ? `<div class="card"><h3>${t('render.homePage.33')}</h3>${form(f, back, { action: 'approve', issue: i.n }, `${noteBox(`${t('render.homePage.35')}`)}<div class="btns"><button type="submit" class="good">${t('render.issuePage.14')}</button></div>`)}</div>` : ''}
</div></section>`
    : '';
  return page(f, '/issue', `#${i.n}`, `${bdi(i.title)}`,
    `<div class="chips">${chips(i)}</div><div class="note">${t('render.issuePage.15')}${fmtDay(i.created)}${t('render.issuePage.16')}${fmtTime(i.updated)} · ${i.comments}${t('render.issuePage.17')}${ghLink(i.n, `${t('render.issuePage.19')}`)}</div>
${acts}<section class="panel"><h2>${t('render.issuePage.18')}</h2><div class="body" style="max-height:none">${linkify(f.base, i.body)}</div></section>`);
}

// ── login ────────────────────────────────────────────────────────────────────

export function loginPage(base: string, opts: { error: boolean; disabled: boolean }): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${t('render.loginPage.1')}</title><style>${CSS}
.login{max-width:360px;margin:12vh auto;padding:0 16px}</style></head><body><div class="login"><section class="panel"><h1>${t('render.page.5')}</h1>
${opts.disabled ? `<p class="flash err">${t('render.loginPage.2')}</p>` : `${opts.error ? `<p class="flash err">${t('render.loginPage.6')}</p>` : ''}
<form method="post" action="${base}/login"><label>${t('render.loginPage.3')}<input type="text" name="username" autocomplete="username" required></label>
<label>${t('render.loginPage.4')}<input type="password" name="password" autocomplete="current-password" required style="font:inherit;border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%"></label>
<button type="submit">${t('render.loginPage.5')}</button></form>`}</section></div></body></html>`;
}

/** The dry-run page: what an action WOULD write, nothing sent. */
export function dryRunText(writes: { op: string; issue?: number; labels?: string[]; label?: string; path?: string; title?: string }[]): string {
  const what = writes.map((w) => {
    switch (w.op) {
      case 'comment': return `${t('render.dryRunText.1')}${w.issue}`;
      case 'addLabels': return `label ${w.labels?.join(', ')}${t('render.dryRunText.2')}${w.issue}`;
      case 'removeLabel': return `${t('render.dryRunText.3')}${w.label}${t('render.dryRunText.4')}${w.issue}`;
      case 'close': return `${t('render.dryRunText.5')}${w.issue}${t('render.dryRunText.6')}`;
      case 'create': return `${t('render.dryRunText.7')}${w.title}»`;
      case 'editJson': return `${t('render.dryRunText.8')}${w.path}`;
      default: return w.op;
    }
  });
  return `${t('render.dryRunText.9')}${what.join(' · ')}.`;
}
