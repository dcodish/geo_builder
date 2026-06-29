/**
 * Operator/oracle VERDICTS over the coverage-gap utterances surfaced by the triage replay.
 *
 * This file is the gate the operator was asking for ("how do we know we're not fixing something we
 * shouldn't?"). Each verdict is a deliberate judgment of SCOPE — is this a legitimate phrasing of a
 * construct the catalog already claims to support, or is it out of scope / a feature request / noise?
 * A fix-loop acts ONLY on `in-scope` rows. Every verdict below was grounded by a parse-probe against
 * the real grammar (see the session notes), not guessed.
 *
 * Keyed by the NORMALISED utterance (`normUtt`: trim + collapse whitespace). Edit freely — the report
 * re-reads this on every build (no replay needed), so re-tagging is instant.
 */

import type { Verdict } from './triageReport';

export const VERDICTS: Record<string, Verdict> = {
  // ── IN SCOPE — a legitimate phrasing of a supported construct → the loop's worklist ──────────────
  'O מרכז המעגל': {
    scope: 'in-scope',
    note: 'סדר-מילים: "מרכז המעגל O" מנותח (→ circle), ההפך לא. הדקדוק אמור להיות חסר-תלות-בסדר.',
    proposal: 'circle (centre O) — same command "מרכז המעגל O" already emits',
  },
  'גובה מנקודה D': {
    scope: 'in-scope',
    note: 'גובה הוא קו מיוחד נתמך, אך "גובה מנקודה D" (עקב ממוקם אוטומטית) לא מנותח דטרמיניסטית — וגם ה-LLM נכשל בייצור. רק "CD גובה" עובד.',
    proposal: 'altitude from D to the opposite side, auto-named foot',
  },
  'הורד גובה מנקודה D': {
    scope: 'in-scope',
    note: 'וריאנט ניסוח של "גובה מנקודה D" (אותו תיקון).',
    proposal: 'altitude from D to the opposite side, auto-named foot',
  },

  // ── NEEDS REVIEW — in-scope concept, but a judgment call before touching the grammar ─────────────
  'O הוא מרכז המעגל החסום בטרפז': {
    scope: 'feature',
    note: 'מעגל חסום בטרפז (incircle) — לבדוק אם הבנייה נתמכת אמינה לפני הוספת ניסוח.',
  },
  'Ob אמצע רדיוס d': {
    scope: 'noise',
    note: 'המושג (אמצע רדיוס) בתחום, אך התוויות קטנות (o,b,d) לא מזוהות. שקול נרמול אותיות-גדולות בקלט — לא special-case.',
  },
  'זווית היקפית על הקוטר': {
    scope: 'feature',
    note: 'זווית היקפית על קוטר (תאלס) — הצהרת משפט יותר מבנייה; שייך ל-Phase 6 (משפטים).',
  },

  // ── OUT OF SCOPE / NOISE — the loop must NOT touch these ─────────────────────────────────────────
  'AB קוטר במעגל D אמצע הרדיוס OB AC מיתר E על המיתר AC DE מקביל ל BC ED=EC F על AB EF אנך ל AB': {
    scope: 'noise',
    note: 'התלמיד הדביק את כל השאלה כמשפט אחד — בעיית קלט, לא דקדוק. פיצ׳ר אפשרי: פיצול אוטומטי למשפטים.',
  },
  'הצג את האנך': {
    scope: 'out-of-scope',
    note: '"הצג" = פקודת תצוגה ללא מושא — לא בנייה.',
  },
  'אנך מd': {
    scope: 'noise',
    note: 'תווית קטנה + ניסוח חלקי ("אנך מ-d", ללא קו יעד) — טריטוריית LLM/נרמול, לא תיקון פרסר ייעודי.',
  },
  'מאונך מd': {
    scope: 'noise',
    note: 'כנ"ל — תווית קטנה + ניסוח חלקי.',
  },
  'הזז את e בהתאם לגודל הזווית הנדרשת': {
    scope: 'out-of-scope',
    note: 'בקשת אינטראקציה/הזזה — הכלי פותר זוויות דרך אילוצים; התלמיד אמור להצהיר את הזווית כאילוץ.',
  },
  'מרכז הנעגל הוא נקודה O': {
    scope: 'noise',
    note: 'שגיאת כתיב "הנעגל"→"המעגל" + סדר-מילים — טריטוריית LLM fallback.',
  },
};
