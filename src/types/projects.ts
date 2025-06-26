import { z } from "zod";
import { projectFilterSchema } from "../validations/projectValidation";

export interface CreateProject {
  title: string;
  description: string;
  techs: string[];
  screenshots: string[];
  deployment: string;
  backend: string;
  frontend: string;
  previewImage: string;
  lastUpdate: Date;
  ownerId: string;
}

export type UpdateProjec = Partial<CreateProject>;

export interface Project {
  id: string;
  lastUpdate: Date | null;
  ownerId: string;
  title: string;
  description: string;
  techs: string[];
  screenshots: string[];
  deployment: string;
  backend: string;
  frontend: string;
  previewImage: string;
}

export type ProjectFilter = z.infer<typeof projectFilterSchema>;
