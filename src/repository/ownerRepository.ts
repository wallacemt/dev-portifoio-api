import { prisma } from "../prisma/prismaClient";
import { OwnerDataOptionalRequest, OwnerDataRequest } from "../types/owner";

export class OwnerRepository {
  /**
   * Finds an owner by their email or id.
   * @param id or email The email of the owner to find.
   * @returns The found owner, or null if not found.
   */
  async findByEmailOrId(id?: string) {
    return await prisma.owner.findFirst({
      where: {
        OR: [{ email: id }, { id: id }],
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
}
