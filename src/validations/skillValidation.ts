import { z } from "zod";
import { SkillTypeValues, StackTypeValues } from "../types/skills";

export const skillSchema = z.object({
  title: z
    .string()
    .min(1, { message: "O título deve ter pelo menos 1 caracteres" })
    .max(50, { message: "O título deve ter no máximo 50 caracteres" }),
  image: z.string().url({ message: "A URL da imagem deve ser valida" }),
  stack: z.nativeEnum(StackTypeValues).refine((val) => Object.values(StackTypeValues).includes(val), {
    message: "O tipo de stack deve ser um dos valores",
  }),
  type: z.nativeEnum(SkillTypeValues).refine((val) => Object.values(SkillTypeValues).includes(val), {
    message: "O tipo de skill deve ser um dos valores: framework, programmingLanguage, technology",
  }),
  subSkils: z
    .array(
      z
        .string()
        .min(2, { message: "A sub skill deve ter pelo menos 2 caracteres" })
        .max(100, { message: "A sub skill deve ter no máximo 50 caracteres" })
    )
    .min(1, { message: "O skill deve ter pelo menos uma sub skill" }),
  ownerId: z.string().min(1, { message: "O id do owner deve ser valido" }),
});

export const skillSchemaOptional = skillSchema.partial();
