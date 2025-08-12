export const FormationTypeValues = {
  Tecnologo: "technologist" as const,
  Tecnico: "technical" as const,
  Bootcamp: "bootcamp" as const,
  Curso: "course" as const,
  Certificado: "certificate" as const,
  PosGraduacao: "posGraduation" as const,
  Outro: "other" as const,
} as const;

export type FormationType = typeof FormationTypeValues[keyof typeof FormationTypeValues];
export interface FormationAddRequest {
  title: string;
  institution: string;
  image: string;
  workload: number;
  initialDate: Date;
  endDate: Date;
  description: string;
  type: FormationType;
  certificationUrl?: string;
  ownerId: string;
}
export type FormationUpdate = Partial<Omit<FormationAddRequest, "ownerId">>;

export interface Formation {
  id: string;
  title: string;
  institution: string;
  image: string;
  workload: number;
  initialDate: Date;
  endDate: Date;
  description: string;
  type: string;
  certificationUrl?: string;
  ownerId: string;
}
