import { prisma } from "../prisma/prismaClient";
import { OwnerDataOptionalRequest, OwnerDataRequest } from "../types/owner";

export class OwnerRepository {
  /**
   * Finds an owner by their email.
   * @param email The email of the owner to find.
   * @returns The found owner, or null if not found.
   */
   async findByEmail(email: string) {
    return await prisma.owner.findFirst({
      where: { email },
    });
  }

  /**
   * Creates a new owner.
   * @param owner The data for the new owner.
   * @returns The created owner.
   */
  async createOwner(owner: OwnerDataRequest) {
    return prisma.owner.create({
      data: {...owner},
    });
  }

  /**
   * Updates an existing owner's information.
   * @param owner The data for the owner to update, identified by email.
   * @returns The updated owner.
   */

  async updateOwner(owner: OwnerDataOptionalRequest) {
    return prisma.owner.update({
      where: { email: owner.email },
      data: owner,
    });
  }
}
