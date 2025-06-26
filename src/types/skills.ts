export enum StackType {
  Frontend = "frontend",
  Backend = "backend",
  Mobile = "mobile",
  Design = "design",
  DevOps = "devOps",
  Other = "other",
}

export enum SkillType {
  Framework = "framework",
  ProgrammingLanguage = "progamationLenguage",
  Technology = "technology",
}

export interface SkillAddRequest {
  title: string;
  image: string;
  stack: StackType;
  type: SkillType;
  subSkils: string[];
  ownerId: string;
}

export type SkillUpdateRequest = Partial<Omit<SkillAddRequest, "ownerId">>;


export interface Skill {
  id: string;
  title: string;
  image: string;
  stack: string;
  type: string;
  subSkils: string[];
  ownerId: string;
}