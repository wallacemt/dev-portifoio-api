import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/prismaClient";
import type { BadgeAddRequest, BadgeUpdate } from "../types/badges";

export class BadgeRepository {
  async findAllBadges(ownerId: string, filters: Prisma.badgeWhereInput = {}, skip?: number, take?: number) {
    return await prisma.badge.findMany({
      where: { ...filters, ownerId },
      orderBy: [{ issueDate: "desc" }, { id: "asc" }],
      skip,
      take,
    });
  }

  countBadges(ownerId: string, filters: Prisma.badgeWhereInput) {
    return prisma.badge.count({ where: { ...filters, ownerId } });
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
