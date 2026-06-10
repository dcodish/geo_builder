# 07 — Theorem Reference (Bagrut Geometry List)

_Last updated: 2026-06-10. Source: `docs/5pts_GeometryList_Teachers.pdf` — the official bagrut 5-unit (תכנית חדשה) teacher list of theorems citable without proof. This is the **canonical source** for the theorem-surfacing feature (FR-TH-\*)._

## How this maps to the engine

- **IDs = the official theorem numbers** (1–109). Surfacing a theorem with its bagrut number makes it citable by students — directly serving the "understand why the data was given / how to approach the solution" goal (Vision G4).
- **Type tag** tells the detection engine the theorem's role:
  - **P** — _property_: if the figure satisfies the hypothesis, the conclusion holds. Primary surfacing targets.
  - **C** — _converse / characterization_: features ⇒ a classification, or a biconditional ("a quadrilateral with X **is** a Y"). Used to identify/justify a type; also surfaceable.
  - **O** — _out of citable scope_: appendix items (practice-only, or removed from the curriculum). **Not** citable in exams; included for completeness only.
- **Definitions** and **area/perimeter formulas** appear as call-outs, not numbered theorems — they are reference, not detection targets.
- Detection (FR-TH-1) should surface **P** and **C** entries whose hypotheses the current figure satisfies; it should not surface definitions, formulas, or **O** entries.

> Bilingual (English + עברית) for the numbered theorems. Definitions/formulas are given in English with the Hebrew term in the heading.

---

## Angles · זוויות

| # | Type | English | עברית |
|---|------|---------|-------|
| 1 | P | Angles on a straight line (a linear pair) are supplementary — they sum to 180°. | זוויות צמודות משלימות זו את זו ל-180°. |
| 2 | P | Vertically opposite angles are equal. | זוויות קודקודיות שוות זו לזו. |

## Distances & parallel lines · מרחקים וישרים מקבילים

| # | Type | English | עברית |
|---|------|---------|-------|
| 3 | P | The distance between two parallel lines is constant (the perpendicular from any point on one to the other has constant length). | אורך האנך מנקודה על ישר לישר המקביל לו קבוע. |
| 4 | P | If two parallel lines are cut by a transversal, alternate angles are equal. | אם שני ישרים מקבילים נחתכים על ידי ישר שלישי, כל שתי זוויות מתחלפות שוות זו לזו. |
| 5 | C | If a transversal creates a pair of equal alternate angles, the two lines are parallel. | שני ישרים נחתכים על ידי ישר שלישי; אם נוצרו זוג זוויות מתחלפות שוות, אז שני הישרים מקבילים. |
| 6 | P | If two parallel lines are cut by a transversal, corresponding angles are equal. | אם שני ישרים מקבילים נחתכים על ידי ישר שלישי, כל שתי זוויות מתאימות שוות זו לזו. |
| 7 | C | If a transversal creates a pair of equal corresponding angles, the two lines are parallel. | שני ישרים נחתכים על ידי ישר שלישי; אם נוצרו זוג זוויות מתאימות שוות, אז שני הישרים מקבילים. |
| 8 | P | If two parallel lines are cut by a transversal, each pair of co-interior (same-side) angles sums to 180°. | אם שני ישרים מקבילים נחתכים על ידי ישר שלישי, סכום כל זוג זוויות חד-צדדיות הוא 180°. |
| 9 | C | If a transversal creates co-interior angles summing to 180°, the two lines are parallel. | שני ישרים נחתכים על ידי ישר שלישי; אם סכום זוג זוויות חד-צדדיות הוא 180°, אז שני הישרים מקבילים. |

## Triangles — general · משולשים (כללי)

> **Area · שטח:** (side × height to that side) / 2.

| # | Type | English | עברית |
|---|------|---------|-------|
| 10 | P | The interior angles of a triangle sum to 180°. | סכום הזוויות של משולש הוא 180°. |
| 11 | P | An exterior angle of a triangle equals the sum of the two non-adjacent interior angles. | זווית חיצונית למשולש שווה לסכום שתי הזוויות הפנימיות שאינן צמודות לה. |
| 12 | P | The sum of any two sides exceeds the third (triangle inequality). | סכום כל שתי צלעות במשולש גדול מהצלע השלישית (אי-שוויון המשולש). |
| 13 | P | In a non-equilateral triangle, the larger angle lies opposite the larger side. | במשולש (שאינו שווה צלעות), מול הצלע הגדולה יותר מונחת זווית גדולה יותר. |
| 14 | P | In a non-equiangular triangle, the larger side lies opposite the larger angle. | במשולש (שאינו שווה זוויות), מול הזווית הגדולה יותר מונחת צלע גדולה יותר. |
| 15 | P | The three medians of a triangle meet at one point (the centroid). | שלושת התיכונים במשולש נחתכים בנקודה אחת. |
| 16 | P | A median divides a triangle into two triangles of equal area. | תיכון במשולש מחלק את המשולש לשני משולשים שווי שטח. |
| 17 | P | The centroid divides each median in ratio 2:1 (the part nearer the vertex is twice the other). | נקודת חיתוך התיכונים מחלקת כל תיכון ביחס 2:1 (החלק הקרוב לקודקוד ארוך פי 2 מהחלק האחר). |

## Congruent triangles · משולשים חופפים

| # | Type | English | עברית |
|---|------|---------|-------|
| 18 | P | Congruence — Side-Angle-Side (SAS). | משפט חפיפה: צלע-זווית-צלע. |
| 19 | P | Congruence — Angle-Side-Angle (ASA). | משפט חפיפה: זווית-צלע-זווית. |
| 20 | P | Congruence — Side-Side-Side (SSS). | משפט חפיפה: צלע-צלע-צלע. |
| 21 | P | Congruence — two sides and the angle opposite the larger of the two. | משפט חפיפה: שתי צלעות והזווית שמול הצלע הגדולה מבין השתיים. |

## Isosceles triangle · משולש שווה שוקיים

| # | Type | English | עברית |
|---|------|---------|-------|
| 22 | P | In an isosceles triangle, the base angles are equal. | במשולש שווה שוקיים זוויות הבסיס שוות זו לזו. |
| 23 | C | A triangle with two equal angles is isosceles. | משולש שבו שתי זוויות שוות הוא משולש שווה שוקיים. |
| 24 | P | In an isosceles triangle, the apex-angle bisector, the median to the base, and the altitude to the base coincide. | במשולש שווה שוקיים, חוצה זווית הראש, התיכון לבסיס והגובה לבסיס מתלכדים. |
| 25 | C | If an angle bisector is also an altitude, the triangle is isosceles. | אם במשולש חוצה זווית הוא גובה, אז המשולש שווה שוקיים. |
| 26 | C | If an angle bisector is also a median, the triangle is isosceles. | אם במשולש חוצה זווית הוא תיכון, אז המשולש שווה שוקיים. |
| 27 | C | If an altitude is also a median, the triangle is isosceles. | אם במשולש גובה הוא תיכון, אז המשולש שווה שוקיים. |

## Right triangle · משולש ישר זווית

> **Area · שטח:** (leg × leg) / 2.

| # | Type | English | עברית |
|---|------|---------|-------|
| 28 | P | Pythagoras — in a right triangle, the sum of the squares of the legs equals the square of the hypotenuse. | משפט פיתגורס: במשולש ישר זווית, סכום ריבועי הניצבים שווה לריבוע היתר. |
| 29 | C | Converse of Pythagoras — a triangle in which the sum of the squares of two sides equals the square of the third is right-angled. | משפט פיתגורס ההפוך: משולש בו סכום ריבועי שתי צלעות שווה לריבוע הצלע השלישית הוא ישר זווית. |
| 30 | P | Two right triangles with an equal leg and an equal hypotenuse are congruent. | שני משולשים ישרי זווית שלהם ניצב שווה ויתר שווה חופפים זה לזה. |
| 31 | P | In a right triangle, the median to the hypotenuse equals half the hypotenuse. | במשולש ישר זווית התיכון ליתר שווה למחצית היתר. |
| 32 | C | A triangle in which a median equals half the side it bisects is right-angled. | משולש בו התיכון שווה למחצית הצלע אותה הוא חוצה הוא ישר זווית. |
| 33 | P | In a right triangle with a 30° acute angle, the leg opposite it equals half the hypotenuse. | אם במשולש ישר זווית יש זווית חדה של 30°, אז הניצב מול זווית זו שווה למחצית היתר. |
| 34 | C | In a right triangle, if a leg equals half the hypotenuse, the angle opposite that leg is 30°. | אם במשולש ישר זווית ניצב שווה למחצית היתר, אז מול ניצב זה זווית שגודלה 30°. |

## Quadrilaterals & polygons · מרובעים ומצולעים

| # | Type | English | עברית |
|---|------|---------|-------|
| 35 | P | The interior angles of a quadrilateral sum to 360°. | סכום הזוויות במרובע הוא 360°. |
| 36 | P | The interior angles of a convex n-gon sum to (n−2)·180°. | סכום הזוויות הפנימיות של מצולע קמור הוא (n−2)·180°. |

### Kite · דלתון

> **Definition · הגדרה:** a quadrilateral with two disjoint pairs of equal adjacent sides.
> **Area · שטח:** (diagonal × diagonal) / 2.

| # | Type | English | עברית |
|---|------|---------|-------|
| 37 | P | In a kite, the two angles between sides of different lengths are equal. | זוויות הצד בדלתון שוות זו לזו. |
| 38 | P | The main diagonal of a kite bisects the apex angles, bisects the secondary diagonal, and is perpendicular to it. | האלכסון הראשי בדלתון חוצה את זוויות הראש, חוצה את האלכסון המשני ומאונך לו. |

### Trapezoid · טרפז

> **Definition · הגדרה:** a quadrilateral with exactly one pair of parallel sides.
> **Area · שטח:** (sum of the bases × height) / 2.

| # | Type | English | עברית |
|---|------|---------|-------|
| 39 | P | In an isosceles trapezoid, the angles at the same base are equal. | בטרפז שווה שוקיים הזוויות שליד אותו בסיס שוות זו לזו. |
| 40 | C | A trapezoid in which the angles at the same base are equal is isosceles. | טרפז בו הזוויות שליד אותו בסיס שוות זו לזו הוא טרפז שווה שוקיים. |
| 41 | P | In an isosceles trapezoid, the diagonals are equal. | בטרפז שווה שוקיים האלכסונים שווים זה לזה. |
| 42 | C | A trapezoid with equal diagonals is isosceles. | טרפז בו האלכסונים שווים זה לזה הוא טרפז שווה שוקיים. |

### Parallelogram · מקבילית

> **Definition · הגדרה:** a quadrilateral with two pairs of parallel sides.
> **Area · שטח:** base × height to that base.

| # | Type | English | עברית |
|---|------|---------|-------|
| 43 | P | Opposite sides are equal. | במקבילית כל שתי צלעות נגדיות שוות זו לזו. |
| 44 | C | A quadrilateral with both pairs of opposite sides equal is a parallelogram. | מרובע שבו כל שתי צלעות נגדיות שוות זו לזו הוא מקבילית. |
| 45 | C | A quadrilateral with one pair of sides both parallel and equal is a parallelogram. | מרובע שבו זוג צלעות מקבילות ושוות הוא מקבילית. |
| 46 | P | The diagonals bisect each other. | במקבילית האלכסונים חוצים זה את זה. |
| 47 | C | A quadrilateral whose diagonals bisect each other is a parallelogram. | מרובע שבו האלכסונים חוצים זה את זה הוא מקבילית. |
| 48 | P | Opposite angles are equal. | במקבילית כל שתי זוויות נגדיות שוות זו לזו. |
| 49 | C | A quadrilateral with both pairs of opposite angles equal is a parallelogram. | מרובע שבו כל שתי זוויות נגדיות שוות הוא מקבילית. |
| 50 | P | Consecutive angles sum to 180°. | במקבילית סכום כל שתי זוויות סמוכות הוא 180°. |
| 51 | C | A quadrilateral in which every pair of consecutive angles sums to 180° is a parallelogram. | מרובע שבו הסכום של כל שתי זוויות סמוכות הוא 180° הוא מקבילית. |

### Rectangle · מלבן

> **Definition · הגדרה:** a quadrilateral with all right angles.
> **Area · שטח:** side × adjacent side.

| # | Type | English | עברית |
|---|------|---------|-------|
| 52 | P | The diagonals of a rectangle are equal. | במלבן האלכסונים שווים זה לזה. |
| 53 | C | A parallelogram with equal diagonals is a rectangle. | מקבילית שבה האלכסונים שווים זה לזה היא מלבן. |
| 54 | C | A parallelogram with a right angle is a rectangle. | מקבילית שבה יש זווית ישרה היא מלבן. |

### Rhombus · מעוין

> **Definition · הגדרה:** a quadrilateral with all sides equal.
> **Area · שטח:** (diagonal × diagonal) / 2, or base × height.

| # | Type | English | עברית |
|---|------|---------|-------|
| 55 | P | The diagonals of a rhombus bisect its angles. | במעוין האלכסונים חוצים את הזוויות. |
| 56 | P | The diagonals of a rhombus are perpendicular. | במעוין האלכסונים מאונכים זה לזה. |
| 57 | C | A parallelogram in which a diagonal bisects an angle is a rhombus. | מקבילית שבה אלכסון הוא חוצה זווית היא מעוין. |
| 58 | C | A parallelogram with perpendicular diagonals is a rhombus. | מקבילית שבה האלכסונים מאונכים זה לזה היא מעוין. |
| 59 | C | A parallelogram with two equal adjacent sides is a rhombus. | מקבילית שבה שתי צלעות סמוכות שוות היא מעוין. |

### Square · ריבוע

> **Definition · הגדרה:** a quadrilateral with all sides equal and all angles right.
> **Area · שטח:** side², or diagonal² / 2.

| # | Type | English | עברית |
|---|------|---------|-------|
| 60 | C | A rhombus with equal diagonals is a square. | מעוין שבו האלכסונים שווים הוא ריבוע. |
| 61 | C | A rectangle with equal adjacent sides is a square. | מלבן בו הצלעות הסמוכות שוות הוא ריבוע. |

## Midsegments — triangle & trapezoid · קטע אמצעים

> **Definition (triangle) · הגדרה:** the segment joining the midpoints of two sides of a triangle.
> **Definition (trapezoid) · הגדרה:** the segment joining the midpoints of the two legs of a trapezoid.

| # | Type | English | עברית |
|---|------|---------|-------|
| 62 | P | A triangle midsegment is parallel to the third side and equals half of it. | קטע אמצעים במשולש מקביל לצלע השלישית ושווה למחציתה. |
| 63 | P | A line bisecting one side of a triangle and parallel to a second side bisects the third side. | ישר החוצה צלע אחת במשולש ומקביל לצלע שנייה חוצה את הצלע השלישית. |
| 64 | C | A segment with endpoints on two sides, parallel to the third and half its length, is a midsegment. | קטע שקצותיו על שתי צלעות משולש, מקביל לצלע השלישית ושווה למחציתה, הוא קטע אמצעים. |
| 65 | P | The trapezoid midsegment is parallel to the bases and equals half their sum. | קטע האמצעים בטרפז מקביל לבסיסים ושווה למחצית סכומם. |
| 66 | P | In a trapezoid, a line bisecting one leg and parallel to the bases bisects the other leg. | בטרפז, ישר החוצה שוק אחת ומקביל לבסיסים חוצה את השוק השנייה. |
| 67 | C | A segment joining the two legs of a trapezoid, parallel to the bases and equal to half their sum, is the midsegment. | קטע המחבר שתי שוקיים בטרפז, מקביל לבסיסים ושווה למחצית סכומם, הוא קטע אמצעים. |

## Similarity & proportion · משפטי פרופורציה ודמיון

> **Definition (similar polygons) · הגדרה:** polygons in which corresponding angles are equal (order preserved) and the ratios of corresponding sides are all equal.

| # | Type | English | עברית |
|---|------|---------|-------|
| 68 | P | Similarity — Side-Angle-Side (SAS). | משפט דמיון: צלע-זווית-צלע. |
| 69 | P | Similarity — Angle-Angle (AA). | משפט דמיון: זווית-זווית. |
| 70 | P | Similarity — Side-Side-Side (SSS). | משפט דמיון: צלע-צלע-צלע. |
| 71 | P | In similar triangles, the ratios of corresponding heights, angle bisectors, medians, perimeters, circumradii, and inradii all equal the similarity ratio; the ratio of areas equals its square. | במשולשים דומים: יחס הגבהים, חוצי הזוויות, התיכונים, ההיקפים, רדיוסי המעגלים החוסמים ורדיוסי המעגלים החסומים — שווה ליחס הדמיון; יחס השטחים שווה לריבוע יחס הדמיון. |
| 72 | P | Thales — two parallel lines cutting the sides of an angle cut off proportional segments. | משפט תאלס: שני ישרים מקבילים החותכים שוקי זווית מקצים עליהם קטעים פרופורציוניים. |
| 73 | P | Extended Thales — a line parallel to one side of a triangle cuts the other two sides (or their extensions) in proportional segments. | משפט תאלס המורחב: ישר המקביל לאחת מצלעות המשולש חותך את שתי הצלעות האחרות (או את המשכיהן) בקטעים פרופורציוניים. |
| 74 | C | Converse of Thales — two lines that cut off four proportional segments on the sides of an angle are parallel. | משפט הפוך לתאלס: שני ישרים המקצים על שוקי זווית ארבעה קטעים פרופורציוניים הם ישרים מקבילים. |
| 75 | P | The angle bisector is the locus of all points equidistant from the sides of the angle. | חוצה הזווית הוא המקום הגיאומטרי של כל הנקודות הנמצאות במרחקים שווים משוקי הזווית. |
| 76 | P | The internal angle bisector of a triangle divides the opposite side in the ratio of the two adjacent sides. | חוצה זווית פנימית במשולש מחלק את הצלע שמולה לשני קטעים שהיחס ביניהם שווה ליחס הצלעות הכולאות את הזווית. |
| 77 | C | A line through a vertex that divides the opposite side (internally) in the ratio of the other two sides is the angle bisector. | ישר העובר דרך קודקוד וחוצה את הצלע שמולו ביחס שתי הצלעות האחרות הוא חוצה זווית המשולש. |

## Special segments, incircle/circumcircle, concurrency · קטעים מיוחדים, מעגל חוסם/חסום

| # | Type | English | עברית |
|---|------|---------|-------|
| 78 | P | Every point on an angle bisector is equidistant from the angle's sides. | כל נקודה על חוצה זווית נמצאת במרחקים שווים משוקי הזווית. |
| 79 | C | A point equidistant from both sides of an angle lies on the angle bisector. | אם נקודה נמצאת במרחקים שווים משני שוקי זווית, אז היא על חוצה הזווית. |
| 80 | P | The three angle bisectors of a triangle meet at one point — the incenter (center of the inscribed circle). | שלושת חוצי הזוויות של משולש נחתכים בנקודה אחת, שהיא מרכז המעגל החסום. |
| 81 | P | Every triangle has an inscribed circle. | בכל משולש אפשר לחסום מעגל. |
| 82 | P | Every point on the perpendicular bisector of a segment is equidistant from its endpoints. | כל נקודה על האנך האמצעי של קטע נמצאת במרחקים שווים מקצות הקטע. |
| 83 | C | A point equidistant from a segment's endpoints lies on its perpendicular bisector. | כל נקודה הנמצאת במרחקים שווים מקצות קטע נמצאת על האנך האמצעי. |
| 84 | P | Every triangle has a circumscribed circle. | כל משולש ניתן לחסום במעגל. |
| 85 | P | The three perpendicular bisectors of a triangle meet at one point — the circumcenter. | במשולש, שלושת האנכים האמצעיים נחתכים בנקודה אחת, שהיא מרכז המעגל החוסם. |
| 86 | P | The three altitudes of a triangle meet at one point (the orthocenter). | שלושת הגבהים במשולש נחתכים בנקודה אחת. |
| 87 | C | A quadrilateral is cyclic if and only if a pair of opposite angles sums to 180°. | ניתן לחסום מרובע במעגל אם ורק אם סכום זוג זוויות נגדיות שווה ל-180°. |
| 88 | C | A convex quadrilateral has an inscribed circle if and only if the sums of its two pairs of opposite sides are equal. | מרובע קמור חוסם מעגל אם ורק אם סכום שתי צלעות נגדיות שווה לסכום שתי הצלעות הנגדיות האחרות. |
| 89 | P | Every regular polygon has a circumscribed circle. | כל מצולע משוכלל אפשר לחסום במעגל. |
| 90 | P | Every regular polygon has an inscribed circle. | בכל מצולע משוכלל אפשר לחסום מעגל. |
| 91 | P | Through any three non-collinear points passes exactly one circle. | דרך כל שלוש נקודות שאינן על ישר אחד עובר מעגל אחד ויחיד. |

## Circles · מעגלים

> **Area · שטח:** π · radius². **Circumference · היקף:** π · diameter.

| # | Type | English | עברית |
|---|------|---------|-------|
| 92 | P | Two central angles are equal if and only if their corresponding arcs are equal. | במעגל, שתי זוויות מרכזיות שוות זו לזו אם ורק אם הקשתות המתאימות להן שוות. |
| 93 | P | Two central angles are equal if and only if their corresponding chords are equal. | במעגל, שתי זוויות מרכזיות שוות זו לזו אם ורק אם המיתרים המתאימים להן שווים. |
| 94 | P | Chords are equal if and only if their corresponding arcs are equal. | במעגל, מיתרים שווים זה לזה אם ורק אם הקשתות המתאימות להם שוות. |
| 95 | P | Equal chords are equidistant from the center. | מיתרים השווים זה לזה נמצאים במרחקים שווים ממרכז המעגל. |
| 96 | C | Chords equidistant from the center are equal. | מיתרים הנמצאים במרחקים שווים ממרכז המעגל שווים זה לזה. |
| 97 | P | The perpendicular from the center to a chord bisects the chord, its central angle, and its arc. | האנך ממרכז המעגל למיתר חוצה את המיתר, את הזווית המרכזית המתאימה ואת הקשת המתאימה. |
| 98 | P | The segment from the center that bisects a chord is perpendicular to it. | קטע ממרכז המעגל החוצה את המיתר מאונך למיתר. |
| 99 | P | An inscribed angle equals half the central angle subtending the same arc. | במעגל, זווית היקפית שווה למחצית הזווית המרכזית הנשענת על אותה הקשת. |
| 100 | P | Equal inscribed angles subtend equal arcs and equal chords. | במעגל, לזוויות היקפיות שוות קשתות שוות ומיתרים שווים. |
| 101 | P | Equal arcs subtend equal inscribed angles. | במעגל, לקשתות שוות מתאימות זוויות היקפיות שוות. |
| 102 | P | Inscribed angles subtending the same chord from the same side are equal. | במעגל, כל הזוויות ההיקפיות הנשענות על מיתר מאותו צד של המיתר שוות זו לזו. |
| 103 | P | An inscribed angle subtending a diameter is a right angle (90°). | זווית היקפית הנשענת על קוטר היא זווית ישרה (90°). |
| 104 | C | A 90° inscribed angle subtends a diameter. | זווית היקפית בת 90° נשענת על קוטר. |
| 105 | P | A tangent to a circle is perpendicular to the radius at the point of tangency. | המשיק למעגל מאונך לרדיוס בנקודת ההשקה. |
| 106 | C | A line perpendicular to a radius at its endpoint is tangent to the circle. | ישר המאונך לרדיוס בקצהו הוא משיק למעגל. |
| 107 | P | The tangent–chord angle equals the inscribed angle subtending that chord on the other side. | זווית בין משיק למיתר שווה לזווית ההיקפית הנשענת על מיתר זה מצידו השני. |
| 108 | P | Two tangents to a circle from the same external point are equal. | שני משיקים למעגל היוצאים מאותה נקודה שווים זה לזה. |
| 109 | P | The segment from the center to an external point bisects the angle between the two tangents drawn from it. | הקטע המחבר את מרכז המעגל לנקודה ממנה יוצאים שני משיקים חוצה את הזווית שבין המשיקים. |

---

## Appendix A — practice-only (not citable) · נלמדים כתרגול ולא כמשפט

> Were in the old curriculum; under the new program they are taught only as practice and **may not be cited** in the exam. Type **O**.

| # | Type | English | עברית |
|---|------|---------|-------|
| A1 | O | A chord closer to the center is longer (smaller distance ⇒ longer chord). | אם מרחקו של מיתר ממרכז המעגל קטן ממרחק מיתר אחר, אז מיתר זה ארוך יותר. |
| A2 | O | Intersecting chords — the products of the two segments of each chord are equal. | אם שני מיתרים נחתכים, מכפלת קטעי מיתר אחד שווה למכפלת קטעי המיתר השני. |
| A3 | O | Two secants from an external point — each secant times its external part is equal. | משתי חותכים מנקודה חיצונית, מכפלת חותך בחלקו החיצוני שווה למכפלת החותך השני בחלקו החיצוני. |
| A4 | O | Secant and tangent from an external point — the secant times its external part equals the tangent squared. | מחותך ומשיק מנקודה חיצונית, מכפלת החותך בחלקו החיצוני שווה לריבוע המשיק. |
| A5 | O | In a right triangle, each leg is the geometric mean of the hypotenuse and the leg's projection on it. | במשולש ישר זווית, הניצב הוא ממוצע הנדסי של היתר ושל היטל הניצב על היתר. |
| A6 | O | In a right triangle, the altitude to the hypotenuse is the geometric mean of the two projections of the legs. | הגובה ליתר במשולש ישר זווית הוא ממוצע הנדסי של היטלי הניצבים על היתר. |

## Appendix B — removed from the curriculum · יצאו מתכנית הלימודים

> Type **O** — not part of the new program.

| # | Type | English | עברית |
|---|------|---------|-------|
| B1 | O | The angle formed by two chords meeting inside a circle equals half the sum of the two intercepted arcs. | זווית פנימית במעגל שווה למחצית סכום שתי הקשתות הכלואות בין שוקי הזווית ובין המשכיהן. |
| B2 | O | The angle formed by two secants meeting outside a circle equals half the difference of the intercepted arcs. | זווית חיצונית במעגל שווה למחצית הפרש שתי הקשתות הכלואות בין שוקי הזווית ובין המשכיהן. |
| B3 | O | The line of centers of two intersecting circles perpendicularly bisects their common chord. | קטע המרכזים של שני מעגלים נחתכים חוצה את המיתר המשותף ומאונך לו. |
| B4 | O | The point of tangency of two tangent circles lies on the line of centers (or its extension). | נקודת ההשקה של שני מעגלים המשיקים זה לזה נמצאת על קטע המרכזים או על המשכו. |
