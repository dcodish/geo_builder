/**
 * The complex builder's i18n — the RESOURCES are this product's own; the BOOTSTRAP is shared
 * (`shell/i18n`, ADR-W-016: the ~25-line init was written three times; this tree now consumes the
 * one copy, on its own instance — the ADR-3D-001 §9 rule holds by construction).
 *
 * Bidi isolation (`shell/bidi`) rides as a post-processor over every rendered message — the
 * mechanism 2-D (#464) and 3-D (#468) each built and this tree shipped WITHOUT (docs/28 §1a
 * measured it absent): an RTL sentence can no longer reverse `z1 = 3+4i` inside a refusal.
 */
import { makeBidi } from '../../shell/bidi';
import { createProductI18n } from '../../shell/i18n';

/** The bidi kit — exported for composed (non-`t()`) strings and for the palette drift lock. */
export const complexBidi = makeBidi();

const he = {
  // The suite's display names are the CURRICULUM's subject names (operator ruling 2026-08-17):
  // הנדסת המישור · הנדסת המרחב · מספרים מרוכבים — not "בונה X".
  title: 'מספרים מרוכבים',
  subtitle: 'מישור גאוס: הקלידו נתונים שורה-שורה והתבוננו בנקודות',
  inputPlaceholder: 'למשל: z1 = 3+4i או w = z1*z2 או z^3 = 8',
  add: 'הוסף',
  example: 'דוגמה',
  clearAll: 'נקה הכל',
  viewCart: 'תצוגה קרטזית',
  viewPolar: 'תצוגה קוטבית',
  language: 'English',
  emptyHint: 'אין עדיין נתונים. נסו את הדוגמה, או הקלידו: z1 = 3+4i',
  errNotHandled: 'לא הצלחתי להבין את המשפט: "{{detail}}"',
  errParse: 'שגיאת ניסוח בביטוי: "{{detail}}"',
  errDuplicate: 'השם כבר הוגדר במשפט: "{{detail}}"',
  errUnknownRef: 'המשפט מפנה לשם שלא הוגדר: {{detail}}',
  errRootsOfZero: 'לא ניתן לחלץ שורשים של אפס: "{{detail}}"',
  errIncompatible: 'המשפט לא נוסף — אינו מתיישב עם: "{{detail}}"',
  errImpossible: 'המשפט לא נוסף — הוא לא יכול להתקיים: "{{detail}}"',
  errUnaccounted: 'הבנתי חלק מהשורה, אבל לא את: {{detail}}',
  errWrongApp: 'הקובץ שייך לכלי אחר ({{detail}}) — כאן נטענים קבצים של בונה המרוכבים בלבד',
  errNewerVersion: 'הקובץ נשמר בגרסה חדשה יותר של הכלי — רעננו את הדף ונסו שוב',
  freeLabel: 'מספר חופשי (ניתן לגרירה)',
  implicitLabel: 'נוצר מעצם האזכור — חופשי, ניתן לגרירה',
  drivenLabel: 'מכוון על-ידי הנתונים — לחלופות: "אפשרות נוספת"',
  factCount: '{{count}} משפטים',
  symConj: 'צמוד',
  symAbs: 'ערך מוחלט',
  symInv: 'הופכי',
  symCis: 'הצגה קוטבית (cis)',
  symI: 'היחידה המדומה i',
  symDeg: 'מעלות',
  symPow: 'חזקה',
  symMul: 'כפל',
  anotherConfig: 'אפשרות נוספת',
  symRe: 'החלק הממשי',
  symIm: 'החלק המדומה',
  symTheta: 'הזווית θ (פרמטר)',
  symAlpha: 'הזווית α (פרמטר)',
  symBeta: 'הזווית β (פרמטר)',
  relOk: 'היחס מתקיים בציור',
  relBad: 'היחס אינו מתקיים בציור',
  relDriven: 'היחס כיוון את הציור (הוריד דרגת חופש)',
  paramsLabel: 'פרמטרים משותפים — נדגמים מחדש בכל "אפשרות נוספת"',
  calcsLabel: 'חישובים',
  save: 'שמור',
  load: 'טען',
  calc: 'חשב',
  calcPlaceholder: 'הקלידו ביטוי לחישוב, למשל |z1-z2|',
  calcCurrent: 'בדגימה הנוכחית: {{value}}',
  // The shared frame (shell/, #673): the suite bar's visible buttons and the privacy note (NFR-SE-3).
  menuAbout: 'אודות',
  aboutTitle: 'על הכלי',
  aboutLead:
    'כלי לבניית הציור של שאלת מספרים מרוכבים: מקלידים את הנתונים שורה-שורה, והציור נבנה ומתעדכן תוך כדי. הכלי מצייר ובודק את הנתונים — הוא אינו פותר את השאלה.',
  aboutClose: 'סגירה',
  privacy:
    'פרטיות: אין הרשמה ולא נאספים פרטים אישיים. העבודה נשמרת בדפדפן שלכם בלבד ובקבצים שאתם בוחרים לשמור — שום מידע אינו נשלח לשרת.',
  // The load audit (ADR-242 arriving here): the load REPORTS what it could not restore.
  loadAuditTitle: 'הקובץ נטען חלקית: {{restored}} מתוך {{total}} שורות נוספו. שורות שלא נוספו:',
  loadAuditDismiss: 'סגור',
  // A2 (#661): the switcher renders products.json's roster; its labelKeys resolve HERE, per product.
  switcher2d: 'הנדסת המישור',
  switcher3d: 'הנדסת המרחב',
  switcherComplex: 'מספרים מרוכבים',
  switcherAria: 'מעבר בין הבונים',
  // B2 (#667): the opt-in data column (D1) — values/knowledge only; refusals stay on the canvas strip.
  dataShow: 'נתונים',
  dataHide: 'הסתר נתונים',
  dataTitle: 'מה הציור יודע',
  namePlaceholder: 'שם השרטוט (לא חובה)',
  // B4 (D9b): the empty-canvas quick chips — the inviting first click.
  emptyTitle: 'מה בונים היום?',
  emptyHintChips: 'לחצו נתון לדוגמה — או הקלידו משלכם, והציור ייבנה מולכם',
  // S5 — the visualization layer (#622)
  stepperLabel: 'מחזור החזקות: n',
  stepBack: 'הקודם',
  stepForward: 'הבא',
  cyclePeriod: 'מחזור באורך {{count}}',
  seriesRatio: 'מנת הסדרה',
  seriesLimit: 'סכום הסדרה האינסופית',
  seriesClosed: 'סכום האיברים הוא אפס — השרשרת נסגרת',
  rotationHint: 'כפל = סיבוב ומתיחה',
  regionCounts: '{{label}}: {{inside}} בפנים · {{on}} על המצולע · {{outside}} בחוץ',
  showSeries: 'סדרה',
  showCycle: 'מחזור חזקות',
  showRegion: 'פנים/חוץ',
};

const en = {
  title: 'Complex Numbers',
  subtitle: 'The Gauss plane: enter givens line by line and watch the points',
  inputPlaceholder: 'e.g. z1 = 3+4i or w = z1*z2 or z^3 = 8',
  add: 'Add',
  example: 'Example',
  clearAll: 'Clear all',
  viewCart: 'Cartesian view',
  viewPolar: 'Polar view',
  language: 'עברית',
  emptyHint: 'No givens yet. Try the example, or type: z1 = 3+4i',
  errNotHandled: 'I could not understand the statement: "{{detail}}"',
  errParse: 'Could not parse the expression: "{{detail}}"',
  errDuplicate: 'This name is already defined by: "{{detail}}"',
  errUnknownRef: 'The statement refers to an undefined name: {{detail}}',
  errRootsOfZero: 'Cannot extract roots of zero: "{{detail}}"',
  errIncompatible: 'Statement not added — it cannot hold together with: "{{detail}}"',
  errImpossible: 'Statement not added — it cannot hold at all: "{{detail}}"',
  errUnaccounted: 'I read part of the line, but not: {{detail}}',
  errWrongApp: 'This file belongs to another tool ({{detail}}) — only Complex Builder files load here',
  errNewerVersion: 'This file was saved by a newer version of the tool — refresh the page and try again',
  freeLabel: 'free number (draggable)',
  implicitLabel: 'created by reference — free, draggable',
  drivenLabel: 'driven by the givens — use "Another configuration"',
  factCount: '{{count}} statements',
  symConj: 'conjugate',
  symAbs: 'absolute value',
  symInv: 'reciprocal',
  symCis: 'polar form (cis)',
  symI: 'imaginary unit i',
  symDeg: 'degrees',
  symPow: 'power',
  symMul: 'multiply',
  anotherConfig: 'Another configuration',
  symRe: 'real part',
  symIm: 'imaginary part',
  symTheta: 'the angle θ (parameter)',
  symAlpha: 'the angle α (parameter)',
  symBeta: 'the angle β (parameter)',
  relOk: 'the relation holds in the figure',
  relBad: 'the relation does NOT hold in the figure',
  relDriven: 'the relation drove the figure (consumed a degree of freedom)',
  paramsLabel: 'shared parameters — resampled on every "another configuration"',
  calcsLabel: 'Calculations',
  save: 'Save',
  load: 'Load',
  calc: 'Calc',
  calcPlaceholder: 'type an expression to calculate, e.g. |z1-z2|',
  calcCurrent: 'at the current sample: {{value}}',
  // The shared frame (shell/, #673): the suite bar's visible buttons and the privacy note (NFR-SE-3).
  menuAbout: 'About',
  aboutTitle: 'About this tool',
  aboutLead:
    'A tool for building the figure of a complex-numbers question: enter the givens line by line and the figure forms and adapts as you go. It draws and verifies the givens — it never solves the question.',
  aboutClose: 'Close',
  privacy:
    'Privacy: no registration, and no personal data is collected. Your work is stored only in your browser and in files you choose to save — nothing is sent to a server.',
  // The load audit (ADR-242 arriving here): the load REPORTS what it could not restore.
  loadAuditTitle: 'The file loaded partially: {{restored}} of {{total}} lines were added. Lines not added:',
  loadAuditDismiss: 'Dismiss',
  // A2 (#661): the switcher renders products.json's roster; its labelKeys resolve HERE, per product.
  switcher2d: 'Plane Geometry',
  switcher3d: 'Space Geometry',
  switcherComplex: 'Complex Numbers',
  switcherAria: 'Switch between builders',
  // B2 (#667): the opt-in data column (D1) — values/knowledge only; refusals stay on the canvas strip.
  dataShow: 'Data',
  dataHide: 'Hide data',
  dataTitle: 'What the figure knows',
  namePlaceholder: 'Figure name (optional)',
  // B4 (D9b): the empty-canvas quick chips — the inviting first click.
  emptyTitle: 'What are we building today?',
  emptyHintChips: 'Click an example given — or type your own, and the figure builds in front of you',
  // S5 — the visualization layer (#622)
  stepperLabel: 'power cycle: n',
  stepBack: 'previous',
  stepForward: 'next',
  cyclePeriod: 'period {{count}}',
  seriesRatio: 'the ratio',
  seriesLimit: 'the sum of the infinite series',
  seriesClosed: 'the terms sum to zero — the chain closes',
  rotationHint: 'multiplication = rotation and scaling',
  regionCounts: '{{label}}: {{inside}} inside · {{on}} on the polygon · {{outside}} outside',
  showSeries: 'series',
  showCycle: 'power cycle',
  showRegion: 'inside/outside',
};

export const complexI18n = createProductI18n({
  resources: { he, en },
  postProcessors: [complexBidi.postProcessor('bidiIsolateCx')],
});
