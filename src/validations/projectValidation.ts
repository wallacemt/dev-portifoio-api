import { z } from "zod";

export const projectSchema = z.object({
  title: z
    .string()
    .min(3, { message: "O título deve ter pelo menos 3 caracteres" })
    .max(50, { message: "O título deve ter no máximo 50 caracteres" }),
  description: z
    .string()
    .min(10, { message: "A descrição deve ter pelo menos 10 caracteres" })
    .max(500, { message: "A descrição deve ter no máximo 500 caracteres" }),
  techs: z
    .array(
      z
        .string()
        .min(2, { message: "A tecnologia deve ter pelo menos 2 caracteres" })
        .max(50, { message: "A tecnologia deve ter no máximo 50 caracteres" })
    )
    .min(1, { message: "O projeto deve ter pelo menos uma tecnologia" }),
  screenshots: z
    .array(z.string().url({ message: "A URL da imagem deve ser valida" }))
    .min(1, { message: "O projeto deve ter pelo menos uma imagem de screenshot" }),
  deployment: z.string().url({ message: "A URL do deploy deve ser valida" }),
  backend: z.string().url({ message: "A URL do backend deve ser valida" }),
  frontend: z.string().url({ message: "A URL do frontend deve ser valida" }),
  previewImage: z.string().url({ message: "A URL da imagem de preview deve ser valida" }),
  lastUpdate: z.date().optional(),
  ownerId: z.string().min(1, { message: "o id do owner deve ser valido" }),
});
export const projectSchemaOptional = projectSchema.partial();

export const projectFilterSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => parseInt(val || "1"))
    .refine((val) => !isNaN(val) && val > 0, { message: "Page deve ser um número positivo" }),

  limit: z
    .string()
    .optional()
    .transform((val) => parseInt(val || "10"))
    .refine((val) => !isNaN(val) && val > 0, { message: "Limit deve ser um número positivo" }),

  tech: z.string().optional(),
  activate: z
    .string()
    .optional()
    .transform((val) => (val === "true" ? true : val === "false" ? false : undefined)),

  orderBy: z.enum(["asc", "desc"]).optional().default("desc"),
  search: z.string().optional(),
});
