export enum FormationType {
  Technologist = "tecnologo",
  Technical = "tecnico",
  Bootcamp = "bootcamp",
  Course = "curso",
  Certificate = "certificado",
  PosGraduation = "pos-graduacao",
  Other = "outro",
}
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
