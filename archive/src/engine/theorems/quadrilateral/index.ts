import type { TheoremDefinition } from '../types';
import type { Construction, GeoPolygon } from '@/types/geometry';

function findQuadrilaterals(construction: Construction): GeoPolygon[] {
  return construction.elements.filter(
    (e): e is GeoPolygon => e.kind === 'polygon' && e.vertices.length === 4
  );
}

export const angleSumQuad: TheoremDefinition = {
  id: 'angle-sum-quadrilateral',
  name: { en: 'Quadrilateral Angle Sum', he: 'סכום זוויות במרובע' },
  description: {
    en: 'The sum of angles in a quadrilateral is 360°.',
    he: 'סכום הזוויות במרובע שווה ל-360°.',
  },
  category: 'quadrilateral',
  detect(construction) {
    for (const quad of findQuadrilaterals(construction)) {
      return {
        theoremId: this.id,
        confidence: 'definite',
        relevantElements: [quad.id],
        statement: {
          en: `In quadrilateral ${quad.vertices.join('')}: the sum of all four angles equals 360°.`,
          he: `במרובע ${quad.vertices.join('')}: סכום ארבע הזוויות שווה ל-360°.`,
        },
      };
    }
    return null;
  },
};

export const parallelogramProperties: TheoremDefinition = {
  id: 'parallelogram-properties',
  name: { en: 'Parallelogram Properties', he: 'תכונות מקבילית' },
  description: {
    en: 'In a parallelogram: opposite sides are equal, opposite angles are equal, diagonals bisect each other.',
    he: 'במקבילית: צלעות נגדיות שוות, זוויות נגדיות שוות, האלכסונים חוצים זה את זה.',
  },
  category: 'quadrilateral',
  detect(construction) {
    for (const quad of findQuadrilaterals(construction)) {
      const cls = construction.computed.polygonClassifications.get(quad.id);
      if (!cls || !cls.subtypes.includes('parallelogram')) continue;

      const [A, B, C, D] = quad.vertices;
      return {
        theoremId: this.id,
        confidence: 'definite',
        relevantElements: [quad.id],
        statement: {
          en: `${A}${B}${C}${D} is a parallelogram. Opposite sides are equal (${A}${B}=${D}${C}, ${A}${D}=${B}${C}), opposite angles are equal, and diagonals bisect each other.`,
          he: `${A}${B}${C}${D} היא מקבילית. צלעות נגדיות שוות (${A}${B}=${D}${C}, ${A}${D}=${B}${C}), זוויות נגדיות שוות, והאלכסונים חוצים זה את זה.`,
        },
      };
    }
    return null;
  },
};

export const rectangleProperties: TheoremDefinition = {
  id: 'rectangle-properties',
  name: { en: 'Rectangle Properties', he: 'תכונות מלבן' },
  description: {
    en: 'A rectangle has all parallelogram properties plus: all angles are 90° and diagonals are equal.',
    he: 'למלבן כל תכונות המקבילית בנוסף: כל הזוויות 90° והאלכסונים שווים.',
  },
  category: 'quadrilateral',
  detect(construction) {
    for (const quad of findQuadrilaterals(construction)) {
      const cls = construction.computed.polygonClassifications.get(quad.id);
      if (!cls || !cls.subtypes.includes('rectangle')) continue;

      return {
        theoremId: this.id,
        confidence: 'definite',
        relevantElements: [quad.id],
        statement: {
          en: `${quad.vertices.join('')} is a rectangle. All angles are 90° and diagonals are equal in length.`,
          he: `${quad.vertices.join('')} הוא מלבן. כל הזוויות 90° והאלכסונים שווים באורכם.`,
        },
      };
    }
    return null;
  },
};

export const rhombusProperties: TheoremDefinition = {
  id: 'rhombus-properties',
  name: { en: 'Rhombus Properties', he: 'תכונות מעוין' },
  description: {
    en: 'A rhombus has all parallelogram properties plus: all sides are equal and diagonals are perpendicular.',
    he: 'למעוין כל תכונות המקבילית בנוסף: כל הצלעות שוות והאלכסונים מאונכים זה לזה.',
  },
  category: 'quadrilateral',
  detect(construction) {
    for (const quad of findQuadrilaterals(construction)) {
      const cls = construction.computed.polygonClassifications.get(quad.id);
      if (!cls || !cls.subtypes.includes('rhombus')) continue;

      return {
        theoremId: this.id,
        confidence: 'definite',
        relevantElements: [quad.id],
        statement: {
          en: `${quad.vertices.join('')} is a rhombus. All sides are equal and diagonals are perpendicular bisectors of each other.`,
          he: `${quad.vertices.join('')} הוא מעוין. כל הצלעות שוות והאלכסונים מאונכים זה לזה וחוצים זה את זה.`,
        },
      };
    }
    return null;
  },
};

export const trapezoidProperties: TheoremDefinition = {
  id: 'trapezoid-properties',
  name: { en: 'Trapezoid Properties', he: 'תכונות טרפז' },
  description: {
    en: 'A trapezoid has one pair of parallel sides. The midsegment is parallel to the bases and its length is their average.',
    he: 'לטרפז זוג אחד של צלעות מקבילות. הקטע האמצעי מקביל לבסיסים ואורכו הוא הממוצע שלהם.',
  },
  category: 'quadrilateral',
  detect(construction) {
    for (const quad of findQuadrilaterals(construction)) {
      const cls = construction.computed.polygonClassifications.get(quad.id);
      if (!cls || !cls.subtypes.includes('trapezoid')) continue;

      return {
        theoremId: this.id,
        confidence: 'definite',
        relevantElements: [quad.id],
        statement: {
          en: `${quad.vertices.join('')} is a trapezoid with one pair of parallel sides.`,
          he: `${quad.vertices.join('')} הוא טרפז עם זוג אחד של צלעות מקבילות.`,
        },
      };
    }
    return null;
  },
};

export const quadrilateralTheorems: TheoremDefinition[] = [
  angleSumQuad,
  parallelogramProperties,
  rectangleProperties,
  rhombusProperties,
  trapezoidProperties,
];
