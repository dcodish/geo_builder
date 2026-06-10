import type { Construction } from '@/types/geometry';
import type { TheoremMatch } from './types';
import { triangleTheorems } from './triangle';
import { quadrilateralTheorems } from './quadrilateral';

const allTheorems = [...triangleTheorems, ...quadrilateralTheorems];

export function detectTheorems(construction: Construction): TheoremMatch[] {
  if (construction.elements.length === 0) return [];

  const matches: TheoremMatch[] = [];
  for (const theorem of allTheorems) {
    const match = theorem.detect(construction);
    if (match) {
      matches.push(match);
    }
  }

  // Sort: 'definite' before 'possible'
  return matches.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === 'definite' ? -1 : 1;
    }
    return 0;
  });
}
