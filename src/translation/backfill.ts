import { createHash } from "node:crypto";
import { env } from "../env";
import { prisma } from "../prisma/prismaClient";
import { devDebugger } from "../utils/devDebugger";
import { type EntityName, pickTranslatableFields, TRANSLATABLE } from "./translatableFields";
import { TranslationRepository } from "./translationRepository";

const translationRepository = new TranslationRepository();

export interface BackfillOptions {
  /** Also re-enqueues rows currently `failed`, even when the source hash hasn't changed. */
  retryFailed?: boolean;
}

export interface BackfillResult {
  scanned: number;
  enqueued: number;
}

function hashTranslatableSubset(entity: EntityName, source: Record<string, unknown>): string {
  const subset = pickTranslatableFields(entity, source);
  return createHash("sha256").update(JSON.stringify(subset)).digest("hex");
}

// ponytail: a one-line switch per entity beats a generic "list all records"
// abstraction over 7 different Prisma delegates for a script with one caller.
async function findAllRecords(entity: EntityName): Promise<Record<string, unknown>[]> {
  switch (entity) {
    case "project":
      return await prisma.project.findMany();
    case "skill":
      return await prisma.skill.findMany();
    case "formation":
      return await prisma.formation.findMany();
    case "badge":
      return await prisma.badge.findMany();
    case "certification":
      return await prisma.certification.findMany();
    case "owner":
      return await prisma.owner.findMany();
    case "service":
      return await prisma.service.findMany();
    default:
      // Exhaustive over EntityName (keyof TRANSLATABLE) — unreachable, but
      // keeps the compiler honest if a new entity is ever added there.
      throw new Error(`Unknown entity: ${entity satisfies never}`);
  }
}

/**
 * Scans every entity declared in `TRANSLATABLE` and enqueues translation
 * (RF-07) for any record that's missing a row, or whose translatable content
 * hash diverged from what's stored — the exact same change-detection
 * `enqueueTranslation` uses on the write path (ADR-03).
 *
 * Idempotent (AC-14): running this twice back-to-back enqueues nothing new
 * the second time, because a row is only flipped back to `pending` when the
 * hash actually changed or `retryFailed` is explicitly requested.
 */
export async function runBackfill(options: BackfillOptions = {}): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, enqueued: 0 };
  const entities = Object.keys(TRANSLATABLE) as EntityName[];

  for (const entity of entities) {
    //biome-ignore lint/nursery/noAwaitInLoop: one-off sequential scan, not a hot path
    const records = await findAllRecords(entity);

    for (const record of records) {
      result.scanned++;
      const id = record.id as string;
      const sourceHash = hashTranslatableSubset(entity, record);

      for (const language of env.SUPPORTED_LANGUAGES) {
        //biome-ignore lint/nursery/noAwaitInLoop: one-off sequential scan, not a hot path
        const existing = await translationRepository.findExisting(entity, id, language);
        const hashDiverged = !existing || existing.sourceHash !== sourceHash;
        const shouldRetryFailed = Boolean(options.retryFailed) && existing?.status === "failed";

        if (!(hashDiverged || shouldRetryFailed)) continue;

        await translationRepository.upsertPending(entity, id, language, sourceHash);
        result.enqueued++;
      }
    }
  }

  devDebugger(`[backfill] scanned=${result.scanned} records, enqueued=${result.enqueued} jobs`);
  return result;
}
