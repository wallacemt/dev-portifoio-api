import { z } from 'zod';
import { FormationTypeValues } from '../types/formation';
import { SkillTypeValues, StackTypeValues } from '../types/skills';
import { Exception } from '../utils/exception';

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();
export const ownerListSchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z
    .string()
    .regex(/^\d+$/)
    .pipe(z.coerce.number().int().min(1).max(21_474_836))
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .pipe(z.coerce.number().int().min(1).max(100))
    .optional(),
  pagination: booleanQuery,
});
export const skillListSchema = ownerListSchema.extend({
  stack: z.nativeEnum(StackTypeValues).optional(),
  type: z.nativeEnum(SkillTypeValues).optional(),
});
export const formationListSchema = ownerListSchema.extend({
  type: z.nativeEnum(FormationTypeValues).optional(),
  concluded: booleanQuery,
});
export type OwnerListFilters = z.infer<typeof ownerListSchema>;
export type SkillListFilters = z.infer<typeof skillListSchema>;
export type FormationListFilters = z.infer<typeof formationListSchema>;

export function parseOwnerList<T extends z.ZodTypeAny>(
  schema: T,
  query: unknown
): z.infer<T> {
  const result = schema.safeParse(query);
  if (!result.success)
    throw new Exception(
      result.error.issues[0]?.message || 'Filtros inválidos',
      400
    );
  return result.data;
}

export function listPagination(filters: OwnerListFilters) {
  const enabled =
    filters.pagination ??
    (filters.page !== undefined || filters.limit !== undefined);
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 10;
  return {
    enabled,
    page,
    limit,
    skip: enabled ? (page - 1) * limit : undefined,
    take: enabled ? limit : undefined,
  };
}
