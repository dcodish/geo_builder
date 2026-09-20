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
  factsEmpty: 'אין עדיין נתונים.',
  factCount: '{{count}} נתונים',
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
  askPlaceholder: 'שאלו: AB, שטח ABC',
  askAdd: 'שאל',
  /** The ✕ that retires a measurement and the height it drew (#1118). */
  askTraceLabel: 'איך מגיעים לזה',
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
  askUnreadable: 'לא הבנתי את השאלה',
  /** #1111 — the sentence was understood; the figure has no such object. The LETTER is the point. */
  askMissingPoint: 'אין בשרטוט נקודה בשם {{name}}',
  askMissingCurve: 'אין בשרטוט ישר או מעגל בשם {{name}}',
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
  // A vertical segment HAS no slope, and that is an answer rather than an absence (#1078).
  slopeVertical: 'אנכי (אין שיפוע)',
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
  // #1179 — one sentence per KIND, written out rather than templated: Hebrew gender carries through
  // the whole clause («הנקודה … הוגדרה» vs «הישר … הוגדר»), so a noun slotted into one sentence would
  // be wrong in three of four cases. `errUnknownRef` stays as the kind-free fallback.
  errUnknownRef: 'אין בשרטוט עצם בשם {{detail}}. הגדירו אותו קודם, ואז אפשר להתייחס אליו.',
  errUnknownRefPoint: 'הנקודה {{detail}} עדיין לא הוגדרה. הגדירו אותה קודם, ואז אפשר להתייחס אליה.',
  errUnknownRefLine: 'הישר {{detail}} עדיין לא הוגדר. הגדירו אותו קודם, ואז אפשר להתייחס אליו.',
  errUnknownRefCircle: 'המעגל {{detail}} עדיין לא הוגדר. הגדירו אותו קודם, ואז אפשר להתייחס אליו.',
  errAlreadyNamed: 'כבר יש שם לנקודה הזו: {{holder}}. כדי לשנות את השם, מחקו את השורה של {{holder}} וכתבו אותה מחדש.',
  errUnsatisfiable: 'לא נמצאה תצורה שבה מתקיים: "{{detail}}"',
  // The locus families (#1137) — keyed by the engine's own kind, so a family added later shows its
  // internal name rather than nothing at all.
  'locus.line': 'ישר',
  'locus.circle': 'מעגל',
  'locus.parabola': 'פרבולה',
  'locus.ellipse': 'אליפסה',
  errNoPrincipalDiagonal:
    'בצורה הזאת אין אלכסון ראשי ואלכסון משני — ההבחנה הזאת קיימת רק בצורות כמו דלתון: "{{detail}}". אפשר לציין את האלכסון לפי הקודקודים, למשל «משוואת האלכסון AC היא y=2x».',
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
  // #1231 — names the STATEMENT and the reason, never internal state, and shows what a correct
  // sentence looks like: a median or an altitude runs from a vertex to the side facing it.
  errDegenerateRole:
    'תיכון וגובה יוצאים מקודקוד אל הצלע שמולו, ובמשפט "{{detail}}" הקודקוד עצמו נמצא על הצלע הזאת ' +
    '(או שהוא גם הקודקוד וגם הרגל). אפשר לכתוב למשל "AD תיכון לצלע BC".',
  // #1165 — «XD תיכון במשולש ABC». The triangle spelling works by removing the apex from the ring,
  // so an apex outside it leaves three candidate sides and nothing to choose between them.
  errApexNotAVertex:
    'תיכון או גובה יוצאים מקודקוד של המשולש, ובמשפט "{{detail}}" הקודקוד שנכתב אינו אחד מקודקודי ' +
    'המשולש. אפשר לכתוב את הקודקוד שבמשולש, למשל "AD תיכון במשולש ABC", או לציין את הצלע במפורש.',
  // #1175 — the refusal's job is to tell them WHICH point is already there. It names the holder and
  // the reason, so a student who mis-read their own figure learns the thing they got wrong.
  errCrossingAlreadyNamed:
    'הישרים האלה נפגשים ב-{{holder}}, ולנקודה הזאת כבר יש שם. המשפט "{{detail}}" היה נותן לה שם שני. אם התכוונתם לנקודה אחרת, בדקו אילו שני ישרים נחתכים בה.',
  // #1251 — a THROTTLE is not a misunderstanding. The student is told the service is busy, never
  // that their sentence was wrong: the tool did not get as far as looking at it.
  errLlmBusy:
    'השירות עמוס כרגע ולא הצלחתי לבדוק את המשפט "{{detail}}". אפשר לנסות שוב בעוד רגע, או לנסח אותו באחת הצורות שמופיעות ברשימת הפקודות.',
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
  noticeAlreadyKnown: 'זה כבר ידוע מהנתונים שכתבתם, ולכן לא הוספתי שורה נוספת: "{{detail}}"',
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
  manualMore: '…ואלו רק דוגמאות — הכלי מבין ניסוחים נוספים מהסוג הזה',
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
  errLoadUnreadable: 'הקובץ "{{detail}}" אינו קובץ שרטוט שמור.',
  // The under-canvas row's session ops (#1098) — the suite's words, so «בטל» means here what it
  // means in הנדסת המישור.
  undo: 'בטל',
  redo: 'בצע שוב',
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
  secEquations: 'Equations',
  secLengths: 'Lengths',
  secSlopes: 'Slopes',
  askPlaceholder: 'Ask: AB, area of ABC',
  askAdd: 'Ask',
  askTraceLabel: 'how this is reached',
  askTraceToggle: 'show or hide the working',
  curveDetailsCircle: "the circle's properties",
  curveDetailsParabola: "the parabola's properties",
  curveDetailsEllipse: "the ellipse's properties",
  curveDetailsToggle: 'show or hide these properties',
  askRemove: 'Remove this measurement',
  askOpen: 'not fixed by the givens yet',
  askNoValue: 'cannot be computed from the givens',
  askUnreadable: 'I did not understand the question',
  askMissingPoint: 'there is no point {{name}} in your figure',
  askMissingCurve: 'there is no line or circle named {{name}} in your figure',
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
  slopeVertical: 'vertical (no slope)',
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
  errUnknownRef: 'There is no object called {{detail}} in the figure. Define it first, then you can refer to it.',
  errUnknownRefPoint: 'The point {{detail}} has not been defined yet. Define it first, then you can refer to it.',
  errUnknownRefLine: 'The line {{detail}} has not been defined yet. Define it first, then you can refer to it.',
  errUnknownRefCircle: 'The circle {{detail}} has not been defined yet. Define it first, then you can refer to it.',
  errAlreadyNamed: 'that point already has a name: {{holder}}. To change it, delete the line that named {{holder}} and write it again.',
  errUnsatisfiable: 'No configuration satisfies: "{{detail}}"',
  'locus.line': 'line',
  'locus.circle': 'circle',
  'locus.parabola': 'parabola',
  'locus.ellipse': 'ellipse',
  errNoPrincipalDiagonal:
    'This shape has no principal and secondary diagonal — that distinction exists only for shapes ' +
    'like a kite: "{{detail}}". Name the diagonal by its vertices instead, for example "the ' +
    'equation of diagonal AC is y=2x".',
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
  errDegenerateRole:
    'A median or an altitude runs from a vertex to the side OPPOSITE it, and in "{{detail}}" that ' +
    'vertex lies on the side itself (or is its own foot). Write it as, for example, ' +
    '"AD is the median to side BC".',
  errApexNotAVertex:
    'A median or an altitude starts at a VERTEX of the triangle, and in "{{detail}}" the point ' +
    'written is not one of that triangle’s vertices. Use a vertex of the triangle — for ' +
    'example "AD is the median in triangle ABC" — or name the side outright.',
  errCrossingAlreadyNamed:
    'Those lines meet at {{holder}}, and that point already has a name. "{{detail}}" would give it a second one. If you meant a different point, check which two lines cross there.',
  errLlmBusy:
    'The service is busy, so I could not check "{{detail}}". Try again in a moment, or write it in one of the forms listed in the commands panel.',
  thinking: 'Thinking…',
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
  noticeOnlyConfiguration: 'This is the only configuration I found — your givens fix the figure.',
  noticeAlreadyKnown: 'That is already known from what you have written, so I did not add another row: "{{detail}}"',
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
  manualMore: '…and these are only examples — the tool reads further phrasings of the same kind',
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
  errLoadUnreadable: 'The file "{{detail}}" is not a saved figure.',
  undo: 'Undo',
  redo: 'Redo',
  noticeAlreadyFollows:
    'That already follows from what you have written — the figure satisfies it anyway, so I did not add another row: "{{detail}}"',
};

export const analyticI18n = createProductI18n({
  resources: { he, en },
  postProcessors: [analyticBidi.postProcessor('bidiIsolateAg')],
});
