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
  if (m < 60) return `לפני ${Math.max(m, 1)} דק׳`;
  const h = Math.round(m / 60);
  if (h < 48) return `לפני ${h} שע׳`;
  return `לפני ${Math.round(h / 24)} ימים`;
}

const PRODUCT_HE: Record<string, string> = { analytic: 'אנליטית', '3d': '3-D', '2d': '2-D', complex: 'מרוכבים', server: 'שרת', workspace: 'workspace' };
export const productHe = (p: string | null) => (p ? (PRODUCT_HE[p] ?? p) : '—');

function chips(i: Issue): string {
  const out: string[] = [];
  const pr = priorityOf(i);
  if (pr !== '—') out.push(`<span class="chip ${pr === 'P1' ? 'bad' : pr === 'P2' ? 'warn' : ''}">${pr}</span>`);
  out.push(`<span class="chip">${kindOf(i)}</span>`);
  const p = productOf(i);
  if (p) out.push(`<span class="chip">${esc(productHe(p))}</span>`);
  if (i.labels.includes('wrong-answer')) out.push('<span class="chip bad" title="wrong-answer">⚠ תשובה שגויה</span>');
  if (i.labels.includes('reported')) out.push('<span class="chip" title="reported">👤 נתקל בזה אדם</span>');
  if (i.labels.includes('needs-operator')) out.push('<span class="chip warn">מחכה לך</span>');
  if (i.labels.includes('auto-ok')) out.push('<span class="chip good">תוכנית מאושרת</span>');
  if (!i.open) out.push(`<span class="chip">${i.reason === 'not_planned' ? 'נסגר בלי תיקון' : 'נסגר'}</span>`);
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
  { path: '', label: 'מה מחכה לי', kind: 'work' },
  { path: '/since', label: 'מה קרה', kind: 'console' },
  { path: '/plan', label: 'תוכנית וקצב', kind: 'console' },
  { path: '/live', label: 'מה באוויר', kind: 'console' },
  { path: '/backlog', label: 'Backlog', kind: 'console' },
  { path: '/usage', label: 'שימוש', kind: 'console' },
  { path: '/cost', label: 'עלות', kind: 'console' },
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
    ? `<div class="flash err">חלק מהנתונים לא נטענו, והחלקים שלהם מסומנים: ${esc(f.errors.join(' · '))}</div>`
    : '';
  const mode = f.writes === 'on' ? '' : f.writes === 'dry' ? '<span class="chip warn">מצב ניסיון: שום דבר לא נכתב ל-GitHub</span>' : '<span class="chip">קריאה בלבד</span>';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · ניהול Geo Builder</title><style>${CSS}</style></head><body>
<header class="top"><div class="in"><span class="brand">ניהול Geo Builder</span><nav>${nav}</nav>
<span class="meta">${mode}${f.ref !== 'main' ? `<span class="chip warn">קורא מהענף ${esc(f.ref)}</span>` : ''}<span title="${esc(f.asOf)}">נטען ${fmtTime(f.asOf)}</span>
<form method="post" action="${f.base}/refresh"><input type="hidden" name="csrf" value="${esc(f.csrf)}"><input type="hidden" name="back" value="${esc(current)}"><button class="ghost" type="submit">רענון</button></form>
<a href="${f.base}/logout">יציאה</a></span></div></header>
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
  return `<div class="btns"><button class="good" name="verdict" value="pass" type="submit">עבר ✓</button><button class="bad" name="verdict" value="fail" type="submit">נכשל ✗</button></div>`;
}

// ── 1 · what needs me ────────────────────────────────────────────────────────

export function homePage(f: Frame, nm: NeedsMe, now: string, summary: { fixed: number; filed: number; deploys: number; since: string }): string {
  const tiles = `<div class="tiles">
<a class="tile ${nm.p1.length ? 'bad' : 'good'}" href="#p1"><span class="n">${nm.p1.length}</span><span class="l">P1 פתוחים</span></a>
<a class="tile ${nm.decisions.length ? 'warn' : 'good'}" href="#decisions"><span class="n">${nm.decisions.length}</span><span class="l">החלטות שמחכות לך</span></a>
<a class="tile ${nm.prs.length ? 'warn' : 'good'}" href="#prs"><span class="n">${nm.prs.length}</span><span class="l">PRs לשחק ולאשר</span></a>
<a class="tile ${nm.audits.length ? 'warn' : 'good'}" href="#audits"><span class="n">${nm.audits.length}</span><span class="l">בדיקות מדגם</span></a>
<a class="tile ${nm.plans.length ? 'warn' : 'good'}" href="#plans"><span class="n">${nm.plans.length}</span><span class="l">תוכניות שמחכות לאישור</span></a>
<a class="tile" href="${f.base}/since"><span class="n">${summary.fixed}</span><span class="l">issues נסגרו מאז ${fmtTime(summary.since)} · ${summary.filed} נפתחו · ${summary.deploys} deploys</span></a>
</div>`;

  const p1 = `<section class="panel" id="p1"><div class="panel-head"><h2>P1: תשובה שגויה שאדם נתקל בה</h2><span class="note">נסגר רק בתיקון של session.</span></div>
${nm.p1.length ? `<ul class="list">${nm.p1.map((i) => issueRow(f.base, i)).join('')}</ul>` : '<p class="empty">אין P1 פתוחים.</p>'}</section>`;

  const decisions = `<section class="panel" id="decisions"><div class="panel-head"><h2>החלטות שמחכות לך</h2><span class="note">issues עם needs-operator. הפסיקה נכתבת ל-issue כתגובת «Operator ruling», והתווית יורדת.</span></div>
${nm.decisions.length ? nm.decisions.map((d) => `<div class="card hot"><div>${issueLink(f.base, d.issue)} ${ghLink(d.issue.n)}</div><div class="chips">${chips(d.issue)}</div>
<details><summary>השאלה</summary><div class="body">${linkify(f.base, d.question)}</div></details>
${form(f, '', { action: 'rule', issue: d.issue.n }, `${d.options.length ? `<div class="opts">${d.options.map((o) => `<label class="opt"><input type="radio" name="option" value="${o.key}"><span><b>${o.key}</b> · ${bdi(o.label)}${d.recommended === o.key ? '<span class="rec">מומלץ</span>' : ''}</span></label>`).join('')}</div>` : ''}
${noteBox(d.options.length ? 'הערה במילים שלך (תצוטט ב-issue)' : 'הפסיקה שלך, במילים שלך (תצוטט ב-issue)')}<div class="btns"><button type="submit">שליחת הפסיקה</button></div>`)}</div>`).join('') : '<p class="empty">אין החלטות פתוחות.</p>'}</section>`;

  const prs = `<section class="panel" id="prs"><div class="panel-head"><h2>PRs לשחק ולאשר</h2><span class="note">עבודה גמורה שמחכה שתשחק בה. התוצאה נכתבת כתגובה על ה-PR; ה-merge וה-deploy נשארים אצל session.</span></div>
${nm.prs.length ? nm.prs.map((p) => `<div class="card"><div><a class="num" href="${REPO_URL}/pull/${p.n}" target="_blank" rel="noopener">PR #${p.n}</a> <span class="t">${bdi(p.title)}</span></div>
<div class="note">סוגר: ${p.closes.map((n) => `<a href="${f.base}/issue?n=${n}">#${n}</a>`).join(' ') || '—'} · ענף <code>${esc(p.branch)}</code> · נפתח ${fmtDay(p.created)}</div>
${p.plays.length ? p.plays.map((b) => `<div><div class="note">כתובת: <code>${esc(b.path)}</code></div><pre class="lines">${esc(b.lines.join('\n'))}</pre>${b.note ? `<div class="note">${linkify(f.base, b.note)}</div>` : ''}</div>`).join('') : '<p class="note">ל-PR אין סעיף Play. <a href="' + REPO_URL + '/pull/' + p.n + '" target="_blank" rel="noopener">התיאור ב-GitHub ↗</a></p>'}
${form(f, '', { action: 'play', pr: p.n }, `${noteBox('מה ראית (חובה כשנכשל)')}${passFail()}`)}</div>`).join('') : '<p class="empty">אין PRs פתוחים.</p>'}</section>`;

  const audits = `<section class="panel" id="audits"><div class="panel-head"><h2>בדיקות מדגם</h2><span class="note">בערך אחד מכל עשרה מקרים שה-session סגר לבד מגיע אליך, כדי שהסגירה בלעדיך תישאר כנה. כישלון מחזיר את הסוג הזה אליך עד שלוש בדיקות נקיות.</span></div>
${nm.audits.length ? `<div class="grid2">${nm.audits.map((a) => `<div class="card"><div><b>${esc(a.sheet)} · ${esc(a.id)}</b> <span class="chip">${esc(productHe(a.product))}</span></div>
<div class="note">פתחו: <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)}</a> · דף נקי</div><pre class="lines">${esc(a.lines.join('\n'))}</pre>
<div><b>לחפש:</b> ${bdi(a.lookFor)}</div>${form(f, '', { action: 'audit', sheet: a.sheet, id: a.id }, `${noteBox('מה ראית (חובה כשנכשל)')}${passFail()}`)}</div>`).join('')}</div>` : '<p class="empty">אין בדיקות מדגם ממתינות.</p>'}</section>`;

  const plans = `<section class="panel" id="plans"><div class="panel-head"><h2>תוכניות שמחכות לאישור</h2><span class="note">issues עם תוכנית תיקון שיש בה שורת [proposed]: משהו שתלמיד יראה ושעוד לא פסקת. אישור מוסיף auto-ok עם תגובת ביקורת.</span></div>
${nm.plans.length ? nm.plans.map((p) => `<div class="card"><div>${issueLink(f.base, p.issue)} ${ghLink(p.issue.n)}</div><div class="chips">${chips(p.issue)}</div>
<ul>${p.proposed.map((l) => `<li>${bdi(l)}</li>`).join('')}</ul>
${form(f, '', { action: 'approve', issue: p.issue.n }, `${noteBox('הערה (לא חובה)')}<div class="btns"><button class="good" type="submit">אישור התוכנית</button><a href="${f.base}/issue?n=${p.issue.n}">פתיחת ה-issue</a></div>`)}</div>`).join('') : '<p class="empty">אין תוכניות שמחכות לאישור.</p>'}</section>`;

  const round = nm.round
    ? `<section class="panel"><div class="panel-head"><h2>הסבב שרץ עכשיו</h2>${ghLink(nm.round.issue.n, `#${nm.round.issue.n} ↗`)}</div><div class="t">${bdi(nm.round.issue.title)}</div>
<h3>מחכה לך</h3><div class="body">${linkify(f.base, nm.round.waiting ?? '(אין סעיף «Waiting on you»)')}</div></section>`
    : '';

  return page(f, '', 'מה מחכה לי', `כל מה שמחכה להחלטה, למשחק או לאישור שלך, במקום אחד. מה שתענה כאן נרשם ישר ב-GitHub. עודכן ${ago(now, now) === 'לפני 1 דק׳' ? 'עכשיו' : fmtTime(now)}.`, tiles + p1 + decisions + prs + audits + plans + round);
}

// ── 2 · since I last looked ──────────────────────────────────────────────────

export function sincePage(f: Frame, s: SinceLast, choices: { label: string; since: string }[]): string {
  const pick = `<div class="btns">${choices.map((c) => `<a class="chip${c.since === s.since ? ' good' : ''}" href="${f.base}/since?from=${encodeURIComponent(c.since)}">${esc(c.label)}</a>`).join('')}</div>`;
  const commits = s.commits.length
    ? `<ul class="list">${s.commits.slice(0, 80).map((c) => `<li class="row"><div><a class="num" href="${REPO_URL}/commit/${c.sha}" target="_blank" rel="noopener">${c.sha.slice(0, 8)}</a> <span class="t">${linkify(f.base, c.subject)}</span></div><span class="note">${fmtTime(c.date)}</span></li>`).join('')}</ul>${s.commits.length > 80 ? `<p class="note">ועוד ${s.commits.length - 80}.</p>` : ''}`
    : '<p class="empty">אין commits חדשים ב-main.</p>';
  const list = (xs: Issue[], empty: string) => (xs.length ? `<ul class="list">${xs.map((i) => issueRow(f.base, i)).join('')}</ul>` : `<p class="empty">${empty}</p>`);
  const deploys = s.deploys.length
    ? `<ul class="list">${s.deploys.map((d) => `<li><div><b>${esc(d.tag)}</b> · ${fmtDay(d.date)} · ${esc(d.apps)}</div><div class="note">${linkify(f.base, d.what.slice(0, 400))}${d.what.length > 400 ? '…' : ''}</div></li>`).join('')}</ul>`
    : '<p class="empty">אין deploys בתקופה.</p>';
  const round = s.round
    ? `<section class="panel"><div class="panel-head"><h2>סבב התיקונים האחרון</h2>${ghLink(s.round.n, `#${s.round.n} ↗`)}</div><div>${bdi(s.round.title)}</div><div class="note">${s.round.open ? 'רץ עכשיו' : `נסגר ${fmtTime(s.round.closed)}`}</div></section>`
    : '';
  return page(f, '/since', 'מה קרה מאז', `מאז ${fmtTime(s.since)}. ברירת המחדל היא הביקור הקודם שלך בדף הזה.`,
    `${pick}<div class="tiles"><div class="tile good"><span class="n">${s.fixed.length}</span><span class="l">issues נסגרו בתיקון</span></div><div class="tile"><span class="n">${s.shelved.length}</span><span class="l">נסגרו בלי תיקון (קרח, כפילות)</span></div><div class="tile warn"><span class="n">${s.filed.length}</span><span class="l">issues חדשים</span></div><div class="tile"><span class="n">${s.commits.length}</span><span class="l">commits ב-main</span></div><div class="tile"><span class="n">${s.deploys.length}</span><span class="l">deploys</span></div></div>
${round}
<section class="panel"><h2>Deploys</h2>${deploys}</section>
<section class="panel"><h2>נסגרו בתיקון</h2>${list(s.fixed, 'אין.')}</section>
<section class="panel"><h2>נפתחו</h2>${list(s.filed, 'אין.')}</section>
<section class="panel"><h2>נסגרו בלי תיקון</h2>${list(s.shelved, 'אין.')}</section>
<section class="panel"><h2>Commits ב-main</h2>${commits}</section>`);
}

// ── 3 · on pace ──────────────────────────────────────────────────────────────

function unitBlock(base: string, u: UnitRow): string {
  const total = u.questions.length || 1;
  const delta = u.greenWeekAgo == null ? '' : u.green - u.greenWeekAgo === 0 ? ' · ללא שינוי מלפני שבוע' : ` · ${u.green - u.greenWeekAgo > 0 ? '+' : ''}${u.green - u.greenWeekAgo} מלפני שבוע`;
  const qs = u.questions
    .filter((q) => q.status !== 'green')
    .map((q) => `<li class="row"><div><b>${esc(q.id)}</b> ${q.title ? bdi(q.title) : ''}${q.where ? ` <span class="note">${bdi(q.where)}</span>` : ''}${q.failing ? `<div class="note">${bdi(q.failing)}</div>` : ''}</div><div class="chips"><span class="chip ${q.status === 'red' ? 'bad' : q.status === 'partial' ? 'warn' : ''}">${q.status === 'red' ? 'נכשלת' : q.status === 'partial' ? 'חלקית' : 'עוד לא הוקלדה'}</span>${q.issue ? `<a href="${base}/issue?n=${q.issue}">#${q.issue}</a>` : ''}</div></li>`)
    .join('');
  return `<div class="card"><div class="panel-head"><h3>${esc(u.name)} <span class="note">· ${esc(productHe(u.builder))} · ${fmtDay(u.from)}${u.to ? ` – ${fmtDay(u.to)}` : ''}</span></h3><b>${u.green} / ${u.questions.length} נבנות</b></div>
<div class="bar" title="${u.green} נבנות · ${u.partial} חלקית · ${u.red} נכשלות · ${u.untried} עוד לא הוקלדו"><i class="g" style="width:${(u.green / total) * 100}%"></i><i class="p" style="width:${(u.partial / total) * 100}%"></i><i class="r" style="width:${(u.red / total) * 100}%"></i><i class="u" style="width:${(u.untried / total) * 100}%"></i></div>
<div class="note">${u.green} נבנות · ${u.partial} חלקית (חלק מהתמלולים עוד נכשל) · ${u.red} נכשלות · ${u.untried} עוד לא הוקלדו${delta}${u.measuredAt ? ` · נמדד ${fmtDay(u.measuredAt)}${u.commit ? ` על ${esc(u.commit.slice(0, 8))}` : ''}` : ' · עוד לא נמדד'}</div>
${qs ? `<details class="more"><summary>השאלות שעוד לא נבנות במלואן (${u.partial + u.red + u.untried})</summary><ul class="list">${qs}</ul></details>` : ''}</div>`;
}

function boardRow(base: string, r: WsRow, weeks: number, cur: number): string {
  const cells = Array.from({ length: weeks }, (_, k) => {
    const w = k + 1;
    const on = w >= r.ws.from && w <= r.ws.to;
    return `<div class="cell${on ? ` on st-${r.status}` : ''}"${w === cur ? ' style="outline:2px solid var(--fg);outline-offset:-1px"' : ''}></div>`;
  }).join('');
  const facts = r.ws.milestone ? 'אתה משחק את הגיליון' : `${r.closed} מתוך ${r.open + r.closed} סגורים${r.bugOpen ? ` · ${r.bugOpen} bugs` : ''}${r.featOpen ? ` · ${r.featOpen} features` : ''}${r.needs ? ` · ${r.needs} מחכים לך` : ''}`;
  const issues = r.ws.issues.map((n) => `<a href="${base}/issue?n=${n}">#${n}</a>`).join(' ');
  return `<tr><td><details><summary><b>${bdi(r.ws.name)}</b></summary>${r.ws.goal ? `<div class="note">${bdi(r.ws.goal)}</div>` : ''}<div class="note">${issues || '—'}</div></details>
<div class="note"><span class="st-${r.status}"><b>${STATUS_LABEL[r.status]}</b></span> · ${esc(facts)}</div><div class="note">${esc(r.why)}</div></td>
<td><div class="weeks" style="grid-template-columns:repeat(${weeks},1fr)">${cells}</div></td></tr>`;
}

export function planPage(f: Frame, p: Pace): string {
  if (!p.plan) {
    return page(f, '/plan', 'תוכנית וקצב', 'קובץ התוכנית ops/plan.json לא נמצא בענף הזה.', p.units.length ? p.units.map((u) => unitBlock(f.base, u)).join('') : '');
  }
  const plan = p.plan;
  const W = plan.weeks.length;
  const behind = p.rows.filter((r) => r.status === 'behind').length;
  const tiles = `<div class="tiles">
<div class="tile ${behind ? 'bad' : 'good'}"><span class="n">${Math.min(p.week, W)}<small> / ${W}</small></span><span class="l">${p.week > W ? 'התוכנית הסתיימה' : `שבוע ${p.week}`} · ${behind ? `${behind} שורות בפיגור` : 'אין שורה בפיגור'}</span></div>
<div class="tile ${p.planClosed >= p.expected ? 'good' : 'warn'}"><span class="n">${p.planClosed}<small> / ${p.planOpen + p.planClosed}</small></span><span class="l">issues של התוכנית סגורים · צפוי עד היום: ${p.expected}</span></div>
<div class="tile ${p.outside.length ? 'warn' : 'good'}"><span class="n">${p.outside.length}</span><span class="l">P1/P2 מחוץ לתוכנית</span></div>
</div>`;
  const cal = plan.calendar
    ? `<section class="panel"><h2>לוח ההוראה</h2><ul class="list">${plan.calendar.topics.map((t) => `<li class="row"><div><b>${bdi(t.name)}</b></div><span class="note">${fmtDay(t.from)}${t.to ? ` – ${fmtDay(t.to)}` : ' – (סוף לא נקבע)'}</span></li>`).join('')}</ul>${plan.calendar.note ? `<p class="note">${bdi(plan.calendar.note)}</p>` : ''}</section>`
    : '';
  const groups = plan.groups.map((g) => {
    const rows = p.rows.filter((r) => r.ws.p === g.p);
    if (!rows.length) return '';
    return `<tr><th colspan="2">${bdi(g.label)}</th></tr>${rows.map((r) => boardRow(f.base, r, W, p.week)).join('')}`;
  }).join('');
  const weekHead = plan.weeks.map((w) => `<div class="wk${w.n === p.week ? ' cur' : ''}">${w.n}<br>${esc(w.label)}</div>`).join('');
  const board = `<section class="panel"><div class="panel-head"><h2>התוכנית, שבוע אחר שבוע</h2><span class="note">בקצב: issues נסגרים לפחות בקצב שבו עוברים השבועות של השורה. לשים לב: לאט יותר. בפיגור: מתחת ל-60% מהקצב, או אחרי השבוע האחרון שלה עם עבודה פתוחה.</span></div>
<div class="scroll"><table><thead><tr><th style="width:45%">שורת עבודה</th><th><div class="weeks" style="grid-template-columns:repeat(${W},1fr)">${weekHead}</div></th></tr></thead><tbody>${groups}</tbody></table></div></section>`;
  const units = `<section class="panel"><div class="panel-head"><h2>מוכנות היחידות</h2><span class="note">«מוכן» = שאלות הבגרות של היחידה ודוגמאות הספר שאתה בודק נבנות בקלות ונכון (26 באוק׳). שאלה שעוד לא הוקלדה נספרת כ«עוד לא נוסתה», לא נעלמת.</span></div>
${p.units.length ? p.units.map((u) => unitBlock(f.base, u)).join('') : '<p class="empty">מפת היחידות (ops/units.json) לא נמצאה.</p>'}</section>`;
  const weeks = plan.weeks.filter((w) => w.n >= Math.max(p.week, 1));
  const outside = `<section class="panel"><div class="panel-head"><h2>מחוץ לתוכנית</h2><span class="note">P1/P2 פתוחים באנליטית וב-3-D שאף שורה לא מכילה. סבב תיקונים לא לוקח אותם אלא אם תמשוך אותם לשבוע (כלל A, 30 באוק׳).</span></div>
${p.outside.length ? `<ul class="list">${p.outside.slice(0, 40).map((i) => `<li class="row"><div>${issueLink(f.base, i)}<div class="chips">${chips(i)}</div></div><div>${form(f, '/plan', { action: 'pull', issue: i.n }, `<div class="btns"><select name="week" aria-label="שבוע">${weeks.map((w) => `<option value="${w.n}">שבוע ${w.n} · ${esc(w.label)}</option>`).join('')}</select><button type="submit" class="ghost">משיכה לשבוע</button></div>`)}</div></li>`).join('')}</ul>${p.outside.length > 40 ? `<p class="note">ועוד ${p.outside.length - 40}.</p>` : ''}` : '<p class="empty">אין.</p>'}</section>`;
  const pulled = p.pulled.length
    ? `<section class="panel"><h2>נמשכו לתוכנית (${p.pulled.length})</h2><details class="more"><summary>הרשימה</summary><ul class="list">${p.pulled.slice().reverse().map((x) => `<li class="row"><div>${x.issue ? issueLink(f.base, x.issue) : `<a class="num" href="${f.base}/issue?n=${x.n}">#${x.n}</a>`}<div class="note">שבוע ${x.week} · ${fmtDay(x.at)} · ${bdi(x.by)}</div></div><div class="chips">${x.issue ? chips(x.issue) : ''}</div></li>`).join('')}</ul></details></section>`
    : '';
  return page(f, '/plan', 'תוכנית וקצב', `${bdi(plan.title)}. השנה הולכת לפי ההוראה שלך.`, tiles + units + board + cal + outside + pulled);
}

// ── 4 · live ─────────────────────────────────────────────────────────────────

export function livePage(f: Frame, l: ReturnType<typeof import('./sections').live>): string {
  const head = l.live
    ? `<div class="tiles"><div class="tile"><span class="n" style="font-size:1.2rem">${esc(l.live.tag)}</span><span class="l">ה-deploy האחרון · ${fmtTime(l.live.date)}</span></div><div class="tile ${l.live.aheadBy ? 'warn' : 'good'}"><span class="n">${l.live.aheadBy}</span><span class="l">commits ב-main שעוד לא באוויר</span></div></div>`
    : '<p class="empty">לא נמצא tag של prod.</p>';
  const apps = `<section class="panel"><h2>לכל כלי: ה-deploy האחרון שכלל אותו</h2><ul class="list">${l.perApp.map((a) => `<li class="row"><div><b>${esc(a.he)}</b>${a.path ? ` · <a href="https://themathbible.com${a.path}" target="_blank" rel="noopener">${a.path}</a>` : ''}</div><span class="note">${a.last ? `${esc(a.last.tag)} · ${fmtDay(a.last.date)}` : '—'}</span></li>`).join('')}</ul></section>`;
  const ahead = l.live && l.live.ahead.length
    ? `<section class="panel"><h2>ב-main ועוד לא באוויר</h2><ul class="list">${l.live.ahead.map((c) => `<li class="row"><div><a class="num" href="${REPO_URL}/commit/${c.sha}" target="_blank" rel="noopener">${c.sha.slice(0, 8)}</a> <span class="t">${linkify(f.base, c.subject)}</span></div><span class="note">${fmtTime(c.date)}</span></li>`).join('')}</ul></section>`
    : '';
  const log = `<section class="panel"><h2>יומן ה-deploys</h2><ul class="list">${l.deploys.map((d) => `<li><div><b>${esc(d.tag)}</b> · ${fmtDay(d.date)} · <code>${esc(d.commit)}</code> · ${esc(d.apps)}</div><details class="more"><summary>מה השתנה</summary><div class="body">${linkify(f.base, d.what)}</div></details></li>`).join('')}</ul><p class="note">מקור: docs/DEPLOY-LOG.md.</p></section>`;
  return page(f, '/live', 'מה באוויר', 'מה רץ ב-themathbible.com עכשיו, ומה כבר ב-main ומחכה ל-deploy.', head + apps + ahead + log);
}

// ── 5 · backlog ──────────────────────────────────────────────────────────────

export function backlogPage(f: Frame, b: ReturnType<typeof import('./sections').backlog>, now: string): string {
  const dirs = b.directions.length
    ? `<section class="panel"><div class="panel-head"><h2>לאן הכלים יכולים לגדול</h2><span class="note">הכיוונים מ«מפת הדרכים» (${fmtDay(b.directionsAsOf)}); המספרים חיים מ-GitHub.</span></div>
${b.directions.map((p) => `<details${p.id === 'analytic' || p.id === '3d' ? ' open' : ''}><summary><b>${esc(p.name)}</b> <span class="note">· ${esc(p.stage)} · ${p.directions.length} כיוונים</span></summary><div class="scroll"><table><thead><tr><th>כיוון</th><th>מה מקבלים</th><th>מצב</th><th class="n">פתוחים</th><th>issues</th></tr></thead><tbody>
${p.directions.map((d) => `<tr><td><b>${bdi(d.name)}</b>${d.size ? ` <span class="note">${esc(d.size)}</span>` : ''}</td><td>${bdi(d.what)}</td><td>${d.status ? bdi(d.status) : ''}</td><td class="n">${d.open}/${d.open + d.closed}</td><td>${d.issues.map((n) => `<a href="${f.base}/issue?n=${n}">#${n}</a>`).join(' ') || '—'}</td></tr>`).join('')}
</tbody></table></div>${p.longTail ? `<p class="note">${linkify(f.base, p.longTail)}</p>` : ''}${p.outOfScope ? `<p class="note">${linkify(f.base, p.outOfScope)}</p>` : ''}</details>`).join('')}
${b.threads ? `<p class="note">${linkify(f.base, b.threads)}</p>` : ''}</section>`
    : '';
  const prodBlocks = b.byProduct.filter((p) => p.rows.length).map((p) => {
    const outside = p.rows.filter((r) => !r.inPlan);
    return `<details><summary><b>${esc(productHe(p.product))}</b> <span class="note">· ${p.rows.length} features פתוחים · ${outside.length} לא בתוכנית</span></summary>
<ul class="list">${p.rows.map((r) => `<li class="row"><div>${issueLink(f.base, r.issue)}<div class="note">פתוח ${r.ageDays} ימים${r.inPlan ? ' · בתוכנית' : ''}</div></div><div class="chips">${chips(r.issue)}</div></li>`).join('')}</ul></details>`;
  }).join('');
  const later = b.later.length ? `<ul class="list">${b.later.map((i) => issueRow(f.base, i)).join('')}</ul>` : '<p class="empty">אין.</p>';
  const parked = b.parked.length ? `<details class="more"><summary>${b.parked.length} issues בקרח</summary><ul class="list">${b.parked.map((i) => issueRow(f.base, i)).join('')}</ul></details>` : '<p class="empty">אין.</p>';
  return page(f, '/backlog', 'Backlog', `features שאנחנו לא מגיעים אליהם: ${b.total} פתוחים, ${b.total - b.inPlan} מהם לא בתוכנית. הוותיקים ראשונים. עודכן ${fmtTime(now)}.`,
    `${dirs}<section class="panel"><h2>features פתוחים לפי כלי, הוותיקים ראשונים</h2>${prodBlocks || '<p class="empty">אין.</p>'}</section>
<section class="panel"><h2>מסומנים «later»</h2>${later}</section><section class="panel"><h2>בקרח (icebox)</h2>${parked}</section>`);
}

// ── 6 · usage ────────────────────────────────────────────────────────────────

const trend = (a: number, b: number) => (b === 0 ? (a ? '↑' : '') : a > b ? `↑ ${Math.round(((a - b) / b) * 100)}%` : a < b ? `↓ ${Math.round(((b - a) / b) * 100)}%` : '=');

export function usagePage(f: Frame, us: BuilderUsage[], mineCount: number, now: string, days = 7): string {
  const span = days === 7 ? '7 ימים' : `${days} ימים`;
  const pick = `<div class="btns">${[7, 30].map((d) => `<a class="chip${d === days ? ' good' : ''}" href="${f.base}/usage${d === 7 ? '' : '?days=30'}">${d === 7 ? 'השבוע' : '30 ימים'}</a>`).join('')}</div>`;
  const cards = `<div class="tiles">${us.map((u) => `<div class="tile"><span class="l"><b>${esc(u.builder.he)}</b></span>${u.hasLog
    ? `<span class="n">${u.week.visitors}</span><span class="l">מבקרים ב-${span} ${esc(trend(u.week.visitors, u.prevWeek.visitors))} · ${u.week.sessions} sessions · ${u.week.submits} שורות · ${u.week.failed} נכשלו</span>`
    : '<span class="l">אין לכלי הזה יומן אירועים בשרת הזה.</span>'}</div>`).join('')}</div>`;
  const tables = us.filter((u) => u.hasLog).map((u) => {
    const rows = u.groups.slice(0, 60).map((g) => {
      const link = u.builder.admin && g.sessions[0] ? `${u.builder.admin}?view=sessions&sid=${encodeURIComponent(g.sessions[0])}` : '';
      const still = g.stillFails == null ? '<span class="chip">לא נבדק</span>' : g.stillFails ? '<span class="chip bad">עדיין נכשל</span>' : '<span class="chip good">עובד היום</span>';
      const issue = g.issue ? `<a href="${f.base}/issue?n=${g.issue.n}">#${g.issue.n}</a>${g.issue.open ? '' : ' <span class="chip">' + (g.issue.labels.includes('icebox') ? 'בקרח: משתמש נתקל בפער ידוע' : 'סגור') + '</span>'}` : '<span class="chip warn">אין issue</span>';
      const fileForm = !g.issue && g.stillFails !== false
        ? form(f, '/usage', { action: 'file', builder: u.builder.id, line: g.line, outcome: g.outcome, sessions: g.sessions.slice(0, 5).join(' '), link: link ? `https://themathbible.com${link}` : '' }, '<button class="ghost" type="submit">פתיחת issue</button>')
        : '';
      return `<tr><td><span class="lines" style="display:inline-block;padding:2px 6px">${esc(g.line)}</span></td><td>${esc(FAILED_LABEL[g.outcome] ?? g.outcome)}</td><td class="n">${g.sessions.length}</td><td class="n">${g.count}</td><td>${still}</td><td>${issue}</td><td>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">timeline</a>` : '—'}</td><td>${fileForm}</td></tr>`;
    }).join('');
    return `<section class="panel"><div class="panel-head"><h2>${esc(u.builder.he)}: מה משתמשים אמיתיים לא הצליחו (${span})</h2><span class="note">${u.verdictsAge ? `«עובד היום» לפי מפת ה-triage מ-${fmtDay(u.verdictsAge)}` : 'אין מפת triage: לא ידוע אם השורות עדיין נכשלות'}${u.mine.submits ? ` · ${u.mine.submits} שורות שלך הוצאו מהספירה` : ''}</span></div>
${rows ? `<div class="scroll"><table><thead><tr><th>השורה</th><th>מה קרה</th><th class="n">sessions</th><th class="n">פעמים</th><th>היום</th><th>issue</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${u.groups.length > 60 ? `<p class="note">ועוד ${u.groups.length - 60} שורות.</p>` : ''}` : `<p class="empty">אף שורה לא נכשלה ב-${span}.</p>`}</section>`;
  }).join('');
  return page(f, '/usage', 'שימוש', `${span} האחרונים מול ${span} שלפניהם. ${mineCount ? `המכשירים שמהם נכנסת לדף הזה (${mineCount}) לא נספרים.` : 'עדיין לא זוהה מכשיר שלך: הכניסה לדף הזה מסמנת את המכשיר שלך.'} עודכן ${fmtTime(now)}.`, pick + cards + tables);
}

// ── 7 · cost ─────────────────────────────────────────────────────────────────

export function costPage(f: Frame, rows: ReturnType<typeof import('./sections').cost>): string {
  const body = rows.length
    ? `<div class="scroll"><table><thead><tr><th>סבב</th><th>תאריך</th><th class="n">שעות</th><th class="n">תיקונים ב-main</th><th class="n">מחכים לאישור</th><th class="n">issues נפתחו</th><th class="n">נמצאו ותוקנו בסבב</th><th class="n">הדקות שלך</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${ghLink(r.issue.n, `#${r.issue.n}`)} ${r.running ? '<span class="chip warn">רץ</span>' : ''}<div class="note">${bdi(r.issue.title.replace(/^fix-round\s*/i, '').slice(0, 90))}</div></td><td>${fmtDay(r.date)}</td><td class="n">${r.hours}</td>
<td class="n">${r.queue?.onMain ?? '—'}</td><td class="n">${r.queue?.onApproval ?? '—'}</td><td class="n">${r.queue?.filed ?? '—'}</td><td class="n">${r.queue?.foundInRound ?? '—'}</td><td class="n">${r.minutes == null ? '—' : `≈${r.minutes}`}</td></tr>`).join('')}
</tbody></table></div><p class="note">מתוך שורות ה-ledger של כל סבב (queue: / operator:). «—» = הסבב לא כתב את השדה. הדקות שלך הן הערכה: 3 לכל מקרה 🎮, 1 לכל בדיקת מדגם.</p>`
    : '<p class="empty">לא נמצאו סבבי תיקונים.</p>';
  return page(f, '/cost', 'כמה עולה שינוי', 'לכל סבב תיקונים: כמה זמן רץ, כמה תיקונים נחתו ב-main, כמה issues חדשים פתח, וכמה זמן שלך הוא דרש.', `<section class="panel">${body}</section>`);
}

// ── an issue's own page: read it, act on it ──────────────────────────────────

export function issuePage(f: Frame, i: Issue | null, n: number): string {
  if (!i) return page(f, '/issue', `#${n}`, 'ה-issue לא נמצא בנתונים שנטענו (פתוח, או עודכן מאז תחילת התוכנית).', `<p>${ghLink(n, 'לפתוח ב-GitHub ↗')}</p>`);
  const back = `/issue?n=${i.n}`;
  const cur = ['P1', 'P2', 'P3', 'later'].filter((p) => i.labels.includes(p)).join(',');
  const acts = i.open
    ? `<section class="panel"><h2>פעולות</h2><div class="grid2">
<div class="card"><h3>הערה או פסיקה</h3>${form(f, back, { action: i.labels.includes('needs-operator') ? 'rule' : 'note', issue: i.n }, `${noteBox(i.labels.includes('needs-operator') ? 'הפסיקה שלך (תסיר את needs-operator)' : 'ההערה שלך', !i.labels.includes('needs-operator'))}<div class="btns"><button type="submit">שליחה</button></div>`)}</div>
<div class="card"><h3>עדיפות</h3>${form(f, back, { action: 'priority', issue: i.n, from: cur }, `<div class="btns"><select name="to">${['P1', 'P2', 'P3', 'later'].map((p) => `<option${i.labels.includes(p) ? ' selected' : ''}>${p}</option>`).join('')}</select></div>${noteBox('למה (לא חובה)')}<div class="btns"><button type="submit" class="ghost">שינוי עדיפות</button></div>`)}</div>
<div class="card"><h3>לקרח</h3>${form(f, back, { action: 'park', issue: i.n }, `${noteBox('למה זה נדחה (חובה)', true)}<div class="btns"><button type="submit" class="bad">העברה לקרח וסגירה</button></div>`)}</div>
${!i.labels.includes('auto-ok') && /what the student will see/i.test(i.body) ? `<div class="card"><h3>אישור התוכנית</h3>${form(f, back, { action: 'approve', issue: i.n }, `${noteBox('הערה (לא חובה)')}<div class="btns"><button type="submit" class="good">אישור (auto-ok)</button></div>`)}</div>` : ''}
</div></section>`
    : '';
  return page(f, '/issue', `#${i.n}`, `${bdi(i.title)}`,
    `<div class="chips">${chips(i)}</div><div class="note">נפתח ${fmtDay(i.created)} · עודכן ${fmtTime(i.updated)} · ${i.comments} תגובות · ${ghLink(i.n, 'GitHub, עם התגובות ↗')}</div>
${acts}<section class="panel"><h2>התיאור</h2><div class="body" style="max-height:none">${linkify(f.base, i.body)}</div></section>`);
}

// ── login ────────────────────────────────────────────────────────────────────

export function loginPage(base: string, opts: { error: boolean; totp: boolean; disabled: boolean }): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>כניסה · ניהול Geo Builder</title><style>${CSS}
.login{max-width:360px;margin:12vh auto;padding:0 16px}</style></head><body><div class="login"><section class="panel"><h1>ניהול Geo Builder</h1>
${opts.disabled ? '<p class="flash err">הדף כבוי: חסרים בשרת שם משתמש, סיסמה או סוד חתימה.</p>' : `${opts.error ? '<p class="flash err">הפרטים לא נכונים.</p>' : ''}
<form method="post" action="${base}/login"><label>שם משתמש<input type="text" name="username" autocomplete="username" required></label>
<label>סיסמה<input type="password" name="password" autocomplete="current-password" required style="font:inherit;border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%"></label>
${opts.totp ? '<label>קוד מאפליקציית האימות<input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label>' : ''}
<button type="submit">כניסה</button></form>`}</section></div></body></html>`;
}

/** The dry-run page: what an action WOULD write, nothing sent. */
export function dryRunText(writes: { op: string; issue?: number; labels?: string[]; label?: string; path?: string; title?: string }[]): string {
  const what = writes.map((w) => {
    switch (w.op) {
      case 'comment': return `תגובה ב-#${w.issue}`;
      case 'addLabels': return `label ${w.labels?.join(', ')} ל-#${w.issue}`;
      case 'removeLabel': return `הסרת label ${w.label} מ-#${w.issue}`;
      case 'close': return `סגירת #${w.issue} כ-not planned`;
      case 'create': return `issue חדש «${w.title}»`;
      case 'editJson': return `commit ל-${w.path}`;
      default: return w.op;
    }
  });
  return `מצב ניסיון: הפעולה תקינה ולא נשלחה. היא הייתה כותבת: ${what.join(' · ')}.`;
}
