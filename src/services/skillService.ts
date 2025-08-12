import { ZodError } from "zod";
import { SkillRepository } from "../repository/skillRepository";
import {
  type Skill,
  type SkillAddRequest,
  SkillTypeValues,
  type SkillUpdateRequest,
  StackTypeValues,
} from "../types/skills";
import { Exception } from "../utils/exception";
import { skillSchema, skillSchemaOptional } from "../validations/skillValidation";

export class SkillService {
  private skillRepository = new SkillRepository();

  async findAllSkill(ownerId: string): Promise<{
    skills: Skill[];
    texts: { chooseText: string; title: string; description: string };
  }> {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    const res = await this.skillRepository.findAllSkills(ownerId);
    const texts = {
      chooseText: "Escolha uma habilidade",
      title: "Minhas Habilidades",
      description:
        " Habilidades que domino e utilizo em meus projetos, que desenvolvi ao mediante a cursos e projetos pessoais.",
    };
    return { skills: res, texts };
  }

  getAllTypes() {
    const types = { SkillTypeValues, StackTypeValues };
    return types;
  }

  async addSkill(skill: SkillAddRequest) {
    try {
      skillSchema.parse(skill);
      return await this.skillRepository.addSkill(skill);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "error for add skill", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  async updateSkill(skill: SkillUpdateRequest, skillId: string) {
    if (!skillId || skillId === ":id") throw new Exception("ID do projeto invalido", 400);
    if (!(await this.skillRepository.findById(skillId))) throw new Exception("Projeto não encontrado", 404);
    try {
      skillSchemaOptional.parse(skill);
      return await this.skillRepository.updateSkill(skill, skillId);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "error for update skill", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  async deleteSkill(skillId: string) {
    if (!skillId || skillId === ":id") throw new Exception("ID do projeto invalido", 400);
    if (!(await this.skillRepository.findById(skillId))) throw new Exception("Projeto não encontrado", 404);

    return await this.skillRepository.deleteSkill(skillId);
  }
}
