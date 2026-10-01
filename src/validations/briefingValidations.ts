import { z } from 'zod';
import { BRIEFING_CATEGORIES } from '../types/briefing';

export const briefingDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Data inválida; utilize YYYY-MM-DD');

const httpProtocol = /^https?:\/\//i;
const httpUrl = z
  .string()
  .url()
  .refine((value) => httpProtocol.test(value), 'Utilize uma URL HTTP ou HTTPS');
export const briefingHighlightSchema = z.object({
  position: z.number().int().min(1).max(5),
  category: z.enum(BRIEFING_CATEGORIES),
  headline: z.string().trim().min(5).max(200),
  summary: z.string().trim().min(20).max(2000),
  whyItMatters: z.string().trim().min(10).max(1500),
  source: z.object({ name: z.string().trim().min(1).max(100), url: httpUrl }),
  imageUrl: httpUrl.optional(),
});

export const createBriefingSchema = z
  .object({
    language: z.literal('pt-BR'),
    highlights: z.array(briefingHighlightSchema).length(5),
  })
  .refine(
    (data) => new Set(data.highlights.map((item) => item.position)).size === 5,
    {
      path: ['highlights'],
      message: 'As posições devem ser únicas, de 1 a 5',
    }
  );

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().safe());
export const briefingHistorySchema = z
  .object({
    page: positiveInteger.default('1'),
    limit: positiveInteger.pipe(z.number().max(50)).default('10'),
  })
  .refine(
    ({ page, limit }) => (page - 1) * limit <= 2_147_483_647,
    'Paginação inválida'
  );

export type CreateBriefingInput = z.infer<typeof createBriefingSchema>;
