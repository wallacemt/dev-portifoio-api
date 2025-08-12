import { z } from 'zod';

export const ownerSchema = z.object({
  name: z
    .string()
    .min(3, { message: 'O nome deve ter pelo menos 3 caracteres' })
    .max(50, { message: 'O nome deve ter no máximo 50 caracteres' }),

  email: z
    .string()
    .email({ message: 'O email deve ser válido' })
    .min(3, { message: 'O email deve ter pelo menos 3 caracteres' })
    .max(50, { message: 'O email deve ter no máximo 50 caracteres' }),

  password: z
    .string()
    .min(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
    .max(50, { message: 'A senha deve ter no máximo 50 caracteres' }),

  avatar: z.string().optional(),

  about: z
    .string()
    .min(10, { message: 'A descrição deve ter pelo menos 10 caracteres' })
    .max(500, { message: 'A descrição deve ter no máximo 500 caracteres' }),

  occupation: z
    .string()
    .min(3, { message: 'A ocupação deve ter pelo menos 3 caracteres' })
    .max(50, { message: 'A ocupação deve ter no máximo 50 caracteres' }),

  birthDate: z.date().refine((val) => val < new Date(), {
    message: 'A data de nascimento deve ser anterior à data atual',
  }),
});

export const ownerSchemaOptional = ownerSchema.partial();
