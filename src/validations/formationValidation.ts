import { z } from 'zod';
import { FormationType } from '../types/formation';

export const formationSchema = z.object({
  title: z.string().min(1, { message: 'O título é obrigatório' }),
  institution: z.string().min(1, { message: 'A instituição é obrigatória' }),
  image: z.string().url({ message: 'A URL da imagem deve ser válida' }),
  workload: z
    .number()
    .positive({ message: 'A carga horária deve ser um número positivo' }),
  initialDate: z.date({
    errorMap: () => ({ message: 'A data inicial deve ser uma data válida' }),
  }),
  endDate: z.date({
    errorMap: () => ({ message: 'A data final deve ser uma data válida' }),
  }),
  description: z
    .string()
    .min(10, { message: 'A descrição deve ter pelo menos 10 caracteres' }),
  type: z
    .nativeEnum(FormationType)
    .refine((val) => Object.values(FormationType).includes(val), {
      message:
        'O tipo de formação deve ser um dos valores: technologist, technical, bootcamp',
    }),
  certificationUrl: z
    .string()
    .url({ message: 'A URL da certificação deve ser válida' })
    .optional(),
  ownerId: z.string().min(1, { message: 'O id do owner deve ser válido' }),
});
export const formationSchemaOptional = formationSchema.partial();
