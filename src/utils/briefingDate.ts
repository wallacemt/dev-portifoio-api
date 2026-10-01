import { briefingDateSchema } from '../validations/briefingValidations';
import { Exception } from './exception';

export function normalizeBriefingDate(value: string): Date {
  const parsed = briefingDateSchema.safeParse(value);
  if (!parsed.success)
    throw new Exception('Data inválida; utilize YYYY-MM-DD', 400);
  return new Date(`${parsed.data}T00:00:00.000Z`);
}
