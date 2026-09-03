/**
 * The analytic builder's i18n — the RESOURCES are this product's own; the BOOTSTRAP is shared
 * (`shell/i18n`, ADR-W-016), on its own instance.
 *
 * Bidi isolation (`shell/bidi`) rides as a post-processor over every rendered message, so an RTL
 * sentence can never reverse `y = -2x + 8` inside a refusal — the mechanism each sibling had to
 * learn separately, adopted here from the first line of the product.
 *
 * NOTE the `switcher*` keys: `products.json`'s `labelKey` is resolved by EACH CONSUMING product's
 * i18n, so every builder needs a name for every builder. A missing key here is a blank chip in
 * THIS tool; a missing `switcherAnalytic` in a sibling is a blank chip THERE (ADR-AG-004 §2 — the
 * checklist item whose failure surfaces in the wrong product).
 */
import { makeBidi } from '../../shell/bidi';
import { createProductI18n } from '../../shell/i18n';

/** The bidi kit — exported for composed (non-`t()`) strings and for the palette drift lock. */
export const analyticBidi = makeBidi({ extraCore: '_' });

const he = {
  // The suite's display names are the CURRICULUM's subject names (operator ruling 2026-08-17).
  title: 'גאומטריה אנליטית',
  subtitle: 'מערכת צירים: הקלידו נתונים שורה-שורה והתבוננו בשרטוט',
  inputPlaceholder: 'למשל: נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
  add: 'הוסף',
  clearAll: 'נקה הכל',
  language: 'English',
  emptyTitle: 'התחילו לשרטט',
  emptyHint: 'הבחינה לא מדפיסה שרטוט — הקלידו את הנתונים והכלי ישרטט אותם',
  factsEmpty: 'אין עדיין נתונים.',
  factCount: '{{count}} נתונים',
  another: 'הציגו תצורה אחרת',
  dataTitle: 'נתונים',
  dataShow: 'הצג נתונים',
  dataHide: 'הסתר נתונים',
  secPoints: 'נקודות',
  secCurves: 'עקומים',
  secParams: 'פרמטרים',
  freeDof: '{{count}} דרגות חופש',
  pinned: 'הכול נקבע על-ידי הנתונים',
  about: 'אודות',
  aboutTitle: 'גאומטריה אנליטית',
  aboutBody:
    'כלי לשרטוט שאלות גאומטריה אנליטית: מקלידים את הנתונים כלשונם, והכלי משרטט את הצורה. הכלי אינו פותר את השאלה.',
  privacy: 'המשפטים שאתם מקלידים נשמרים בדפדפן שלכם בלבד.',
  close: 'סגור',
  switcherLabel: 'בחירת כלי',
  switcherMore: 'עוד',
  // Every builder's name, resolved through THIS product's i18n (see the note above).
  switcher2d: 'הנדסת המישור',
  switcher3d: 'הנדסת המרחב',
  switcherComplex: 'מספרים מרוכבים',
  switcherAnalytic: 'גאומטריה אנליטית',
  // Refusals name the STATEMENT, never internal state.
  errNotHandled: 'לא הצלחתי להבין את המשפט: "{{detail}}"',
  errBadEquation: 'לא הצלחתי לקרוא את המשוואה: "{{detail}}"',
  errOutOfScope: 'המשפט מובן, אך אינו נתמך בכלי הזה: "{{detail}}"',
  errConflict: 'המשפט לא נוסף — הוא סותר את מה שכבר נקבע: "{{detail}}"',
  errConicTaken: 'בשרטוט יכולה להיות פרבולה אחת ואליפסה אחת. המשפט מתאר עקום נוסף: "{{detail}}"',
  errNameClash: 'השם כבר משמש עצם מסוג אחר: "{{detail}}"',
};

const en: typeof he = {
  title: 'Analytic Geometry',
  subtitle: 'A coordinate plane: type the givens line by line and watch the figure',
  inputPlaceholder: 'e.g. circle I: (x-3)^2+(y-4)^2=9',
  add: 'Add',
  clearAll: 'Clear all',
  language: 'עברית',
  emptyTitle: 'Start drawing',
  emptyHint: 'The exam prints no figure — type the givens and the tool draws them',
  factsEmpty: 'No givens yet.',
  factCount: '{{count}} givens',
  another: 'Show another configuration',
  dataTitle: 'Data',
  dataShow: 'Show data',
  dataHide: 'Hide data',
  secPoints: 'Points',
  secCurves: 'Curves',
  secParams: 'Parameters',
  freeDof: '{{count}} degrees of freedom',
  pinned: 'Everything is fixed by the givens',
  about: 'About',
  aboutTitle: 'Analytic Geometry',
  aboutBody:
    'A tool for drawing analytic-geometry questions: type the givens as the exam words them and the tool draws the figure. It does not solve the question.',
  privacy: 'The statements you type stay in your own browser.',
  close: 'Close',
  switcherLabel: 'Choose a tool',
  switcherMore: 'More',
  switcher2d: 'Plane Geometry',
  switcher3d: 'Solid Geometry',
  switcherComplex: 'Complex Numbers',
  switcherAnalytic: 'Analytic Geometry',
  errNotHandled: 'I could not understand the statement: "{{detail}}"',
  errBadEquation: 'I could not read the equation: "{{detail}}"',
  errOutOfScope: 'Understood, but not supported in this tool: "{{detail}}"',
  errConflict: 'Not added — it contradicts what is already fixed: "{{detail}}"',
  errConicTaken: 'A figure holds one parabola and one ellipse. This describes another: "{{detail}}"',
  errNameClash: 'That name already belongs to a different kind of object: "{{detail}}"',
};

export const analyticI18n = createProductI18n({
  resources: { he, en },
  postProcessors: [analyticBidi.postProcessor('bidiIsolateAg')],
});
