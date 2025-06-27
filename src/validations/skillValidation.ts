import { z } from "zod";
import { SkillType, StackType } from "../types/skills";

export const skillSchema = z.object({
  title: z
    .string()
    .min(3, { message: "O título deve ter pelo menos 3 caracteres" })
    .max(50, { message: "O título deve ter no máximo 50 caracteres" }),
  image: z.string().url({ message: "A URL da imagem deve ser valida" }),
  stack: z
    .nativeEnum(StackType)
    .refine((val) => Object.values(StackType).includes(val), {
      message: "O tipo de stack deve ser um dos valores: frontend, backend, mobile, design, devOps, other",
    }),
  type: z
    .nativeEnum(SkillType)
    .refine((val) => Object.values(SkillType).includes(val), {
      message: "O tipo de skill deve ser um dos valores: framework, programmingLanguage, technology",
    }),
  subSkils: z
    .array(
      z
        .string()
        .min(2, { message: "A sub skill deve ter pelo menos 2 caracteres" })
        .max(50, { message: "A sub skill deve ter no máximo 50 caracteres" })
    )
    .min(1, { message: "O skill deve ter pelo menos uma sub skill" }),
  ownerId: z.string().min(1, { message: "O id do owner deve ser valido" }),
});

export  const skillSchemaOptional = skillSchema.partial();