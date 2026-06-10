import type { TheoremDefinition } from '../types';
import type { Construction, GeoPolygon } from '@/types/geometry';
import { segmentKey } from '../../solver/utils';

function findTriangles(construction: Construction): GeoPolygon[] {
  return construction.elements.filter(
    (e): e is GeoPolygon => e.kind === 'polygon' && e.vertices.length === 3
  );
}

export const angleSum: TheoremDefinition = {
  id: 'angle-sum-triangle',
  name: { en: 'Triangle Angle Sum', he: 'סכום זוויות במשולש' },
  description: {
    en: 'The sum of angles in a triangle is 180°.',
    he: 'סכום הזוויות במשולש שווה ל-180°.',
  },
  category: 'triangle',
  detect(construction) {
    for (const tri of findTriangles(construction)) {
      return {
        theoremId: this.id,
        confidence: 'definite',
        relevantElements: [tri.id],
        statement: {
          en: `In triangle ${tri.vertices.join('')}: the sum of all three angles equals 180°.`,
          he: `במשולש ${tri.vertices.join('')}: סכום שלוש הזוויות שווה ל-180°.`,
        },
      };
    }
    return null;
  },
};

export const pythagorean: TheoremDefinition = {
  id: 'pythagorean',
  name: { en: 'Pythagorean Theorem', he: 'משפט פיתגורס' },
  description: {
    en: 'In a right triangle, a² + b² = c² (where c is the hypotenuse).',
    he: 'במשולש ישר זווית, סכום ריבועי הניצבים שווה לריבוע היתר.',
  },
  category: 'triangle',
  detect(construction) {
    for (const tri of findTriangles(construction)) {
      const cls = construction.computed.polygonClassifications.get(tri.id);
      if (!cls || !cls.subtypes.includes('right')) continue;

      const rightConstraint = construction.constraints.find(
        (c): c is Extract<typeof c, { type: 'right-angle' }> =>
          c.type === 'right-angle' && tri.vertices.includes(c.vertex)
      );
      const vLabel = rightConstraint ? rightConstraint.vertex : '?';

      return {
        theoremId: this.id,
        confidence: 'definite',
        relevantElements: [tri.id],
        statement: {
          en: `Triangle ${tri.vertices.join('')} has a right angle at ${vLabel}. By the Pythagorean theorem: the square of the hypotenuse equals the sum of squares of the two legs.`,
          he: `משולש ${tri.vertices.join('')} הוא ישר זווית ב-${vLabel}. לפי משפט פיתגורס: ריבוע היתר שווה לסכום ריבועי הניצבים.`,
        },
      };
    }
    return null;
  },
};

export const isoscelesBaseAngles: TheoremDefinition = {
  id: 'isosceles-base-angles',
  name: { en: 'Isosceles Triangle — Base Angles', he: 'משולש שווה שוקיים — זוויות בסיס' },
  description: {
    en: 'In an isosceles triangle, the base angles are equal.',
    he: 'במשולש שווה שוקיים, זוויות הבסיס שוות.',
  },
  category: 'triangle',
  detect(construction) {
    for (const tri of findTriangles(construction)) {
      const cls = construction.computed.polygonClassifications.get(tri.id);
      if (!cls || !cls.subtypes.includes('isosceles')) continue;

      return {
        theoremId: this.id,
        confidence: 'definite',
        relevantElements: [tri.id],
        statement: {
          en: `Triangle ${tri.vertices.join('')} is isosceles. The base angles are equal.`,
          he: `משולש ${tri.vertices.join('')} הוא שווה שוקיים. זוויות הבסיס שוות.`,
        },
      };
    }
    return null;
  },
};

export const equilateralProperties: TheoremDefinition = {
  id: 'equilateral-properties',
  name: { en: 'Equilateral Triangle', he: 'משולש שווה צלעות' },
  description: {
    en: 'In an equilateral triangle, all sides are equal and all angles are 60°.',
    he: 'במשולש שווה צלעות, כל הצלעות שוות וכל הזוויות שוות ל-60°.',
  },
  category: 'triangle',
  detect(construction) {
    for (const tri of findTriangles(construction)) {
      const cls = construction.computed.polygonClassifications.get(tri.id);
      if (!cls || !cls.subtypes.includes('equilateral')) continue;

      return {
        theoremId: this.id,
        confidence: 'definite',
        relevantElements: [tri.id],
        statement: {
          en: `Triangle ${tri.vertices.join('')} is equilateral. All sides are equal and all angles are 60°.`,
          he: `משולש ${tri.vertices.join('')} הוא שווה צלעות. כל הצלעות שוות וכל הזוויות שוות ל-60°.`,
        },
      };
    }
    return null;
  },
};

export const congruenceHints: TheoremDefinition = {
  id: 'congruence-hints',
  name: { en: 'Congruence Conditions', he: 'תנאי חפיפה' },
  description: {
    en: 'Known congruence conditions: SSS, SAS, ASA, AAS.',
    he: 'תנאי חפיפה ידועים: צ.צ.צ, צ.ז.צ, ז.צ.ז, ז.ז.צ.',
  },
  category: 'triangle',
  detect(construction) {
    for (const tri of findTriangles(construction)) {
      const verts = tri.vertices;
      const sides = [
        segmentKey(verts[0], verts[1]),
        segmentKey(verts[1], verts[2]),
        segmentKey(verts[2], verts[0]),
      ];

      const knownSides = sides.filter(s => construction.computed.distances.has(s)).length;
      const knownAngles = construction.constraints.filter(
        c => (c.type === 'angle-measure' || c.type === 'right-angle') && verts.includes(c.vertex)
      ).length;

      let hint: { en: string; he: string } | null = null;

      if (knownSides >= 3) {
        hint = {
          en: `All three sides of triangle ${verts.join('')} are known (SSS). This triangle is fully determined.`,
          he: `שלוש הצלעות של משולש ${verts.join('')} ידועות (צ.צ.צ). המשולש נקבע באופן מלא.`,
        };
      } else if (knownSides >= 2 && knownAngles >= 1) {
        hint = {
          en: `Triangle ${verts.join('')} has 2 known sides and 1 known angle. Check if this matches SAS (side-angle-side) congruence.`,
          he: `למשולש ${verts.join('')} 2 צלעות ידועות וזווית אחת ידועה. בדוק האם זה מתאים לחפיפת צ.ז.צ.`,
        };
      } else if (knownAngles >= 2 && knownSides >= 1) {
        hint = {
          en: `Triangle ${verts.join('')} has 2 known angles and 1 known side. Check if this matches ASA or AAS congruence.`,
          he: `למשולש ${verts.join('')} 2 זוויות ידועות וצלע אחת ידועה. בדוק האם זה מתאים לחפיפת ז.צ.ז או ז.ז.צ.`,
        };
      }

      if (hint) {
        return {
          theoremId: this.id,
          confidence: 'possible',
          relevantElements: [tri.id],
          statement: hint,
        };
      }
    }
    return null;
  },
};

export const triangleTheorems: TheoremDefinition[] = [
  angleSum,
  pythagorean,
  isoscelesBaseAngles,
  equilateralProperties,
  congruenceHints,
];
