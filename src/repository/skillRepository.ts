import { prisma } from "../prisma/prismaClient";
import type { SkillAddRequest, SkillUpdateRequest } from "../types/skills";

export class SkillRepository {
  async findAllSkills(ownerId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.skill.count({ where: { ownerId } }),
    ]);

    return {
      skills,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
  async findAllSkillsNoFilter(ownerId: string) {
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
