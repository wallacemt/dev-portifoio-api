import { z } from "zod";

export const badgeSchema = z.object({
  title: z.string().min(3, "Título deve ter no mínimo 3 caracteres"),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  imageUrl: z.string().url("URL da imagem inválida"),
  issuer: z.string().min(2, "Emissor deve ter no mínimo 2 caracteres"),
  issueDate: z.date({
    required_error: "Data de emissão é obrigatória",
    invalid_type_error: "Data de emissão inválida",
  }),
  badgeUrl: z.string().url("URL do badge inválida").optional(),
  ownerId: z.string().min(1, "ID do proprietário é obrigatório"),
});

export const badgeSchemaOptional = z.object({
  title: z.string().min(3, "Título deve ter no mínimo 3 caracteres").optional(),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres").optional(),
  imageUrl: z.string().url("URL da imagem inválida").optional(),
  issuer: z.string().min(2, "Emissor deve ter no mínimo 2 caracteres").optional(),
  issueDate: z
    .date({
      invalid_type_error: "Data de emissão inválida",
    })
    .optional(),
  badgeUrl: z.string().url("URL do badge inválida").optional(),
});

export const certificationSchema = z.object({
  title: z.string().min(3, "Título deve ter no mínimo 3 caracteres"),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  issuer: z.string().min(2, "Emissor deve ter no mínimo 2 caracteres"),
  issueDate: z.date({
    required_error: "Data de emissão é obrigatória",
    invalid_type_error: "Data de emissão inválida",
  }),
  expirationDate: z
    .date({
      invalid_type_error: "Data de expiração inválida",
    })
    .optional(),
  credentialId: z.string().optional(),
  credentialUrl: z.string().url("URL da credencial inválida"),
  certificateFile: z.string().url("URL do certificado inválida").optional(),
  ownerId: z.string().min(1, "ID do proprietário é obrigatório"),
});

export const certificationSchemaOptional = z.object({
  title: z.string().min(3, "Título deve ter no mínimo 3 caracteres").optional(),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres").optional(),
  issuer: z.string().min(2, "Emissor deve ter no mínimo 2 caracteres").optional(),
  issueDate: z
    .date({
      invalid_type_error: "Data de emissão inválida",
    })
    .optional(),
  expirationDate: z
    .date({
      invalid_type_error: "Data de expiração inválida",
    })
    .optional(),
  credentialId: z.string().optional(),
  credentialUrl: z.string().url("URL da credencial inválida").optional(),
  certificateFile: z.string().url("URL do certificado inválida").optional(),
});
