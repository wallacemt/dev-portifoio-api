import type { Prisma } from "@prisma/client";
import { listPagination, type OwnerListFilters } from "../validations/ownerListValidation";
import { ZodError } from "zod";
import { getUiTexts } from "../i18n";
import { BadgeRepository } from "../repository/badgeRepository";
import { applyTranslations } from "../translation/applyTranslations";
import { enqueueTranslation, removeTranslations } from "../translation/enqueueTranslation";
import type { BadgeAddRequest, BadgeUpdate } from "../types/badges";
import { Exception } from "../utils/exception";
import { badgeSchema, badgeSchemaOptional } from "../validations/badgesValidation";

export class BadgeService {
  private badgeRepository = new BadgeRepository();

  async findAllBadges(ownerId: string, language?: string, filters: OwnerListFilters = {}) {
    if (!ownerId || ownerId === ":ownerId") {
      throw new Exception("ID de owner inválido", 400);
    }
    const texts = getUiTexts("badge", language);
    const pagination = listPagination(filters);
    const where: Prisma.badgeWhereInput = {
      ...(filters.search && { OR: [{ title: { contains: filters.search, mode: "insensitive" } }, { issuer: { contains: filters.search, mode: "insensitive" } }] }),
    };
    const [fetchedBadges, total] = await Promise.all([
      this.badgeRepository.findAllBadges(ownerId, where, pagination.skip, pagination.take),
      pagination.enabled ? this.badgeRepository.countBadges(ownerId, where) : Promise.resolve(0),
    ]);
    const meta = pagination.enabled ? { page: pagination.page, limit: pagination.limit, total,
      hasNextPage: pagination.page * pagination.limit < total } : undefined;
    const badges = await applyTranslations("badge", fetchedBadges, language);

    return {
      badges,
      texts,
      ...(meta && { meta }),
    }
  }

  async findById(badgeId: string, language?: string) {
    if (!badgeId || badgeId === ":id") {
      throw new Exception("ID do badge inválido", 400);
    }
    const badge = await this.badgeRepository.findById(badgeId);
    if (!badge) {
      throw new Exception("Badge não encontrado", 404);
    }
    const [translated] = await applyTranslations("badge", [badge], language);
    return translated ?? badge;
  }

  async addBadge(badge: BadgeAddRequest) {
    try {
      const badgeData: BadgeAddRequest = {
        ...badge,
        badgeUrl: badge.badgeUrl?.length ? badge.badgeUrl : undefined,
      };
      badgeSchema.parse(badgeData);
      const created = await this.badgeRepository.addBadge(badgeData);
      await enqueueTranslation("badge", created.id, created);
      return created;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "Erro ao adicionar badge", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  async updateBadge(badge: BadgeUpdate, badgeId: string) {
    if (!badgeId || badgeId === ":id") {
      throw new Exception("ID do badge inválido", 400);
    }

    const existingBadge = await this.badgeRepository.findById(badgeId);
    if (!existingBadge) {
      throw new Exception("Badge não encontrado", 404);
    }

    try {
      const badgeData: BadgeUpdate = {
        ...badge,
        issueDate: badge.issueDate && new Date(badge.issueDate),
        badgeUrl: badge.badgeUrl?.length ? badge.badgeUrl : undefined,
      };
      badgeSchemaOptional.parse(badgeData);
      const updated = await this.badgeRepository.updateBadge(badgeData, badgeId);
      await enqueueTranslation("badge", updated.id, updated);
      return updated;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "Erro ao atualizar badge", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  async deleteBadge(badgeId: string) {
    if (!badgeId || badgeId === ":id") {
      throw new Exception("ID do badge inválido", 400);
    }

    const existingBadge = await this.badgeRepository.findById(badgeId);
    if (!existingBadge) {
      throw new Exception("Badge não encontrado", 404);
    }

    const deleted = await this.badgeRepository.deleteBadge(badgeId);
    await removeTranslations("badge", badgeId);
    return deleted;
  }
}
