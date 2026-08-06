import { ZodError } from "zod";
import { getUiTexts } from "../i18n";
import { SkillRepository } from "../repository/skillRepository";
import { applyTranslations } from "../translation/applyTranslations";
import { enqueueTranslation, removeTranslations } from "../translation/enqueueTranslation";
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

  async findAllSkill(
    ownerId: string,
    page = 1,
    limit = 10,
    pagination = true,
    language?: string
  ): Promise<{
    skills: Skill[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    texts: { chooseText: string; title: string; description: string };
  }> {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    const texts = getUiTexts<{ chooseText: string; title: string; description: string }>("skill", language);

    if (pagination === true) {
      const validatedPage = Math.max(1, Math.floor(page));
      const validatedLimit = Math.min(Math.max(1, Math.floor(limit)), 100); // Máximo 100 por página

      const result = await this.skillRepository.findAllSkills(ownerId, validatedPage, validatedLimit);
      const skills = await applyTranslations("skill", result.skills, language);

      return {
        skills,
        pagination: result.pagination,
        texts,
      };
    }

      const fetchedSkills = await this.skillRepository.findAllSkillsNoFilter(ownerId);
      const skills = await applyTranslations("skill", fetchedSkills, language);
      return {
        skills,
        pagination: {
          total: skills.length,
          page: 1,
          limit: skills.length,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
        texts,
      };
  }

  getAllTypes() {
    const types = { SkillTypeValues, StackTypeValues };
    return types;
  }

  async addSkill(skill: SkillAddRequest) {
    try {
      skillSchema.parse(skill);
      const created = await this.skillRepository.addSkill(skill);
      await enqueueTranslation("skill", created.id, created);
      return created;
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
      const updated = await this.skillRepository.updateSkill(skill, skillId);
      await enqueueTranslation("skill", updated.id, updated);
      return updated;
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

    const deleted = await this.skillRepository.deleteSkill(skillId);
    await removeTranslations("skill", skillId);
    return deleted;
  }
}
