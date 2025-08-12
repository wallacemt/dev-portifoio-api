import { prisma } from '../prisma/prismaClient';
import type { SkillAddRequest, SkillUpdateRequest } from '../types/skills';

export class SkillRepository {
  async findAllSkills(ownerId: string) {
    return await prisma.skill.findMany({ where: { ownerId } });
  }

  async findById(skillId: string) {
    return await prisma.skill.findUnique({ where: { id: skillId } });
  }
  async addSkill(skill: SkillAddRequest) {
    return await prisma.skill.create({ data: { ...skill } });
  }

  async updateSkill(skill: SkillUpdateRequest, skillId: string) {
    return await prisma.skill.update({
      where: { id: skillId },
      data: { ...skill },
    });
  }

  async deleteSkill(skillId: string) {
    return await prisma.skill.delete({ where: { id: skillId } });
  }
}
