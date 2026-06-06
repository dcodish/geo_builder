import type { Construction } from '@/types/geometry';

export interface TheoremDefinition {
  id: string;
  name: { en: string; he: string };
  description: { en: string; he: string };
  category: 'triangle' | 'quadrilateral' | 'circle' | 'general';
  detect: (construction: Construction) => TheoremMatch | null;
}

export interface TheoremMatch {
  theoremId: string;
  confidence: 'definite' | 'possible';
  relevantElements: string[];
  statement: { en: string; he: string };
}
