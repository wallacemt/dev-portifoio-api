import { prisma } from "../prisma/prismaClient";
import type { BadgeAddRequest, BadgeUpdate } from "../types/badges";

export class BadgeRepository {
  async findAllBadges(ownerId: string) {
    return await prisma.badge.findMany({
      where: { ownerId },
      orderBy: { issueDate: "desc" },
    });
  }

  async findById(badgeId: string) {
    return await prisma.badge.findUnique({
      where: { id: badgeId },
    });
  }

  async addBadge(badge: BadgeAddRequest) {
    return await prisma.badge.create({
      data: { ...badge },
    });
  }

  async updateBadge(badge: BadgeUpdate, badgeId: string) {
    return await prisma.badge.update({
      where: { id: badgeId },
      data: { ...badge },
    });
  }

  async deleteBadge(badgeId: string) {
    return await prisma.badge.delete({
      where: { id: badgeId },
    });
  }
}
