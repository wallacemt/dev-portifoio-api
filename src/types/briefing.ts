export const BRIEFING_CATEGORIES = [
  'software-engineering',
  'ai-technology',
  'aws-cloud-devops',
  'international-career',
  'music-violin',
] as const;

export type BriefingCategory = (typeof BRIEFING_CATEGORIES)[number];

export interface BriefingSource {
  name: string;
  url: string;
}

export interface BriefingHighlightRequest {
  position: number;
  category: BriefingCategory;
  headline: string;
  summary: string;
  whyItMatters: string;
  source: BriefingSource;
  imageUrl?: string;
}

export interface BriefingCreateRequest {
  language: 'pt-BR';
  highlights: BriefingHighlightRequest[];
}
