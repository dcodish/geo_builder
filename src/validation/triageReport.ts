/**
 * Triage report (Option A) — renders replayed production sessions as a self-contained HTML page so the
 * operator can decide, BEFORE any code changes, what a fix-loop should and should NOT touch.
 *
 * The report never asserts "this is a bug". It separates the log's failures into:
 *   - collisions (`empty`)      — data-entry: re-declaring existing points → an ERROR-MESSAGE issue.
 *   - coverage-gaps             — the grammar didn't match. Each is gated by an operator VERDICT
 *                                 (in-scope / out-of-scope / feature / noise) so the loop only ever
 *                                 closes the gap between *claimed* scope (the catalog) and coverage.
 *   - amber (`ok-amber`)        — the engine built a figure that violates its own givens → a real bug
 *                                 (unless the givens are contradictory — an operator call).
 *
 * Pure: `buildTriageHtml(sessions, verdicts) -> string`. The slow replay that produces `sessions`
 * runs separately (dump → JSON); this stays cheap so verdicts can be iterated without re-replaying.
 */

export interface StepData {
  utterance: string;
  category: 'ok' | 'ok-amber' | 'deferred' | 'empty' | 'coverage-gap' | 'edit';
  outcome: string;
  committed: boolean;
  alreadyDefined?: string[];
  detail?: string;
}
export interface SessionData {
  sid: string;
  rel?: string;
  locale?: string;
  startedAt?: string;
  /** Set (to the session's step count) when the session was too long/coupled to replay cheaply. */
  deferred?: number;
  prodOutcomes: string[];
  finalViolations: string[];
  lastError: string | null;
  threw?: string;
  steps?: StepData[];
}

export type Scope = 'in-scope' | 'out-of-scope' | 'feature' | 'noise';
export interface Verdict {
  scope: Scope;
  /** One-line operator/oracle note explaining the verdict. */
  note: string;
  /** For in-scope gaps: the canonical command line(s) the parser should produce. */
  proposal?: string;
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Normalise an utterance for grouping (trim + collapse internal whitespace). */
export const normUtt = (u: string): string => u.trim().replace(/\s+/g, ' ');

const SCOPE_LABEL: Record<Scope | 'needs-review', string> = {
  'in-scope': 'בתחום — לתקן',
  'out-of-scope': 'מחוץ לתחום',
  feature: 'פיצ׳ר חדש',
  noise: 'רעש / שגיאת קלט',
  'needs-review': 'ממתין לבדיקה',
};
const SCOPE_COLOR: Record<Scope | 'needs-review', string> = {
  'in-scope': '#16a34a',
  'out-of-scope': '#6b7280',
  feature: '#0ea5e9',
  noise: '#d97706',
  'needs-review': '#dc2626',
};
const CAT_COLOR: Record<StepData['category'], string> = {
  ok: '#16a34a',
  'ok-amber': '#dc2626',
  deferred: '#0ea5e9',
  empty: '#d97706',
  'coverage-gap': '#7c3aed',
  edit: '#6b7280',
};

interface GapRow {
  utt: string;
  count: number;
  locales: Set<string>;
  rels: Set<string>;
}

export function buildTriageHtml(sessions: SessionData[], verdicts: Record<string, Verdict>): string {
  // ── aggregate ──────────────────────────────────────────────────────────────
  const gaps = new Map<string, GapRow>();
  const amber: { sid: string; utt: string; detail?: string }[] = [];
  const collisions = new Map<string, { count: number; ids: Set<string> }>();
  const totals = { ok: 0, 'ok-amber': 0, deferred: 0, empty: 0, 'coverage-gap': 0, edit: 0 } as Record<string, number>;
  let threw = 0;

  for (const s of sessions) {
    if (s.threw) threw++;
    for (const st of s.steps ?? []) {
      totals[st.category]++;
      if (st.category === 'coverage-gap') {
        const key = normUtt(st.utterance);
        const row = gaps.get(key) ?? { utt: key, count: 0, locales: new Set(), rels: new Set() };
        row.count++;
        if (s.locale) row.locales.add(s.locale);
        if (s.rel) row.rels.add(s.rel);
        gaps.set(key, row);
      } else if (st.category === 'ok-amber') {
        amber.push({ sid: s.sid, utt: st.utterance, detail: st.detail });
      } else if (st.category === 'empty' && st.alreadyDefined?.length) {
        const key = normUtt(st.utterance);
        const c = collisions.get(key) ?? { count: 0, ids: new Set<string>() };
        c.count++;
        st.alreadyDefined.forEach((id) => c.ids.add(id));
        collisions.set(key, c);
      }
    }
  }

  const verdictOf = (utt: string): Verdict | { scope: 'needs-review'; note: string } =>
    verdicts[normUtt(utt)] ?? { scope: 'needs-review', note: '' };

  // group counts for the headline: how many DISTINCT gaps fall in each scope
  const scopeCounts: Record<string, number> = {};
  for (const g of gaps.values()) {
    const v = verdictOf(g.utt);
    scopeCounts[v.scope] = (scopeCounts[v.scope] ?? 0) + 1;
  }

  // ── pieces ───────────────────────────────────────────────────────────────────
  const card = (n: string | number, l: string, color = '#111827') =>
    `<div class="card"><div class="n" style="color:${color}">${esc(n)}</div><div class="l">${esc(l)}</div></div>`;

  const gapRows = [...gaps.values()]
    .sort((a, b) => b.count - a.count)
    .map((g) => {
      const v = verdictOf(g.utt);
      const color = SCOPE_COLOR[v.scope];
      return `<tr>
        <td class="cnt">${g.count}</td>
        <td><code>${esc(g.utt)}</code></td>
        <td class="muted">${[...g.locales].join(',')}</td>
        <td><span class="pill" style="background:${color}1a;color:${color};border-color:${color}55">${esc(SCOPE_LABEL[v.scope])}</span></td>
        <td class="muted">${esc(v.note)}</td>
        <td>${(v as Verdict).proposal ? `<code class="prop">${esc((v as Verdict).proposal)}</code>` : ''}</td>
      </tr>`;
    })
    .join('');

  const amberRows = amber.length
    ? amber.map((a) => `<tr><td class="muted">${esc(a.sid)}</td><td><code>${esc(a.utt)}</code></td><td class="muted">${esc(a.detail ?? '')}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">אין — אף figure שעבר את הפרסר לא הפר את הנתונים שלו (בריצה זו)</td></tr>';

  const collisionRows = [...collisions.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([utt, c]) => `<tr><td class="cnt">${c.count}</td><td><code>${esc(utt)}</code></td><td class="muted">${[...c.ids].sort().join(', ')}</td></tr>`)
    .join('');

  // per-session threads (the fix for the flat-list interleaving) — newest first
  const deferredCount = sessions.filter((s) => s.deferred).length;
  const sessionBlocks = [...sessions]
    .reverse()
    .map((s) => {
      const head = `<b>${esc(s.sid)}</b> · ${esc((s.startedAt ?? '').replace('T', ' ').slice(0, 16))} · ${esc(s.locale ?? '')} ${s.rel ? '· ' + esc(s.rel) : ''}${s.deferred ? ` · <span class="muted">לא הורץ — ${s.deferred} צעדים (figure כבד)</span>` : ''}`;
      const body = s.deferred
        ? `<div class="muted">session ארוך/כבד — נדחה מההרצה המהירה. ניסוחים שהלוג רשם:<br>${s.prodOutcomes.map(esc).join(' · ')}</div>`
        : s.threw
        ? `<div class="muted">החזיר שגיאה: ${esc(s.threw)}</div>`
        : (s.steps ?? [])
            .map((st) => {
              const c = CAT_COLOR[st.category];
              const tag = `<span class="tag" style="background:${c}1a;color:${c}">${esc(st.category)}</span>`;
              const extra = st.alreadyDefined?.length ? ` <span class="muted">(כבר קיימים: ${esc(st.alreadyDefined.join(','))})</span>` : st.detail ? ` <span class="muted">${esc(st.detail)}</span>` : '';
              return `<div class="step">${tag} <code>${esc(st.utterance)}</code>${extra}</div>`;
            })
            .join('');
      const bad = (s.steps ?? []).some((st) => st.category === 'coverage-gap' || st.category === 'ok-amber');
      return `<details${bad ? ' open' : ''}><summary>${head}</summary>${body}${s.finalViolations.length ? `<div class="viol">⚠ ${s.finalViolations.map(esc).join('<br>')}</div>` : ''}</details>`;
    })
    .join('');

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Geo Builder — דוח טריאז׳ של כשלים</title>
<style>
 *{box-sizing:border-box}
 body{font-family:'Segoe UI',Arial,sans-serif;margin:0;background:#f4f6f9;color:#1f2937}
 .wrap{max-width:1100px;margin:0 auto;padding:24px}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:0 0 12px}
 .sub{color:#6b7280;font-size:13px;margin-bottom:20px}
 .cards{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
 .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;flex:1 1 130px;min-width:130px}
 .card .n{font-size:24px;font-weight:700} .card .l{font-size:12px;color:#6b7280;margin-top:2px}
 .panel{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin-bottom:20px}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{text-align:right;padding:7px 8px;border-bottom:1px solid #f0f1f3;vertical-align:top}
 th{color:#6b7280;font-weight:600}
 td.cnt{font-weight:700;width:40px;color:#374151} .muted{color:#9ca3af}
 code{background:#f3f4f6;padding:1px 6px;border-radius:4px;font-size:12px;direction:rtl;display:inline-block}
 code.prop{background:#ecfdf5;color:#065f46;direction:ltr}
 .pill{border:1px solid;border-radius:12px;padding:2px 9px;font-size:11px;white-space:nowrap}
 .tag{border-radius:5px;padding:1px 7px;font-size:11px;font-weight:600;margin-left:6px}
 details{border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;background:#fff;padding:4px 10px}
 summary{cursor:pointer;font-size:13px;padding:6px 2px}
 .step{padding:3px 0;font-size:13px} .viol{color:#b45309;font-size:12px;margin:6px 0 4px;padding:6px 8px;background:#fffbeb;border-radius:6px}
 .legend{font-size:12px;color:#6b7280;margin-bottom:16px}
 .note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:20px;color:#1e3a8a}
</style></head><body><div class="wrap">
 <h1>דוח טריאז׳ — כשלים מהלוג בייצור</h1>
 <div class="sub">${sessions.length} sessions עם כשל · ${sessions.length - deferredCount} הורצו · ${deferredCount} נדחו (ארוכים/כבדים) · ${threw} שגיאת ריצה</div>

 <div class="note"><b>איך לקרוא:</b> הדוח לא קובע "זה באג". הוא מפריד את הכשלים כדי שתחליט <b>לפני</b> כל שינוי קוד מה לולאת-תיקון צריכה לגעת בו. רק שורות שסומנו <b>בתחום — לתקן</b> מיועדות לתיקון; <b>מחוץ לתחום / רעש</b> לא ייגעו; <b>פיצ׳ר</b> נדחה כבקשה.</div>

 <div class="cards">
   ${card(totals.ok, 'צעדים שנבנו (ok)', CAT_COLOR.ok)}
   ${card(totals.empty, 'התנגשות עם קיים (data-entry)', CAT_COLOR.empty)}
   ${card(totals['coverage-gap'], 'פערי דקדוק (צעדים)', CAT_COLOR['coverage-gap'])}
   ${card(amber.length, 'figure שגוי (amber/באג)', CAT_COLOR['ok-amber'])}
 </div>
 <div class="cards">
   ${card(scopeCounts['in-scope'] ?? 0, 'פערים בתחום — לתקן', SCOPE_COLOR['in-scope'])}
   ${card(scopeCounts['needs-review'] ?? 0, 'ממתינים לבדיקה', SCOPE_COLOR['needs-review'])}
   ${card((scopeCounts['out-of-scope'] ?? 0) + (scopeCounts['noise'] ?? 0), 'מחוץ לתחום / רעש — לא לתקן', SCOPE_COLOR['out-of-scope'])}
   ${card(scopeCounts['feature'] ?? 0, 'פיצ׳רים אפשריים', SCOPE_COLOR.feature)}
 </div>

 <div class="panel">
   <h2>פערי דקדוק — טבלת ההחלטה (worklist)</h2>
   <div class="legend">כל ניסוח ייחודי שהדקדוק לא זיהה, לפי תדירות. ה-<b>verdict</b> הוא שיקול דעת שלי (Opus כ-oracle) ונתון לאישורך — לולאה תיגע רק ב"בתחום".</div>
   <table>
     <tr><th>×</th><th>ניסוח</th><th>שפה</th><th>verdict</th><th>הערה</th><th>פקודה מוצעת</th></tr>
     ${gapRows || '<tr><td colspan="6" class="muted">אין</td></tr>'}
   </table>
 </div>

 <div class="panel">
   <h2>figure שגוי — amber (באגים אמיתיים במנוע)</h2>
   <div class="legend">הפרסר קיבל את הקלט ובנה figure שמפר את הנתונים שהוצהרו. באג אמיתי — אלא אם הנתונים סותרים מעצמם (שיקול דעתך).</div>
   <table><tr><th>session</th><th>ניסוח</th><th>הפרה</th></tr>${amberRows}</table>
 </div>

 <div class="panel">
   <h2>התנגשות עם נקודות קיימות — לא באג מנוע</h2>
   <div class="legend">הסטודנט הצהיר מחדש על נקודות שכבר קיימות (למשל ריבוע ABCD אחרי מקבילית ABCD). העניין הוא הודעת-שגיאה ברורה, לא תיקון מנוע.</div>
   <table><tr><th>×</th><th>ניסוח</th><th>נקודות שכבר קיימות</th></tr>${collisionRows || '<tr><td colspan="3" class="muted">אין</td></tr>'}</table>
 </div>

 <div class="panel">
   <h2>Sessions (שרשור לפי sid — פותר את הערבוב ברשימה השטוחה)</h2>
   <div class="legend">כל session בנפרד, בסדר כרונולוגי. צעדי כשל פתוחים אוטומטית.</div>
   ${sessionBlocks}
 </div>
</div></body></html>`;
}
