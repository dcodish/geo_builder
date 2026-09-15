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
  showConstruction: 'הצג בנייה',
  hideConstruction: 'הסתר בנייה',
  dataHide: 'הסתר נתונים',
  secPoints: 'נקודות',
  secCurves: 'עקומים',
  secLengths: 'אורכים',
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
  errNameClash:
    'השם הזה כבר תפוס בשרטוט — הוא {{existing}}. אי אפשר לתת לו משמעות שנייה במשפט "{{detail}}". ' +
    'אפשר לבחור אות אחרת, או למחוק את ההגדרה הקודמת ולכתוב אותה מחדש.',
  errUnknownRef: 'הנקודה {{detail}} עדיין לא הוגדרה. הגדירו אותה קודם, ואז אפשר להתייחס אליה.',
  errUnsatisfiable: 'לא נמצאה תצורה שבה מתקיים: "{{detail}}"',
  errAmbiguousShape:
    'בשרטוט הזה אין צורה אחת שאפשר לקרוא לה כך: "{{detail}}". אפשר לציין את הקודקודים, למשל «שטח הדלתון ABCD הוא 24».',
  errAmbiguousAngle:
    'האות אחת לא מספיקה כדי לדעת באיזו זווית מדובר: "{{detail}}". אפשר לכתוב את שלוש האותיות, למשל «זווית ABC ישרה», או לציין קודם את הצורה שבה הקודקוד נמצא.',
  errDoesNotExist:
    'בשרטוט הזה {{existing}} לא קיים — הנתונים כבר קובעים את כל הנקודות, ואין תצורה אחרת שבה הוא ' +
    'היה קיים. המשפט "{{detail}}" לא נוסף.',
  errReservedCoordinate:
    'האותיות x ו-y שמורות לצירי מערכת הצירים, ולכן אי אפשר להשתמש בהן כנעלם בשיעורי נקודה: "{{detail}}". ' +
    'אפשר להשתמש באות אחרת, למשל M(3,t).',
  errBadArity:
    'מספר הקודקודים אינו מתאים לשם הצורה במשפט "{{detail}}" — במשולש שלושה קודקודים ובמרובע ארבעה.',
  errRepeatedVertex: 'באותו משפט אותה אות מופיעה יותר מפעם אחת: "{{detail}}". לכל קודקוד צריך שם משלו.',
  errBadOperand:
    'הבנתי את היחס במשפט "{{detail}}", אבל לא זיהיתי את אחד האגפים. אפשר לציין שני קודקודים (AB), ' +
    'צלע (הצלע AB), ישר (הישר l1) או ציר (ציר ה-x).',
  // What a taken name already holds, for errNameClash — the construct's own corpus noun.
  kindObject: 'עצם אחר בשרטוט',
  kindPoint: 'נקודה שהוגדרה בשיעורים',
  kindFree: 'קודקוד שהוזכר אך טרם מוקם',
  kindSegment: 'קטע',
  kindPolygon: 'מצולע',
  kindLine: 'ישר',
  kindCircle: 'מעגל',
  kindParabola: 'פרבולה',
  kindEllipse: 'אליפסה',
  kindMidpoint: 'אמצע קטע',
  kindCentroid: 'מפגש התיכונים',
  kindIncentre: 'מפגש חוצי הזוויות',
  kindOrthocentre: 'מפגש הגבהים',
  kindCircumcentre: 'מפגש האנכים האמצעיים',
  kindDiagonalMeet: 'מפגש האלכסונים',
  // Informational, NOT a refusal (#1045): the student restated something the figure already holds,
  // so the message confirms they were right and explains why no row appeared.
  noticeAlreadyKnown: 'זה כבר ידוע מהנתונים שכתבתם, ולכן לא הוספתי שורה נוספת: "{{detail}}"',
  // A different sentence from «כבר ידוע» on purpose (#1063): the student did NOT repeat themselves —
  // they stated something the figure had already settled, which is a thing worth telling them.
  noticeAlreadyFollows:
    'זה כבר נובע מהנתונים שכתבתם — השרטוט מקיים את זה ממילא, ולכן לא הוספתי שורה נוספת: "{{detail}}"',
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
  showConstruction: 'Show construction',
  hideConstruction: 'Hide construction',
  dataHide: 'Hide data',
  secPoints: 'Points',
  secCurves: 'Curves',
  secLengths: 'Lengths',
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
  errNameClash:
    'That name is already taken in this figure — it is {{existing}}. It cannot take a second ' +
    'meaning in "{{detail}}". Either choose another letter, or delete the earlier definition and ' +
    'restate it.',
  errUnknownRef: 'The point {{detail}} has not been defined yet. Define it first, then you can refer to it.',
  errUnsatisfiable: 'No configuration satisfies: "{{detail}}"',
  errAmbiguousShape:
    'No single shape in this figure answers to that: "{{detail}}". Name its vertices — for example "the area of kite ABCD is 24".',
  errAmbiguousAngle:
    'One letter is not enough to say which angle is meant: "{{detail}}". Write all three letters ' +
    '— for example "angle ABC is right" — or state the shape the vertex belongs to first.',
  errDoesNotExist:
    'In this figure {{existing}} does not exist — the givens already fix every point, and there is ' +
    'no other configuration where it would. "{{detail}}" was not added.',
  errReservedCoordinate:
    'The letters x and y name the axes, so they cannot be a point\'s unknown: "{{detail}}". ' +
    'Use another letter — for example M(3,t).',
  errBadArity:
    'The number of vertices does not match the shape named in "{{detail}}" — a triangle has three ' +
    'vertices and a quadrilateral four.',
  errRepeatedVertex:
    'The same letter appears more than once in "{{detail}}". Each vertex needs its own name.',
  errBadOperand:
    'I understood the relation in "{{detail}}", but not one of its sides. Name two vertices (AB), ' +
    'a side (side AB), a line (line l1) or an axis (the x-axis).',
  // What a taken name already holds, for errNameClash — the construct's own corpus noun.
  kindObject: 'another object in the figure',
  kindPoint: 'a point given by coordinates',
  kindFree: 'a vertex that was named but not yet placed',
  kindSegment: 'a segment',
  kindPolygon: 'a polygon',
  kindLine: 'a line',
  kindCircle: 'a circle',
  kindParabola: 'a parabola',
  kindEllipse: 'an ellipse',
  kindMidpoint: 'a midpoint',
  kindCentroid: 'the centroid',
  kindIncentre: 'the incentre',
  kindOrthocentre: 'the orthocentre',
  kindCircumcentre: 'the circumcentre',
  kindDiagonalMeet: 'the intersection of the diagonals',
  noticeAlreadyKnown: 'That is already known from what you have written, so I did not add another row: "{{detail}}"',
  noticeAlreadyFollows:
    'That already follows from what you have written — the figure satisfies it anyway, so I did not add another row: "{{detail}}"',
};

export const analyticI18n = createProductI18n({
  resources: { he, en },
  postProcessors: [analyticBidi.postProcessor('bidiIsolateAg')],
});
