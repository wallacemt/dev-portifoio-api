import { z } from 'zod';

export const analyticsRangeSchema = z
  .object({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/)
      .refine((value) => Number.isFinite(Date.parse(value)))
      .transform((value) => new Date(value))
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/)
      .refine((value) => Number.isFinite(Date.parse(value)))
      .transform((value) => new Date(value))
      .optional(),
  })
  .refine((range) => !(range.startDate && range.endDate) || range.startDate <= range.endDate, {
    message: "Data de início deve ser anterior ou igual à data de fim",
    path: ["startDate"],
  })
  .refine(
    (range) => !(range.startDate && range.endDate) || range.endDate.getTime() - range.startDate.getTime() <= 366 * 86_400_000,
    { message: "O intervalo máximo é de 366 dias", path: ["endDate"] }
  );
