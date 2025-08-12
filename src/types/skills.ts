export const StackTypeValues = {
  Frontend: "frontend" as const,
  Backend: "backend" as const,
  Mobile: "mobile" as const,
  Design: "design" as const,
  DevOps: "devops" as const,
  Other: "other" as const,
} as const;

export type StackType = typeof StackTypeValues[keyof typeof StackTypeValues];

export const SkillTypeValues = {
  Framework: "framework" as const,
  ProgrammingLanguage: "programmingLanguage" as const,
  Technology: "technology" as const,
} as const;

export type SkillType = (typeof SkillTypeValues)[keyof typeof SkillTypeValues];

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
