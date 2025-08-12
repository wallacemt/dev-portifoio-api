import { prisma } from '../prisma/prismaClient';
import type {
  OwnerAnalysisResponse,
  OwnerDataOptionalRequest,
  OwnerDataRequest,
} from '../types/owner';

export class OwnerRepository {
  /**
   * Finds an owner by their email or id.
   * @param id or email The email of the owner to find.
   * @returns The found owner, or null if not found.
   */
  async findByEmail(email: string) {
    return await prisma.owner.findFirst({
      where: {
        email,
      },
    });
  }
  async findById(id: string) {
    return await prisma.owner.findFirst({
      where: {
        id,
      },
    });
  }
  /**
   * Creates a new owner.
   * @param owner The data for the new owner.
   * @returns The created owner.
   */
  async createOwner(owner: OwnerDataRequest) {
    return await prisma.owner.create({
      data: { ...owner },
    });
  }

  /**
   * Updates an existing owner's information.
   * @param owner The data for the owner to update, identified by email.
   * @returns The updated owner.
   */

  async updateOwner(owner: OwnerDataOptionalRequest, ownerId: string) {
    return await prisma.owner.update({
      where: { id: ownerId },
      data: { ...owner },
    });
  }

  async setSecretWord(secretWord: string, ownerId: string): Promise<void> {
    await prisma.owner.update({
      where: { id: ownerId },
      data: { secretWord },
    });
  }

  async getOwnerAnalysis(ownerId: string): Promise<OwnerAnalysisResponse> {
    const projectsCount = await prisma.project.count({
      where: { ownerId },
    });
    const skillsCount = await prisma.skill.count({
      where: { ownerId },
    });
    const formationsCount = await prisma.formation.count({
      where: { ownerId },
    });
    const servicesCount = await prisma.service.count({
      where: { ownerId },
    });
    return { projectsCount, skillsCount, formationsCount, servicesCount };
  }
}
