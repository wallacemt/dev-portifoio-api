import { prisma } from "../prisma/prismaClient";
import type { FormationAddRequest, FormationUpdate } from "../types/formation";

export class FormationRepository {
  async findAllFormations(ownerId: string) {
    return await prisma.formation.findMany({
      where: { ownerId },
      orderBy: { concluded: "asc" },
      include: {
        badges: {
          orderBy: { issueDate: "desc" },
        },
        certifications: {
          orderBy: { issueDate: "desc" },
        },
      },
    });
  }

  async findById(formationId: string) {
    return await prisma.formation.findUnique({
      where: { id: formationId },
      include: {
        badges: {
          orderBy: { issueDate: "desc" },
        },
        certifications: {
          orderBy: { issueDate: "desc" },
        },
      },
    });
  }

  async addFormation(formation: FormationAddRequest) {
    return await prisma.formation.create({ data: { ...formation } });
  }

  async updateFormation(formation: FormationUpdate, formationId: string) {
    return await prisma.formation.update({
      where: { id: formationId },
      data: { ...formation },
    });
  }
  async deleteFormation(formationId: string) {
    return await prisma.formation.delete({ where: { id: formationId } });
  }
}
