// Own i18next instance (the ADR-3D-001 §9 rule: sibling instances must not clobber each other).
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

export const complexI18n = i18next.createInstance();

const he = {
  title: 'בונה מרוכבים — אב-טיפוס',
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
  freeLabel: 'מספר חופשי (ניתן לגרירה)',
  implicitLabel: 'נוצר מעצם האזכור — חופשי, ניתן לגרירה',
  factCount: '{{count}} משפטים',
};

const en = {
  title: 'Complex Builder — prototype',
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
  freeLabel: 'free number (draggable)',
  implicitLabel: 'created by reference — free, draggable',
  factCount: '{{count}} statements',
};

complexI18n.use(initReactI18next).init({
  lng: 'he',
  fallbackLng: 'he',
  resources: { he: { translation: he }, en: { translation: en } },
  interpolation: { escapeValue: false },
});
