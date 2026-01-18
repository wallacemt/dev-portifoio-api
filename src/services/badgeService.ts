import { ZodError } from "zod";
import { BadgeRepository } from "../repository/badgeRepository";
import type { BadgeAddRequest, BadgeUpdate } from "../types/badges";
import { Exception } from "../utils/exception";
import { badgeSchema, badgeSchemaOptional } from "../validations/badgesValidation";

export class BadgeService {
  private badgeRepository = new BadgeRepository();

  async findAllBadges(ownerId: string) {
    if (!ownerId || ownerId === ":ownerId") {
      throw new Exception("ID de owner inválido", 400);
    }
    const texts = {
      title:"Badges & Conquistas",
      description:"Reconhecimentos e conquistas obtidas ao longo da minha jornada profissional"
    }
    const badges =  await this.badgeRepository.findAllBadges(ownerId);

    return {
      badges,
      texts
    }
  }

  async findById(badgeId: string) {
    if (!badgeId || badgeId === ":id") {
      throw new Exception("ID do badge inválido", 400);
    }
    const badge = await this.badgeRepository.findById(badgeId);
    if (!badge) {
      throw new Exception("Badge não encontrado", 404);
    }
    return badge;
  }

  async addBadge(badge: BadgeAddRequest) {
    try {
      const badgeData: BadgeAddRequest = {
        ...badge,
        badgeUrl: badge.badgeUrl?.length ? badge.badgeUrl : undefined,
      };
      badgeSchema.parse(badgeData);
      return await this.badgeRepository.addBadge(badgeData);
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
      return await this.badgeRepository.updateBadge(badgeData, badgeId);
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

    return await this.badgeRepository.deleteBadge(badgeId);
  }
}
