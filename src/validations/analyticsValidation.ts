import { z } from "zod";

export const trackVisitorSchema = z.object({
  sessionId: z.string().min(1, "Session ID é obrigatório").max(255, "Session ID deve ter no máximo 255 caracteres"),
  userAgent: z.string().min(1, "User Agent é obrigatório").max(500, "User Agent deve ter no máximo 500 caracteres"),
  country: z.string().max(100, "País deve ter no máximo 100 caracteres").optional(),
  city: z.string().max(100, "Cidade deve ter no máximo 100 caracteres").optional(),
  device: z.enum(["desktop", "mobile", "tablet"], {
    errorMap: () => ({ message: "Dispositivo deve ser desktop, mobile ou tablet" }),
  }),
  browser: z.string().max(100, "Browser deve ter no máximo 100 caracteres").optional(),
  os: z.string().max(100, "Sistema operacional deve ter no máximo 100 caracteres").optional(),
  referrer: z.string().url("Referrer deve ser uma URL válida").optional(),
  landingPage: z
    .string()
    .min(1, "Página de entrada é obrigatória")
    .max(500, "Página de entrada deve ter no máximo 500 caracteres"),
});

export const trackPageViewSchema = z.object({
  sessionId: z.string().min(1, "Session ID é obrigatório").max(255, "Session ID deve ter no máximo 255 caracteres"),
  page: z.string().min(1, "Página é obrigatória").max(500, "Página deve ter no máximo 500 caracteres"),
  timeSpent: z
    .number()
    .min(0, "Tempo gasto deve ser pelo menos 0 segundos")
    .max(8640.0, "Tempo gasto deve ser no máximo 86400 segundos (24 horas)")
    .optional(),
});

export const analyticsFiltersSchema = z
  .object({
    startDate: z
      .date({
        errorMap: () => ({ message: "Data de início deve ser uma data válida" }),
      })
      .transform((date) => date.toISOString().split("T")[0])
      .optional(),
    endDate: z
      .date({
        errorMap: () => ({ message: "Data de fim deve ser uma data válida" }),
      })
      .transform((date) => date.toISOString().split("T")[0])
      .optional(),
    page: z.string().max(500, "Página deve ter no máximo 500 caracteres").optional(),
    device: z
      .enum(["desktop", "mobile", "tablet"], {
        errorMap: () => ({ message: "Dispositivo deve ser desktop, mobile ou tablet" }),
      })
      .optional(),
    country: z.string().max(100, "País deve ter no máximo 100 caracteres").optional(),
  })
  .refine(
    (data) => {
      if (data.endDate && data.startDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: "Data de fim deve ser posterior à data de início",
      path: ["endDate"],
    }
  );
