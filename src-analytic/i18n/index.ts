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
import { createProductI18n } from '../../shell/i18n';

// #1191: the kit itself lives in ./bidi so the RENDERER can reach it without importing this bootstrap.
// Re-exported here because every existing caller imports it from './i18n' — one instance, two doors.
export { analyticBidi } from './bidi';
import { analyticBidi } from './bidi';

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
  // #1281 — the name the tool gave a point stated only by its coordinates (the #1263 ruling: say so).
  mintedNote: 'הכלי קרא לנקודה {{name}}',
  factsEmpty: 'אין עדיין נתונים.',
  factCount: '{{count}} נתונים',
  factToggle: 'כלול בציור',
  another: 'הציגו תצורה אחרת',
  dataTitle: 'נתונים',
  dataShow: 'הצג נתונים',
  showConstruction: 'הצג בנייה',
  hideConstruction: 'הסתר בנייה',
  dataHide: 'הסתר נתונים',
  secPoints: 'נקודות',
  secEquations: 'משוואות',
  secLengths: 'אורכים',
  secSlopes: 'שיפועים',
  // The ASK lane (#1027) — the panel's own input: two surfaces, one grammar.
  // Short enough to READ in the panel's column — a placeholder clipped at its start teaches nothing.
  askPlaceholder: 'שאלו: AB, שטח ABC, זווית ABC',
  askAdd: 'שאלו', // #1453 (ADR-W-098): the suite's one wording
  /** The ✕ that retires a measurement and the height it drew (#1118). */
  askTraceLabel: 'איך מגיעים לזה',
  // #1525 (operator, 2026-09-29): a method hint for an asked angle — the cosine half only when all
  // three vertices are known
  askHintAngleMethods: 'ניתן להשתמש בשיפועי הישרים או במשפט הקוסינוסים',
  askHintAngleSlopes: 'ניתן להשתמש בשיפועי הישרים',
  askTraceToggle: 'הצגה/הסתרה של דרך החישוב',
  /** A curve row's derived properties — centre, radius, foci, directrix — folded under its equation (#1212). */
  /**
   * ONE LABEL PER KIND, because «עקום» is our word and not the exam's (#1214, and #1147 before it).
   *
   * Whole strings rather than «נתוני ה» + a slotted noun: ADR-AG-085 settled that for the refusals
   * on the same grammar, and the definite article is exactly the kind of joint that breaks when the
   * fifth noun arrives.
   */
  curveDetailsCircle: 'נתוני המעגל',
  curveDetailsParabola: 'נתוני הפרבולה',
  curveDetailsEllipse: 'נתוני האליפסה',
  /** The tooltip names no kind, so it needs no fourth string and cannot reintroduce the old noun. */
  curveDetailsToggle: 'הצגה/הסתרה של הנתונים',
  askRemove: 'הסירו את המדידה',
  // Three different answers, because they are three different situations.
  askOpen: 'עדיין לא נקבע מהנתונים',
  askNoValue: 'לא ניתן לחשב מהנתונים',
  // #1473 (ADR-AG-180) — a value not yet confirmed over every configuration: shown while the check
  // completes after the render, never as a provisional number.
  checking: 'בודק…',
  // #1227 (ADR-AG-136) — a determined point's locus is that point, or that finite set: the locus lane's
  // own grammar («נקודה · (4, 3)» beside «ישר · x = 4»), never «לא ניתן לחשב».
  askPointOne: 'נקודה',
  askPointTwo: 'שתי נקודות',
  askPointMany: '{{count}} נקודות',
  // #1205 — the refusal TEACHES: it names why there is no single distance, and names the two
  // questions that ARE askable here. Both suggestions are driven in the lock, because a remedy the
  // tool cannot itself answer is the #1156 failure mode.
  askLinesCross:
    'הישרים נחתכים, ולכן אין ביניהם מרחק אחד — הוא אפס בנקודת החיתוך וגדל ככל שמתרחקים ממנה. מרחק מוגדר רק בין ישרים מקבילים. אפשר לשאול על המרחק מנקודה לישר, למשל «המרחק מ-A לישר l1», או לסמן את נקודת החיתוך עצמה.',
  askUnreadable: 'לא הבנתי את השאלה',
  // #1431 — the contextual distance could not resolve; name which noun to letter
  askContextualPoint: 'יש {{points}} נקודות בציור — כתבו את שם הנקודה (למשל «המרחק של A מהישר»)',
  askContextualLine: 'יש {{lines}} ישרים בציור — כתבו את שם הישר (למשל «המרחק של הנקודה מהישר l1»)',
  askContextualBoth: 'בציור {{points}} נקודות ו-{{lines}} ישרים — כתבו את השמות (למשל «המרחק של A מהישר l1»)',
  /** #1111 — the sentence was understood; the figure has no such object. The LETTER is the point. */
  askMissingPoint: 'אין בשרטוט נקודה בשם {{name}}',
  askMissingCurve: 'אין בשרטוט ישר או מעגל בשם {{name}}',
  // Ruling 2026-09-29 — a numeral asked in the notation the figure does not use.
  askNumeralNotation: '{{name}} ו-{{used}} הם אותו שם — בשרטוט הזה הוא נכתב {{used}}. כתבו {{used}}, כדי לא לערבב שתי כתיבות.',
  paletteShow: 'סמלים',
  // #1129 — one per palette chip, so every button says what it is rather than repeating its glyph.
  symSq: 'בריבוע',
  symSqrt: 'שורש ריבועי',
  symEll: 'שם של ישר',
  symLe: 'קטן או שווה',
  symGe: 'גדול או שווה',
  symNe: 'שונה מ־',
  symCube: 'בחזקת שלוש',
  symMul: 'כפל',
  symPi: 'פאי',
  symAbs: 'אורך הקטע',
  symDist: 'מרחק בין שתי נקודות',
  symComponent: 'שיעור ה-x של נקודה',
  symPerp: 'מאונך ל־',
  symPar: 'מקביל ל־',
  symAngle: 'זווית',
  symDeg: 'מעלות',
  symTriangle: 'משולש',
  symCong: 'חופף ל־',
  symSim: 'דומה ל־',
  // #1621 D2 — the Greek angle names
  symAlpha: 'אלפא — שם של זווית',
  symBeta: 'בטא — שם של זווית',
  symGamma: 'גמא — שם של זווית',
  symDelta: 'דלתא — שם של זווית',
  symTheta: 'תטא — שם של זווית',
  symLt: 'קטן מ',
  symArea: 'שטח מצולע',
  symArc: 'קשת',
  // A vertical segment HAS no slope, and that is an answer rather than an absence (#1078).
  slopeVertical: 'אנכי (אין שיפוע)',
  // #1322 — the angle a line makes with the positive x-axis, beside its slope (m = tan α)
  angleWithX: 'זווית עם ציר ה-x',
  secParams: 'פרמטרים',
  paramUnused: '(לא בשימוש בשרטוט)',
  freeDof: 'דרגות חופש: {{count}}',
  pinned: '✓ הציור נקבע במלואו על ידי הנתונים',
  about: 'אודות',
  aboutTitle: 'גאומטריה אנליטית',
  aboutLead:
    'כלי לשרטוט שאלות גאומטריה אנליטית: מקלידים את הנתונים כלשונם, והכלי משרטט את הצורה. הכלי אינו פותר את השאלה.',
  // #1477 (ADR-W-091): the About DECLARATION's parts — the same sections as 2-D's About.
  aboutPoints: [
    'מיועד לתלמידי תיכון הנבחנים בגאומטריה אנליטית לבגרות, וגם למורים שצריכים לשרטט במערכת צירים במהירות ובפשטות.',
    'מוסיפים נתון אחד בכל פעם — נקודות, ישרים, מעגלים — והשרטוט מסתגל ככל שמצטברים נתונים.',
    'כשהנתונים מאפשרים יותר משרטוט אחד, «הציגו תצורה אחרת» מציג שרטוט אחר שגם הוא מקיים את כל הנתונים.',
    'הכלי משרטט את הצורה לפי מה שתיארתם — הוא אינו פותר שאלות.',
  ],
  aboutTryTitle: 'הזינו את נתוני השאלה כפי שמופיעים בשאלה:',
  aboutTrySteps: ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'נתונה הנקודה A(2,6)', 'נתון הישר l1: y=x'],
  creditBy: 'פותח על־ידי',
  creditName: 'ד"ר דוד קודיש',
  creditContact: 'לשאלות',
  privacy:
    'פרטיות: אין הרשמה ולא נאספים פרטים אישיים. לצורך שיפור הכלי נשמרים המשפטים שהקלדתם (טקסט מתמטי בלבד) עם מזהה מבקר אנונימי — ללא כתובת ה-IP — למספר ימים בלבד.' +
    ' משפטים שהכלי לא הבין נשלחים לעיבוד בשירות בינה מלאכותית חיצוני.' +
    ' כשאתם לוחצים «העתק קישור», השרטוט ותמונה שלו נשמרים בשרת כדי שהקישור יעבוד — בלי שם ובלי פרטים אישיים, ומי שיש לו את הקישור יכול לפתוח אותו.',
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
  errProofTarget:
    'זו טענה להוכחה, לא נתון — הכלי משרטט את הנתונים ואינו בודק הוכחות. הקלידו רק את מה שנתון בשאלה: "{{detail}}"',
  errConflict: 'המשפט לא נוסף — הוא סותר את מה שכבר נקבע: "{{detail}}"',
  errNameClash:
    'השם הזה כבר תפוס בשרטוט — הוא {{existing}}. אי אפשר לתת לו משמעות שנייה במשפט "{{detail}}". ' +
    'אפשר לבחור אות אחרת, או למחוק את ההגדרה הקודמת ולכתוב אותה מחדש.',
  // #1179 — one sentence per KIND, written out rather than templated: Hebrew gender carries through
  // the whole clause («הנקודה … הוגדרה» vs «הישר … הוגדר»), so a noun slotted into one sentence would
  // be wrong in three of four cases. `errUnknownRef` stays as the kind-free fallback.
  errUnknownRef: 'אין בשרטוט עצם בשם {{detail}}. הגדירו אותו קודם, ואז אפשר להתייחס אליו.',
  errUnknownRefPoint: 'הנקודה {{detail}} עדיין לא הוגדרה. הגדירו אותה קודם, ואז אפשר להתייחס אליה.',
  errUnknownRefLine: 'הישר {{detail}} עדיין לא הוגדר. הגדירו אותו קודם, ואז אפשר להתייחס אליו.',
  errUnknownRefCircle: 'המעגל {{detail}} עדיין לא הוגדר. הגדירו אותו קודם, ואז אפשר להתייחס אליו.',
  // #1514 pre-play — a named conic is a noun of its own; it was reported as a missing POINT with its raw id.
  errUnknownRefParabola: 'הפרבולה {{detail}} עדיין לא הוגדרה. הגדירו אותה קודם, ואז אפשר להתייחס אליה.',
  errUnknownRefEllipse: 'האליפסה {{detail}} עדיין לא הוגדרה. הגדירו אותה קודם, ואז אפשר להתייחס אליה.',
  // 02c R7 (#1514 pre-play) — the noun and the equation name different families; never drawn.
  errKindMismatch:
    'המשוואה במשפט "{{detail}}" מתארת {{existing}}, לא {{claimed}}. בדקו את המשוואה, או כתבו את שם הצורה שהיא מתארת.',
  // Several NAMED candidates for a contextual reference (#1514 + #1432, chosen by hostKey): the sentence
  // names them and shows the student's own line with the first name in it.
  'errHost.named':
    'בשרטוט יש יותר מעצם אחד מהסוג הזה ({{candidates}}), ולכן לא ברור לאיזה מהם הכוונה ב-"{{detail}}". כתבו את השם, למשל «{{example}}».',
  // Operator ruling 2026-09-29 — a digit and a Roman numeral are one name; the notations are not mixed.
  errNumeralNotation:
    '{{numNoun}} {{holder}} ו{{numNoun}} {{detail}} הם אותו שם — הכלי קורא ספרה ומספר רומי כשם אחד. כדי לא לערבב שתי כתיבות, כתבו {{numNoun}} {{holder}}, כמו בשורות הקודמות.',
  errAlreadyNamed: 'כבר יש שם לנקודה הזו: {{holder}}. כדי לשנות את השם, מחקו את השורה של {{holder}} וכתבו אותה מחדש.',
  // #1154 — the rename's refusals, each naming what the student wrote
  errRenameBadName: '"{{detail}}" אינו שם של נקודה. שם נקודה הוא אות לטינית גדולה, אפשר עם ספרה — למשל G או A1.',
  errRenameSame: 'האות {{detail}} כבר נקראת {{detail}} — אין מה לשנות.',
  errRenameUnknown: 'אין בשרטוט נקודה בשם {{detail}}, ולכן אין מה לשנות.',
  errRenameTaken: 'האות {{detail}} כבר תפוסה: "{{holder}}". בחרו אות פנויה.',
  errRenameTakenTool: 'האות {{detail}} כבר תפוסה בשרטוט. בחרו אות פנויה.',
  errRenameNotTyped: 'את האות {{detail}} בחר הכלי, ואין דרך לכתוב אותה במשפט שלכם בלי לשנות את משמעותו — לכן היא לא שונתה.',
  errRenameUnsafe: 'לא הצלחתי לשנות את {{holder}} בשורה "{{detail}}" בלי לשנות את משמעותה. ערכו את השורה ידנית.',
  errRenameUnsafeFigure: 'שינוי האות {{holder}} היה משנה גם שם שהכלי בחר בשרטוט, ולכן הוא לא בוצע.',
  // #1303 / #1631 — the swap's refusals, each naming what the student wrote
  errSwapSame: 'אי אפשר להחליף את {{detail}} בעצמה — בחרו שתי אותיות שונות.',
  errSwapUnknown: 'אין בשרטוט נקודה בשם {{detail}}, ולכן אין עם מה להחליף.',
  errSwapUnsafe: 'לא הצלחתי להחליף בין {{holder}} ל-{{other}} בשורה "{{detail}}" בלי לשנות את משמעותה. ערכו את השורה ידנית.',
  errSwapUnsafeFigure: 'החלפת {{holder}} ו-{{other}} הייתה משנה גם שם שהכלי בחר בשרטוט, ולכן היא לא בוצעה.',
  // #1154 — the click menu's entry (the sentence it starts is grammar, composed in app/rename.ts)
  // The letter popover (#1631, ADR-W-105) — 2-D's pointMenu wording, so the three builders say the same thing.
  letterPlaceholder: 'אות',
  letterApply: 'החילו',
  letterTaken: 'האות כבר בשימוש',
  letterBad: 'אות לא תקינה',
  letterTakenBy: 'האות תפוסה על ידי: «{{what}}»',
  letterSwap: 'החליפו בין {{a}} ל-{{b}}',
  // The segment menu (#1653, ADR-W-106) — 2-D's segMenu wording, so the builders say the same thing.
  segHide: 'הסתירו קטע',
  segShow: 'הציגו קטע',
  segDashed: 'מקווקו',
  segSolid: 'רציף',
  // #1598 — the letter popover opened on an unnamed circle's centre
  centreTitle: 'מרכז המעגל',
  errUnsatisfiable: 'לא נמצאה תצורה שבה מתקיים: "{{detail}}"',
  // #1423 — the letter is the problem, named with the student's own defining sentence and the remedy
  errUnsatisfiableReused: '{{reusedId}} כבר מוגדרת: "{{definedBy}}". המשפט "{{detail}}" סותר את ההגדרה הקיימת — לנקודה חדשה בחרו אות אחרת.',
  // The locus families (#1137) — keyed by the engine's own kind, so a family added later shows its
  // internal name rather than nothing at all.
  'locus.line': 'ישר',
  'locus.circle': 'מעגל',
  'locus.parabola': 'פרבולה',
  'locus.ellipse': 'אליפסה',
  // A UNION answer pluralises its kind (#1500) — «שני ישרים · y = 0 · 3x + 4y = 0». Two is the size
  // the corpus produces (tangent pairs, two parallels); a larger union falls back to a counted form.
  'locus.line.2': 'שני ישרים',
  'locus.circle.2': 'שני מעגלים',
  'locus.parabola.2': 'שתי פרבולות',
  'locus.ellipse.2': 'שתי אליפסות',
  errNotADiagonal:
    'האותיות האלה הן צלעות של המרובע, לא אלכסונים שלו: "{{detail}}". אלכסון מחבר שני קודקודים שאינם סמוכים, למשל «האלכסונים AC ו-BD נפגשים בנקודה E» במרובע ABCD.',
  errNoPrincipalDiagonal:
    'בצורה הזאת אין אלכסון ראשי ואלכסון משני — ההבחנה הזאת קיימת רק בצורות כמו דלתון: "{{detail}}". אפשר לציין את האלכסון לפי הקודקודים, למשל «משוואת האלכסון AC היא y=2x».',
  errAmbiguousShape:
    'בשרטוט הזה אין צורה אחת שאפשר לקרוא לה כך: "{{detail}}". אפשר לציין את הקודקודים, למשל «שטח הדלתון ABCD הוא 24».',
  // #1432 am. 1 — a contextual reference with no host, or several: the remedy follows the HOST the
  // sentence needed (name the circle, draw the parabola first), never the kite-area example above,
  // which stays for the polygon-noun sentences it was written for.
  'errHost.none.circle': 'אין בשרטוט מעגל שהמשפט יכול להתייחס אליו: "{{detail}}". הגדירו קודם מעגל, למשל «נתון מעגל O».',
  'errHost.many.circle': 'יש בשרטוט יותר ממעגל אחד, ולא ברור לאיזה מהם המשפט מתייחס: "{{detail}}". כתבו במשפט את שם המעגל, למשל «המעגל I».',
  'errHost.none.parabola': 'אין בשרטוט פרבולה שהמשפט יכול להתייחס אליה: "{{detail}}". הגדירו קודם את הפרבולה, למשל «נתונה פרבולה שמשוואתה y^2=8x».',
  'errHost.many.parabola': 'יש בשרטוט יותר מפרבולה אחת, ולא ברור לאיזו מהן המשפט מתייחס: "{{detail}}".',
  'errHost.none.ellipse': 'אין בשרטוט אליפסה שהמשפט יכול להתייחס אליה: "{{detail}}". הגדירו קודם את האליפסה, למשל «נתונה אליפסה שמשוואתה x^2/25+y^2/9=1».',
  'errHost.many.ellipse': 'יש בשרטוט יותר מאליפסה אחת, ולא ברור לאיזו מהן המשפט מתייחס: "{{detail}}".',
  'errHost.none.line': 'אין בשרטוט ישר שהמשפט יכול להתייחס אליו: "{{detail}}". הגדירו קודם את הישר, למשל «הישר l1: y=2x+1».',
  'errHost.many.line': 'יש בשרטוט יותר מישר אחד, ולא ברור לאיזה מהם המשפט מתייחס: "{{detail}}". כתבו במשפט את שם הישר, למשל «הישר l1».',
  'errHost.none.perpendicular': 'אין בשרטוט אנך שהמשפט יכול להתייחס אליו: "{{detail}}". הורידו קודם את האנך, למשל «האנך מהנקודה B לציר ה-x».',
  'errHost.many.perpendicular': 'יש בשרטוט יותר מאנך אחד, ולא ברור לאיזה מהם המשפט מתייחס: "{{detail}}". כתבו מאיזו נקודה ואל איזה ישר, למשל «האנך מהנקודה B לציר ה-x».',
  'errHost.none.polygon': 'אין בשרטוט מצולע שהמשפט יכול להתייחס אליו: "{{detail}}". כתבו את הקודקודים, למשל «היקף המשולש ABC הוא 12».',
  'errHost.many.polygon': 'יש בשרטוט יותר ממצולע אחד כזה, ולא ברור לאיזה מהם המשפט מתייחס: "{{detail}}". כתבו את הקודקודים, למשל «היקף המשולש ABC הוא 12».',
  'errHost.pair.line': 'המשפט מתייחס לשני ישרים בלי לתת להם שמות, ובשרטוט יש {{found}}: "{{detail}}". כתבו את שמות הישרים, למשל «E נקודת החיתוך של הישרים l1 ו-l2».',
  'errHost.pair.circle': 'המשפט מתייחס לשני מעגלים בלי לתת להם שמות, ובשרטוט יש {{found}}: "{{detail}}". כתבו את שמות המעגלים, למשל «E נקודת החיתוך של המעגלים I ו-II».',
  // #1432 am. 1 — a stated value outside the range its quantity allows («רדיוס המעגל הוא -3»).
  errOutOfDomain: 'הערך במשפט "{{detail}}" אינו אפשרי כאן — הוא חייב להיות {{range}}.',
  'range.gt': 'גדול מ-{{v}}',
  'range.ge': 'לפחות {{v}}',
  'range.lt': 'קטן מ-{{v}}',
  'range.le': 'לכל היותר {{v}}',
  'range.ne': 'שונה מ-{{v}}',
  'range.and': ' ו',
  // #1432 am. 1 — the ask twin: a role question («רדיוס המעגל», «מוקד הפרבולה», «ההיקף») whose host is absent or plural.
  'askHost.none.circle': 'אין בשרטוט מעגל',
  'askHost.many.circle': 'יש בשרטוט יותר ממעגל אחד — כתבו את שם המעגל, למשל «רדיוס המעגל I»',
  'askHost.none.parabola': 'אין בשרטוט פרבולה',
  'askHost.many.parabola': 'יש בשרטוט יותר מפרבולה אחת',
  'askHost.none.ellipse': 'אין בשרטוט אליפסה',
  'askHost.many.ellipse': 'יש בשרטוט יותר מאליפסה אחת',
  'askHost.none.polygon': 'אין בשרטוט מצולע כזה — כתבו את הקודקודים, למשל «היקף ABC»',
  'askHost.many.polygon': 'יש בשרטוט יותר ממצולע אחד כזה — כתבו את הקודקודים, למשל «היקף ABC»',
  errAmbiguousAngle:
    'האות אחת לא מספיקה כדי לדעת באיזו זווית מדובר: "{{detail}}". אפשר לכתוב את שלוש האותיות, והקודקוד באמצע, למשל «זווית ABC», או לציין קודם את הצורה שבה הקודקוד נמצא.',
  errAmbiguousAngleArms:
    'בקודקוד הזה נפגשות יותר משתי צלעות, ולכן יש בו כמה זוויות ואות אחת לא אומרת באיזו מהן מדובר: "{{detail}}". כתבו את הזווית בשלוש אותיות, והקודקוד באמצע — למשל «זווית {{example}}».',
  errDoesNotExist:
    'בשרטוט הזה {{existing}} לא קיים — הנתונים כבר קובעים את כל הנקודות, ואין תצורה אחרת שבה הוא ' +
    'היה קיים. המשפט "{{detail}}" לא נוסף.',
  // #1170 — about the RING, never about a failed search: on a figure whose points are all pinned
  // there was only ever one configuration, so «לא נמצאה תצורה» would be a false sentence. Names
  // the student's own statement (#1145) and points at the two things they can actually change.
  // #1554 ruling 1 (ADR-AG-198) — המשפט סותר את שם הצורה שלו; שני השמות נאמרים, והתיקון מוצע.
  errInscribedContradictsNoun:
    '{{shapeHe}} לא יכול להיות חסום במעגל: "{{detail}}". מעגל שעובר דרך ארבעת הקודקודים הופך אותו ל{{forcedHe}}, ' +
    'ו{{forcedHe}} אינו {{shapeHe}}. אם הצורה היא {{forcedHe}}, כתבו «{{forcedHe}} ABCD חסום במעגל».',
  errRingContradictsNoun:
    'הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: "{{detail}}". אפשר לשנות את סדר האותיות ' +
    'כך שהצלעות לא ייחתכו, או לשנות את השיעורים — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.',
  errReservedCoordinate:
    'האותיות x ו-y שמורות לצירי מערכת הצירים, ולכן אי אפשר להשתמש בהן כנעלם בשיעורי נקודה: "{{detail}}". ' +
    'אפשר להשתמש באות אחרת, למשל M(3,t).',
  errBadArity:
    'מספר הקודקודים אינו מתאים לשם הצורה במשפט "{{detail}}" — במשולש שלושה קודקודים ובמרובע ארבעה.',
  errRepeatedVertex: 'באותו משפט אותה אות מופיעה יותר מפעם אחת: "{{detail}}". לכל קודקוד צריך שם משלו.',
  // #1231 — names the STATEMENT and the reason, never internal state, and shows what a correct
  // sentence looks like: a median or an altitude runs from a vertex to the side facing it.
  errDegenerateRole:
    'תיכון, גובה וחוצה זווית יוצאים מקודקוד אל הצלע שמולו, ובמשפט "{{detail}}" הקודקוד עצמו נמצא על הצלע הזאת ' +
    '(או שהוא גם הקודקוד וגם הרגל). אפשר לכתוב למשל "AD תיכון לצלע BC".',
  // #1165 — «XD תיכון במשולש ABC». The triangle spelling works by removing the apex from the ring,
  // so an apex outside it leaves three candidate sides and nothing to choose between them.
  errApexNotAVertex:
    'תיכון, גובה או חוצה זווית יוצאים מקודקוד של המשולש, ובמשפט "{{detail}}" הקודקוד שנכתב אינו אחד מקודקודי ' +
    'המשולש. אפשר לכתוב את הקודקוד שבמשולש, למשל "AD תיכון במשולש ABC", או לציין את הצלע במפורש.',
  // #1284 (ADR-AG-209) — the bisector runs FROM the vertex of the angle it bisects.
  errBisectorWrongApex:
    'חוצה זווית יוצא מקודקוד הזווית שהוא חוצה, ובמשפט "{{detail}}" הקטע אינו יוצא מהקודקוד הזה. ' +
    'כתבו קטע שמתחיל בקודקוד הזווית, למשל "AD חוצה את הזווית BAC".',
  // #1240 (ADR-AG-209) — a cevian whose target the figure does not determine: ask, never guess.
  errAmbiguousCevian:
    'הקודקוד או הצלע במשפט "{{detail}}" שייכים ליותר ממשולש אחד בשרטוט, ולכן לא ברור לאיזו צלע הוא יורד. ' +
    'אפשר לציין את הצלע או את המשולש, למשל "AD גובה לצלע BC" או "AD גובה במשולש ABC".',
  // #1222 (ADR-AG-211) — the hypotenuse is the side facing a STATED right angle; an open one is asked, never assumed.
  errAmbiguousSide:
    'בצורה הזאת הצלעות אינן שוות זו לזו, ולכן לא ידוע לאיזו צלע הכוונה: "{{detail}}". ' +
    'כתבו את הצלע עצמה, למשל "מלבן ABCD" ואחר כך "AB = 4", או את שתי המידות, למשל "מלבן ABCD במידות 4*6".',
  errPolygonNotSupported:
    'מצולע כזה נבנה רק כשהוא משוכלל: "{{detail}}". אפשר לכתוב אותו כמשוכלל (למשל "משובע משוכלל ABCDEFG"), ' +
    'או להשתמש במחומש, משושה או מתומן.',
  errAmbiguousHypotenuse:
    'לא נאמר איזו זווית במשולש ישרה, ולכן לא ידוע איזו צלע היא היתר: "{{detail}}". ' +
    'כתבו איזו צלע היא היתר, למשל "תיכון ליתר AB", או איזו זווית ישרה, למשל "זווית C ישרה".',
  errCevianNoRightAngle:
    'במשפט "{{detail}}" אין בשרטוט משולש ישר-זווית, ולכן אין יתר. ' +
    'אפשר לציין קודם זווית ישרה, למשל "זווית C ישרה", או לכתוב את הצלע במפורש, למשל "תיכון לצלע AB".',
  errCevianNoTriangle:
    'במשפט "{{detail}}" אין בשרטוט משולש שהקודקוד או הצלע שייכים לו, ולכן אין צלע שאליה הוא יורד. ' +
    'אפשר להגדיר קודם את המשולש, או לכתוב את הצלע במפורש, למשל "AD גובה לצלע BC".',
  // #1175 — the refusal's job is to tell them WHICH point is already there. It names the holder and
  // the reason, so a student who mis-read their own figure learns the thing they got wrong.
  errCrossingAlreadyNamed:
    'הישרים האלה נפגשים ב-{{holder}}, ולנקודה הזאת כבר יש שם. המשפט "{{detail}}" היה נותן לה שם שני. אם התכוונתם לנקודה אחרת, בדקו אילו שני ישרים נחתכים בה.',
  // #1255 — one line written twice has no crossing with itself. Says what the sentence failed to
  // define and shows the sentence that says what they may have meant, per the operator's ruling.
  errSelfCrossing:
    'שני הישרים במשפט "{{detail}}" הם אותו ישר, ולישר אין נקודת חיתוך עם עצמו, ולכן המשפט אינו מגדיר נקודה. אם התכוונתם לנקודה כלשהי על הישר, אפשר לכתוב למשל "P על הישר AB".',
  // #1251 — a THROTTLE is not a misunderstanding. The student is told the service is busy, never
  // that their sentence was wrong: the tool did not get as far as looking at it.
  errLlmBusy:
    'השירות עמוס כרגע ולא הצלחתי לבדוק את המשפט "{{detail}}". אפשר לנסות שוב בעוד רגע, או לנסח אותו באחת הצורות שמופיעות ברשימת הפקודות.',
  // #1336: the escape ran and the tool declined its completion — the sentence WAS understood.
  errLlmUnderstood:
    'הבנתי את המשפט "{{detail}}", אבל הכלי עדיין לא תומך במהלך הזה. אפשר לנסח אחרת, או להיעזר ברשימת הפקודות.',
  thinking: 'חושב…',
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
  // The definite noun a student writes before a curve's name — «הפרבולה I» (#1514 pre-play).
  numNounPoint: 'נקודה',
  numNounLine: 'ישר',
  numNounCircle: 'מעגל',
  numNounParabola: 'פרבולה',
  numNounEllipse: 'אליפסה',
  numNounCurve: 'עצם',
  nounThePoint: 'הנקודה',
  nounTheLine: 'הישר',
  nounTheCircle: 'המעגל',
  nounTheParabola: 'הפרבולה',
  nounTheEllipse: 'האליפסה',
  nounTheCurve: 'העצם',
  kindMidpoint: 'אמצע קטע',
  kindCentroid: 'מפגש התיכונים',
  kindIncentre: 'מפגש חוצי הזוויות',
  kindOrthocentre: 'מפגש הגבהים',
  kindCircumcentre: 'מפגש האנכים האמצעיים',
  kindDiagonalMeet: 'מפגש האלכסונים',
  // Informational, NOT a refusal (#1045): the student restated something the figure already holds,
  // so the message confirms they were right and explains why no row appeared.
  // «הציגו תצורה אחרת» found none — an answer about the figure, not a failure (#1084).
  noticeOnlyConfiguration: 'זו התצורה היחידה שמצאתי — הנתונים שכתבתם קובעים את השרטוט.',
  // #1627 (ADR-AG-189 Am. 1, operator ruling 2026-10-01; 2-D ADR-165): drawn, with this warning while it holds.
  warnTrapezoidIsParallelogram:
    'הטרפז {{shape}} כבר אינו טרפז: עם "{{line}}" שני זוגות הצלעות הנגדיות שלו מקבילים, ולכן הוא מקבילית (או מלבן). ' +
    'השרטוט מוצג כפי שהנתונים קובעים. כדי לחזור לטרפז, אפשר לערוך את המשפט הזה, למחוק אותו או לבטל את «כלול בציור».',
  noticeAlreadyKnown: 'זה כבר ידוע מהנתונים שכתבתם, ולכן לא הוספתי שורה נוספת: "{{detail}}"',
  // #1350 (operator ruling 2026-09-22) — the line IS recorded; this is about identity, never an error.
  noticeNameReadsAs: 'שימו לב: הישר {{detail}} והישר {{holder}} הם שני ישרים שונים — השמות נקראים דומה, אבל כל שם מתייחס לישר שלו.',
  // A different sentence from «כבר ידוע» on purpose (#1063): the student did NOT repeat themselves —
  // they stated something the figure had already settled, which is a thing worth telling them.
  // ── The session chrome (#1087): one vocabulary across the suite, so a student who learned
  // «שמור»/«טען» in הנדסת המישור reads the same words here.
  save: 'שמור',
  load: 'טען',
  namePlaceholder: 'שם השרטוט (לא חובה)',
  copyImage: 'העתיקו תמונה',
  saveImage: 'הורידו תמונה',
  copied: 'הועתק',
  manualButton: 'מדריך',
  manualTitle: 'המדריך — גאומטריה אנליטית',
  manualIntro:
    'זהו מדריך חלקי — מוצגות דוגמאות מייצגות בלבד, כדי להראות אילו מיני משפטים אפשר להקליד. ' +
    'לחצו על דוגמה כדי לנסות אותה על השרטוט.',
  manualTry: 'לחצו כדי לנסות — הדוגמה תיבנה על השרטוט',
  manualMore: '…ואלו רק דוגמאות — לכלי יש כאן פקודות נוספות, לא רק ניסוחים אחרים של אלו',
  manualShowAll: 'הצג הכול',
  manualShowLess: 'הצג פחות',
  manualPoints: 'נקודות',
  manualLines: 'ישרים',
  manualCircles: 'מעגלים',
  manualConics: 'פרבולות ואליפסות',
  manualShapes: 'צורות',
  manualRelations: 'קשרים בין עצמים',
  manualDerived: 'נקודות נגזרות',
  manualParameters: 'פרמטרים ואי-שוויונים',
  // A load says what it RESTORED and, separately, what it could not — a line that no longer builds
  // is named, never dropped in silence (ADR-242, and the reason a save holds lines and not points).
  loadRestored: 'טענתי את השרטוט — {{total}} נתונים.',
  loadPartial:
    'טענתי {{restored}} נתונים מתוך {{total}}. את אלה לא הצלחתי לקרוא מחדש: {{lines}}',
  errLoadForeign: 'הקובץ "{{detail}}" שייך לכלי אחר בסדרה — פתחו אותו שם.',
  errLoadNewer: 'הקובץ "{{detail}}" נשמר בגרסה חדשה יותר של הכלי — רעננו את הדף ונסו שוב.',
  errLoadTooLarge: 'הקובץ "{{detail}}" גדול מדי ולא ייפתח — שרטוט יכול להכיל עד {{max}} משפטים.',
  errLoadUnreadable: 'הקובץ "{{detail}}" אינו קובץ שרטוט שמור.',
  // The under-canvas row's session ops (#1098) — the suite's words, so «בטל» means here what it
  // means in הנדסת המישור.
  undo: 'בטל',
  redo: 'בצע שוב',
  noticeAlreadyFollows:
    'זה כבר נובע מהנתונים שכתבתם — השרטוט מקיים את זה ממילא, ולכן לא הוספתי שורה נוספת: "{{detail}}"',
  /**
   * #1353 / ADR-W-030 — the teaching line for an imperative wrapper.
   *
   * It names the student's own verb, shows the textbook sentence, and says what to press. The
   * sentence is already in the input box when this appears, so «לחצו Enter» is literally true.
   */
  noticeTeachCanonical:
    'בספר לא כותבים "{{verb}}" — כותבים את הנתון עצמו. כתבתי לכם את המשפט בשורת הקלט: "{{canonical}}" — לחצו Enter כדי לשרטט.',
  // #1238 (ADR-W-068) — the continue-or-start-fresh offer. The builder still opens EMPTY.
  sessionOffer: 'נמצאה עבודה מהפעם הקודמת שלא נשמרה.',
  sessionContinue: 'המשך מהמקום שבו הפסקת',
  sessionStartFresh: 'התחל מחדש',
  // #1372 (ADR-W-080) — the share link, and #1373's ask-before-replacing.
  shareCopyLink: 'העתק קישור',
  shareCopied: 'הקישור הועתק',
  shareTooLong: 'הקישור ארוך מדי לשיתוף — שמרו את השרטוט כקובץ ושלחו אותו',
  shareBadLink: 'הקישור אינו תקין — בקשו מהשולח לשלוח אותו שוב',
  shareTooLarge: 'הקישור גדול מדי ולא ייפתח — שרטוט יכול להכיל עד {{max}} משפטים. בקשו מהשולח לשלוח את השרטוט כקובץ',
  shareArrived: 'הקישור שפתחתם מכיל שרטוט. לפתוח אותו במקום מה שבניתם?',
  shareOpenIt: 'פתח את השרטוט מהקישור',
  shareKeepMine: 'השאר את שלי',
  sharePreparing: 'מכין קישור…',
  shareReady: 'הקישור מוכן — העתיקו ושלחו',
  shareCopyButton: 'העתק',
  shareStoreFull: 'שטח השיתוף בשרת מלא — זהו הקישור הארוך, והוא עובד',
  shareOffline: 'לא הצלחנו ליצור קישור קצר — זהו הקישור הארוך, והוא עובד',
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
  // #1281 — the name the tool gave a point stated only by its coordinates (the #1263 ruling: say so).
  mintedNote: 'named {{name}} by the tool',
  factsEmpty: 'No givens yet.',
  factCount: '{{count}} givens',
  factToggle: 'Include in the figure',
  another: 'Show another configuration',
  dataTitle: 'Data',
  dataShow: 'Show data',
  showConstruction: 'Show construction',
  hideConstruction: 'Hide construction',
  dataHide: 'Hide data',
  secPoints: 'Points',
  secEquations: 'Equations',
  secLengths: 'Lengths',
  secSlopes: 'Slopes',
  askPlaceholder: 'Ask: AB, area of ABC, angle ABC',
  askAdd: 'Ask',
  askTraceLabel: 'how this is reached',
  askHintAngleMethods: 'You can use the slopes of the lines or the law of cosines',
  askHintAngleSlopes: 'You can use the slopes of the lines',
  askTraceToggle: 'show or hide the working',
  curveDetailsCircle: "the circle's properties",
  curveDetailsParabola: "the parabola's properties",
  curveDetailsEllipse: "the ellipse's properties",
  curveDetailsToggle: 'show or hide these properties',
  askRemove: 'Remove this measurement',
  askOpen: 'not fixed by the givens yet',
  askNoValue: 'cannot be computed from the givens',
  checking: 'checking…',
  askPointOne: 'a point',
  askPointTwo: 'two points',
  askPointMany: '{{count}} points',
  askLinesCross:
    'the lines intersect, so there is no single distance between them — it is zero at the crossing and grows away from it. A distance is defined only between PARALLEL lines. You can ask for the distance from a point to a line, for example "the distance from A to line l1", or name the crossing point itself.',
  askUnreadable: 'I did not understand the question',
  askContextualPoint: 'the figure has {{points}} points — name the point (e.g. "המרחק של A מהישר")',
  askContextualLine: 'the figure has {{lines}} lines — name the line (e.g. "המרחק של הנקודה מהישר l1")',
  askContextualBoth: 'the figure has {{points}} points and {{lines}} lines — name them (e.g. "המרחק של A מהישר l1")',
  askMissingPoint: 'there is no point {{name}} in your figure',
  askMissingCurve: 'there is no line or circle named {{name}} in your figure',
  askNumeralNotation: '{{name}} and {{used}} are the same name — this figure writes it {{used}}. Write {{used}}, to keep one notation.',
  paletteShow: 'Symbols',
  symSq: 'squared',
  symSqrt: 'square root',
  symEll: 'a line’s name',
  symLe: 'less than or equal',
  symGe: 'greater than or equal',
  symNe: 'not equal to',
  symCube: 'cubed',
  symMul: 'multiply',
  symPi: 'pi',
  symAbs: 'the length of a segment',
  symDist: 'distance between two points',
  symComponent: 'the x-coordinate of a point',
  symPerp: 'perpendicular to',
  symPar: 'parallel to',
  symAngle: 'angle',
  symDeg: 'degrees',
  symTriangle: 'triangle',
  symCong: 'congruent to',
  symSim: 'similar to',
  symAlpha: 'alpha — an angle’s name',
  symBeta: 'beta — an angle’s name',
  symGamma: 'gamma — an angle’s name',
  symDelta: 'delta — an angle’s name',
  symTheta: 'theta — an angle’s name',
  symLt: 'less than',
  symArea: 'the area of a polygon',
  symArc: 'arc',
  slopeVertical: 'vertical (no slope)',
  angleWithX: 'angle with the x-axis',
  secParams: 'Parameters',
  paramUnused: '(not used by the figure)',
  freeDof: 'Degrees of freedom: {{count}}',
  pinned: '✓ The figure is fully determined by the givens',
  about: 'About',
  aboutTitle: 'Analytic Geometry',
  aboutLead:
    'A tool for drawing analytic-geometry questions: type the givens as the exam words them and the tool draws the figure. It does not solve the question.',
  // #1477 (ADR-W-091): the About DECLARATION's parts — the same sections as 2-D's About.
  aboutPoints: [
    'For high-school students preparing for the analytic-geometry matriculation (bagrut), and for teachers who need to sketch on a coordinate plane quickly and simply.',
    'Add one given at a time — points, lines, circles — and the figure adapts as the givens accumulate.',
    'When the givens allow more than one figure, “Show another configuration” draws a different one that also satisfies every given.',
    'It draws the figure from what you describe — it does not solve problems.',
  ],
  aboutTryTitle: 'Enter the given data exactly as it appears in the question:',
  aboutTrySteps: ['circle I: (x-3)^2+(y-4)^2=9', 'point A(2,6)', 'line l1: y=x'],
  creditBy: 'Developed by',
  creditName: 'Dr. David Codish',
  creditContact: 'Questions',
  privacy:
    'Privacy: no sign-up and no personal details are collected. To improve the tool, the statements you type (math text only) are kept for a few days with an anonymous visitor id — your IP address is never stored.' +
    ' Statements the tool does not understand are sent for processing to an external AI service.' +
    ' When you press “Copy link”, the figure and a picture of it are stored on the server so the link can work — with no name and no personal details, and anyone holding the link can open it.',
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
  errProofTarget:
    'That is a claim to prove, not a given — this tool draws the givens; it does not check proofs. Type only what the question gives: "{{detail}}"',
  errConflict: 'Not added — it contradicts what is already fixed: "{{detail}}"',
  errNameClash:
    'That name is already taken in this figure — it is {{existing}}. It cannot take a second ' +
    'meaning in "{{detail}}". Either choose another letter, or delete the earlier definition and ' +
    'restate it.',
  errUnknownRef: 'There is no object called {{detail}} in the figure. Define it first, then you can refer to it.',
  errUnknownRefPoint: 'The point {{detail}} has not been defined yet. Define it first, then you can refer to it.',
  errUnknownRefLine: 'The line {{detail}} has not been defined yet. Define it first, then you can refer to it.',
  errUnknownRefCircle: 'The circle {{detail}} has not been defined yet. Define it first, then you can refer to it.',
  errUnknownRefParabola: 'The parabola {{detail}} has not been defined yet. Define it first, then you can refer to it.',
  errUnknownRefEllipse: 'The ellipse {{detail}} has not been defined yet. Define it first, then you can refer to it.',
  errKindMismatch:
    'The equation in "{{detail}}" describes {{existing}}, not {{claimed}}. Check the equation, or name the shape it describes.',
  'errHost.named':
    'The figure has more than one of these ({{candidates}}), so it is not clear which one "{{detail}}" means. Write its name — for example "{{example}}".',
  errNumeralNotation:
    '"{{numNoun}} {{holder}}" and "{{numNoun}} {{detail}}" are the same name — the tool reads a digit and a Roman numeral as one name. To keep one notation, write "{{numNoun}} {{holder}}", as in the earlier lines.',
  errAlreadyNamed: 'that point already has a name: {{holder}}. To change it, delete the line that named {{holder}} and write it again.',
  errRenameBadName: '"{{detail}}" is not a point name. A point is named by one capital Latin letter, optionally with a digit — e.g. G or A1.',
  errRenameSame: '{{detail}} is already called {{detail}} — nothing to change.',
  errRenameUnknown: 'The figure has no point named {{detail}}, so there is nothing to rename.',
  errRenameTaken: 'The letter {{detail}} is already taken: "{{holder}}". Pick a free letter.',
  errRenameTakenTool: 'The letter {{detail}} is already taken in the figure. Pick a free letter.',
  errRenameNotTyped: 'The letter {{detail}} was chosen by the tool, and it cannot be written into your sentence without changing what it says, so it was not changed.',
  errRenameUnsafe: 'I could not rename {{holder}} in "{{detail}}" without changing what it says. Edit that line by hand.',
  errRenameUnsafeFigure: 'Renaming {{holder}} would also change a name the tool chose in the figure, so it was not done.',
  errSwapSame: '{{detail}} cannot be swapped with itself — pick two different letters.',
  errSwapUnknown: 'The figure has no point named {{detail}}, so there is nothing to swap with.',
  errSwapUnsafe: 'I could not swap {{holder}} and {{other}} in "{{detail}}" without changing what it says. Edit that line by hand.',
  errSwapUnsafeFigure: 'Swapping {{holder}} and {{other}} would also change a name the tool chose in the figure, so it was not done.',
  letterPlaceholder: 'letter',
  letterApply: 'Apply',
  letterTaken: 'Letter already used',
  letterBad: 'Invalid letter',
  letterTakenBy: 'Held by: «{{what}}»',
  letterSwap: 'Swap {{a}} and {{b}}',
  segHide: 'Hide segment',
  segShow: 'Show segment',
  segDashed: 'Dashed',
  segSolid: 'Solid',
  centreTitle: 'Circle centre',
  errUnsatisfiable: 'No configuration satisfies: "{{detail}}"',
  errUnsatisfiableReused: '{{reusedId}} is already defined: "{{definedBy}}". "{{detail}}" contradicts that definition — pick another letter for a new point.',
  'locus.line': 'line',
  'locus.circle': 'circle',
  'locus.parabola': 'parabola',
  'locus.ellipse': 'ellipse',
  'locus.line.2': 'two lines',
  'locus.circle.2': 'two circles',
  'locus.parabola.2': 'two parabolas',
  'locus.ellipse.2': 'two ellipses',
  errNotADiagonal:
    'Those letters name sides of the quadrilateral, not its diagonals: "{{detail}}". A diagonal joins two ' +
    'vertices that are not adjacent, for example "the diagonals AC and BD meet at E" in quadrilateral ABCD.',
  errNoPrincipalDiagonal:
    'This shape has no principal and secondary diagonal — that distinction exists only for shapes ' +
    'like a kite: "{{detail}}". Name the diagonal by its vertices instead, for example "the ' +
    'equation of diagonal AC is y=2x".',
  errAmbiguousShape:
    'No single shape in this figure answers to that: "{{detail}}". Name its vertices — for example "the area of kite ABCD is 24".',
  'errHost.none.circle': 'There is no circle in your figure for this sentence to refer to: "{{detail}}". Define a circle first, e.g. "circle O".',
  'errHost.many.circle': 'Your figure has more than one circle, so it is unclear which one this sentence means: "{{detail}}". Name the circle, e.g. "circle I".',
  'errHost.none.parabola': 'There is no parabola in your figure for this sentence to refer to: "{{detail}}". Define the parabola first, e.g. "parabola y^2=8x".',
  'errHost.many.parabola': 'Your figure has more than one parabola, so it is unclear which one this sentence means: "{{detail}}".',
  'errHost.none.ellipse': 'There is no ellipse in your figure for this sentence to refer to: "{{detail}}". Define the ellipse first, e.g. "ellipse x^2/25+y^2/9=1".',
  'errHost.many.ellipse': 'Your figure has more than one ellipse, so it is unclear which one this sentence means: "{{detail}}".',
  'errHost.none.line': 'There is no line in your figure for this sentence to refer to: "{{detail}}". Define the line first, e.g. "line l1: y=2x+1".',
  'errHost.many.line': 'Your figure has more than one line, so it is unclear which one this sentence means: "{{detail}}". Name the line, e.g. "line l1".',
  'errHost.none.perpendicular': 'There is no perpendicular in your figure for this sentence to refer to: "{{detail}}". Drop the perpendicular first, e.g. "the perpendicular from B to the x-axis".',
  'errHost.many.perpendicular': 'Your figure has more than one perpendicular, so it is unclear which one this sentence means: "{{detail}}". Say from which point and onto which line, e.g. "the perpendicular from B to the x-axis".',
  'errHost.none.polygon': 'There is no polygon in your figure for this sentence to refer to: "{{detail}}". Write its vertices, e.g. "the perimeter of triangle ABC is 12".',
  'errHost.many.polygon': 'Your figure has more than one such polygon, so it is unclear which one this sentence means: "{{detail}}". Write its vertices, e.g. "the perimeter of triangle ABC is 12".',
  'errHost.pair.line': 'This sentence refers to two unnamed lines, and your figure has {{found}}: "{{detail}}". Name the lines, e.g. "E is the intersection of lines l1 and l2".',
  'errHost.pair.circle': 'This sentence refers to two unnamed circles, and your figure has {{found}}: "{{detail}}". Name the circles, e.g. "E is the intersection of circles I and II".',
  errOutOfDomain: 'The value in "{{detail}}" is not possible here — it must be {{range}}.',
  'range.gt': 'greater than {{v}}',
  'range.ge': 'at least {{v}}',
  'range.lt': 'less than {{v}}',
  'range.le': 'at most {{v}}',
  'range.ne': 'different from {{v}}',
  'range.and': ' and ',
  'askHost.none.circle': 'there is no circle in your figure',
  'askHost.many.circle': 'your figure has more than one circle — name it, e.g. "radius of circle I"',
  'askHost.none.parabola': 'there is no parabola in your figure',
  'askHost.many.parabola': 'your figure has more than one parabola',
  'askHost.none.ellipse': 'there is no ellipse in your figure',
  'askHost.many.ellipse': 'your figure has more than one ellipse',
  'askHost.none.polygon': 'there is no such polygon in your figure — write its vertices, e.g. "perimeter of ABC"',
  'askHost.many.polygon': 'your figure has more than one such polygon — write its vertices, e.g. "perimeter of ABC"',
  errAmbiguousAngle:
    'One letter is not enough to say which angle is meant: "{{detail}}". Write all three letters, the vertex ' +
    'in the middle — for example "angle ABC" — or state the shape the vertex belongs to first.',
  errAmbiguousAngleArms:
    'More than two sides meet at that vertex, so it has several angles and one letter does not say which is meant: "{{detail}}". ' +
    'Write the angle with three letters, the vertex in the middle — for example "angle {{example}}".',
  errDoesNotExist:
    'In this figure {{existing}} does not exist — the givens already fix every point, and there is ' +
    'no other configuration where it would. "{{detail}}" was not added.',
  // #1554 ruling 1 (ADR-AG-198) — the sentence contradicts its own noun; both nouns named, the remedy offered.
  errInscribedContradictsNoun:
    'A {{shapeEn}} cannot be inscribed in a circle: "{{detail}}". A circle around it would make it a {{forcedEn}}, ' +
    'and a {{forcedEn}} is not a {{shapeEn}}. If the shape is a {{forcedEn}}, write "{{forcedEn}} ABCD is inscribed in a circle".',
  errRingContradictsNoun:
    'The points you gave do not form that shape in this order: "{{detail}}". Reorder the letters so ' +
    'the sides do not cross, or change the coordinates — as written the vertices fall on one line or the shape folds over itself.',
  errReservedCoordinate:
    'The letters x and y name the axes, so they cannot be a point\'s unknown: "{{detail}}". ' +
    'Use another letter — for example M(3,t).',
  errBadArity:
    'The number of vertices does not match the shape named in "{{detail}}" — a triangle has three ' +
    'vertices and a quadrilateral four.',
  errRepeatedVertex:
    'The same letter appears more than once in "{{detail}}". Each vertex needs its own name.',
  errDegenerateRole:
    'A median, an altitude or an angle bisector runs from a vertex to the side OPPOSITE it, and in "{{detail}}" that ' +
    'vertex lies on the side itself (or is its own foot). Write it as, for example, ' +
    '"AD is the median to side BC".',
  errApexNotAVertex:
    'A median, an altitude or an angle bisector starts at a VERTEX of the triangle, and in "{{detail}}" the point ' +
    'written is not one of that triangle’s vertices. Use a vertex of the triangle — for ' +
    'example "AD is the median in triangle ABC" — or name the side outright.',
  errBisectorWrongApex:
    'An angle bisector starts at the VERTEX of the angle it bisects, and the segment in "{{detail}}" does not. ' +
    'Start the segment at the angle’s vertex — for example "AD bisects angle BAC".',
  errAmbiguousCevian:
    'The vertex or side in "{{detail}}" belongs to more than one triangle in your figure, so it is unclear which side it is drawn to. ' +
    'Name the side or the triangle — for example "AD is the altitude to side BC" or "AD is the altitude in triangle ABC".',
  errAmbiguousSide:
    'This shape\'s sides are not all equal, so it is unclear which side you mean: "{{detail}}". ' +
    'Name the side itself — for example "rectangle ABCD" and then "AB = 4" — or both dimensions, for example "rectangle ABCD 4 by 6".',
  errPolygonNotSupported:
    'A polygon with this many sides is built only when it is regular: "{{detail}}". Write it as regular ' +
    '(for example "regular heptagon ABCDEFG"), or use a pentagon, hexagon or octagon.',
  errAmbiguousHypotenuse:
    'Your figure does not say which angle of the triangle is right, so it is unclear which side is the hypotenuse: "{{detail}}". ' +
    'Name the hypotenuse — for example "the median to the hypotenuse AB" — or the right angle, for example "angle C is right".',
  errCevianNoRightAngle:
    'In "{{detail}}" there is no right triangle in your figure, so there is no hypotenuse. ' +
    'State a right angle first, for example "angle C is right", or name the side outright, for example "the median to side AB".',
  errCevianNoTriangle:
    'In "{{detail}}" the vertex or side belongs to no triangle in your figure, so there is no side to draw it to. ' +
    'Define the triangle first, or name the side outright — for example "AD is the altitude to side BC".',
  errCrossingAlreadyNamed:
    'Those lines meet at {{holder}}, and that point already has a name. "{{detail}}" would give it a second one. If you meant a different point, check which two lines cross there.',
  errSelfCrossing:
    'The two lines in "{{detail}}" are the same line, and a line has no intersection with itself, so the sentence defines no point. If you meant some point on that line, write for example "P on line AB".',
  errLlmBusy:
    'The service is busy, so I could not check "{{detail}}". Try again in a moment, or write it in one of the forms listed in the commands panel.',
  errLlmUnderstood:
    'I understood "{{detail}}", but the tool does not support this move yet. Try another phrasing, or the commands panel.',
  thinking: 'Working…',
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
  numNounPoint: 'point',
  numNounLine: 'line',
  numNounCircle: 'circle',
  numNounParabola: 'parabola',
  numNounEllipse: 'ellipse',
  numNounCurve: 'object',
  nounThePoint: 'the point',
  nounTheLine: 'the line',
  nounTheCircle: 'the circle',
  nounTheParabola: 'the parabola',
  nounTheEllipse: 'the ellipse',
  nounTheCurve: 'the object',
  kindMidpoint: 'a midpoint',
  kindCentroid: 'the centroid',
  kindIncentre: 'the incentre',
  kindOrthocentre: 'the orthocentre',
  kindCircumcentre: 'the circumcentre',
  kindDiagonalMeet: 'the intersection of the diagonals',
  noticeOnlyConfiguration: 'This is the only configuration I found — your givens fix the figure.',
  warnTrapezoidIsParallelogram:
    'Trapezoid {{shape}} is no longer a trapezoid: with "{{line}}" both pairs of its opposite sides are parallel, so it is a parallelogram (or a rectangle). ' +
    'The figure is drawn as your givens fix it. To get a trapezoid back, edit or delete that statement, or untick «Include in the figure».',
  noticeAlreadyKnown: 'That is already known from what you have written, so I did not add another row: "{{detail}}"',
  noticeNameReadsAs: 'Note: line {{detail}} and line {{holder}} are two different lines — the names read alike, but each one refers to its own line.',
  save: 'Save',
  load: 'Load',
  namePlaceholder: 'Figure name (optional)',
  copyImage: 'Copy image',
  saveImage: 'Download image',
  copied: 'Copied',
  manualButton: 'Guide',
  manualTitle: 'The guide — analytic geometry',
  manualIntro:
    'A partial guide — representative examples only, to show what kinds of sentence you can type. ' +
    'Click an example to try it on the figure.',
  manualTry: 'Click to try — the example will be built on the figure',
  manualMore: '…and these are only examples — the tool has more COMMANDS here, not just other phrasings of these',
  manualShowAll: 'Show all',
  manualShowLess: 'Show fewer',
  manualPoints: 'Points',
  manualLines: 'Lines',
  manualCircles: 'Circles',
  manualConics: 'Parabolas and ellipses',
  manualShapes: 'Shapes',
  manualRelations: 'Relations between objects',
  manualDerived: 'Derived points',
  manualParameters: 'Parameters and inequalities',
  loadRestored: 'Figure loaded — {{total}} givens.',
  loadPartial: 'Loaded {{restored}} of {{total}} givens. These could not be read again: {{lines}}',
  errLoadForeign: 'The file "{{detail}}" belongs to another builder in the suite — open it there.',
  errLoadNewer: 'The file "{{detail}}" was saved by a newer version of the tool — refresh and try again.',
  errLoadTooLarge: 'The file "{{detail}}" is too large to open — a figure can hold up to {{max}} statements.',
  errLoadUnreadable: 'The file "{{detail}}" is not a saved figure.',
  undo: 'Undo',
  redo: 'Redo',
  noticeAlreadyFollows:
    'That already follows from what you have written — the figure satisfies it anyway, so I did not add another row: "{{detail}}"',
  noticeTeachCanonical:
    'A textbook does not say "{{verb}}" — it states the given itself. I have put the sentence in the input box for you: "{{canonical}}" — press Enter to draw it.',
  // #1238 (ADR-W-068) — the continue-or-start-fresh offer. The builder still opens EMPTY.
  sessionOffer: 'Unsaved work from your last session was found.',
  sessionContinue: 'Continue where you left off',
  sessionStartFresh: 'Start fresh',
  // #1372 (ADR-W-080) — the share link, and #1373's ask-before-replacing.
  shareCopyLink: 'Copy link',
  shareCopied: 'Link copied',
  shareTooLong: 'This link is too long to share — save the figure as a file and send that instead',
  shareBadLink: 'This link is not valid — ask the sender to send it again',
  shareTooLarge: 'This link is too large to open — a figure can hold up to {{max}} statements. Ask the sender to send the figure as a file',
  shareArrived: 'The link you opened contains a figure. Open it instead of what you built?',
  shareOpenIt: 'Open the shared figure',
  shareKeepMine: 'Keep mine',
  sharePreparing: 'Preparing link…',
  shareReady: 'Your link is ready — copy it and send it',
  shareCopyButton: 'Copy',
  shareStoreFull: 'The share space on the server is full — this is the long link, and it works',
  shareOffline: 'Could not make a short link — this is the long link, and it works',
};

export const analyticI18n = createProductI18n({
  resources: { he, en },
  postProcessors: [analyticBidi.postProcessor('bidiIsolateAg')],
});
