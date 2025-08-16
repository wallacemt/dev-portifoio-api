import type { z } from "zod";
import type { projectFilterSchema } from "../validations/projectValidation";
import type { Skill } from "./skills";

export interface CreateProject {
  title: string;
  description: string;
  techs: string[];
  screenshots: string[];
  deployment: string;
  backend?: string;
  frontend?: string;
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
  backend?: string | null;
  frontend?: string | null;
  previewImage: string;
}

export interface ProjectWithSkills extends Project {
  skills: Skill[];
}

export type ProjectFilter = z.infer<typeof projectFilterSchema>;

export interface ProjectWhere {
  ownerId: string;
  activate?: boolean;
  techs?: { has: string };
  OR?: [
    { title: { contains: string; mode: "insensitive" } },
    { description: { contains: string; mode: "insensitive" } }
  ];
}
