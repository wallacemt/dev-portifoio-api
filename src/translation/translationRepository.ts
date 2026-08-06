import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/prismaClient";
import type { EntityName } from "./translatableFields";

export interface TranslationRow {
  id: string;
  entity: string;
  entityId: string;
  language: string;
  fields: Record<string, unknown>;
  sourceHash: string;
  status: "pending" | "done" | "failed";
  attempts: number;
  lastError: string | null;
}

export class TranslationRepository {
  /** Upserts a `pending` row, keyed by (entity, entityId, language) — the idempotency guarantee. */
  async upsertPending(entity: EntityName, entityId: string, language: string, sourceHash: string): Promise<void> {
    await prisma.translation.upsert({
      where: { entity_entityId_language: { entity, entityId, language } },
      create: { entity, entityId, language, sourceHash, fields: {}, status: "pending", attempts: 0 },
      update: { sourceHash, status: "pending", attempts: 0, lastError: null },
    });
  }

  async findExisting(entity: EntityName, entityId: string, language: string) {
    return await prisma.translation.findUnique({
      where: { entity_entityId_language: { entity, entityId, language } },
    });
  }

  async deleteForEntity(entity: EntityName, entityId: string): Promise<void> {
    await prisma.translation.deleteMany({ where: { entity, entityId } });
  }

  async findPendingBatch(limit: number): Promise<TranslationRow[]> {
    return (await prisma.translation.findMany({
      where: { status: "pending" },
      orderBy: { updatedAt: "asc" },
      take: limit,
    })) as TranslationRow[];
  }

  async markDone(id: string, fields: Record<string, unknown>): Promise<void> {
    await prisma.translation.update({
      where: { id },
      data: { fields: fields as Prisma.InputJsonValue, status: "done", lastError: null },
    });
  }

  /** Increments `attempts`; flips to `failed` at the 3rd attempt so it stops being polled. */
  async markFailedAttempt(id: string, attempts: number, error: string): Promise<void> {
    const MAX_ATTEMPTS = 3;
    await prisma.translation.update({
      where: { id },
      data: {
        attempts,
        lastError: error,
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
      },
    });
  }

  /** Read path (applyTranslations): all `done` translations for a batch of ids, in one query. */
  async findDoneForEntities(entity: EntityName, entityIds: string[], language: string): Promise<TranslationRow[]> {
    if (entityIds.length === 0) return [];
    return (await prisma.translation.findMany({
      where: { entity, entityId: { in: entityIds }, language, status: "done" },
    })) as TranslationRow[];
  }

  async findFailed(entity: EntityName) {
    return await prisma.translation.findMany({ where: { entity, status: "failed" } });
  }
}
