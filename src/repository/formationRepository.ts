import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/prismaClient";
import type { FormationAddRequest, FormationUpdate } from "../types/formation";

export class FormationRepository {
  async findAllFormations(ownerId: string, filters: Prisma.formationWhereInput = {}, skip?: number, take?: number) {
    return await prisma.formation.findMany({
      where: { ...filters, ownerId },
      orderBy: [{ concluded: "asc" }, { id: "asc" }],
      skip,
      take,
    });
  }

  countFormations(ownerId: string, filters: Prisma.formationWhereInput) {
    return prisma.formation.count({ where: { ...filters, ownerId } });
  }

  async findById(formationId: string) {
    return await prisma.formation.findUnique({
      where: { id: formationId },
     
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
