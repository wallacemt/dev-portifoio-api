import { env } from "../env";
import { prisma } from "../prisma/prismaClient";
import { TranslationService } from "../services/aiService";
import { devDebugger } from "../utils/devDebugger";
import { QuotaManager } from "../utils/quotaManager";
import { type EntityName, pickTranslatableFields } from "./translatableFields";
import { type TranslationRow, TranslationRepository } from "./translationRepository";

const translationRepository = new TranslationRepository();
const translationService = new TranslationService();

const DEFAULT_BATCH_SIZE = 10;

export interface ProcessBatchResult {
  processed: number;
  failed: number;
  skippedByQuota: number;
}

// ponytail: Prisma model delegates don't share a common structural type, and
// this is the only caller — a narrow cast here is cheaper than a second
// abstraction layer over 7 delegates for one `findUnique` call.
type FindUniqueDelegate = { findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null> };

function delegateFor(entity: EntityName): FindUniqueDelegate {
  return (prisma as unknown as Record<EntityName, FindUniqueDelegate>)[entity];
}

/**
 * Reads the *current* translatable fields of the source record — never the
 * `translation` row's own stale `fields` — so the worker always translates
 * today's content, not whatever it looked like when the job was enqueued.
 * Returns `null` when the source record itself is gone (deleted after being
 * enqueued but before `removeTranslations` cleaned it up).
 */
async function findSourceFields(entity: EntityName, entityId: string): Promise<Record<string, unknown> | null> {
  const record = await delegateFor(entity).findUnique({ where: { id: entityId } });
  if (!record) return null;
  return pickTranslatableFields(entity, record);
}

async function processOne(row: TranslationRow): Promise<"done" | "failed"> {
  const entity = row.entity as EntityName;

  try {
    const sourceFields = await findSourceFields(entity, row.entityId);
    if (!sourceFields) {
      // Source record no longer exists — there's nothing left to translate;
      // clear the orphaned row instead of retrying it forever.
      await translationRepository.deleteForEntity(entity, row.entityId);
      return "done";
    }

    const translated = await translationService.translateObject(sourceFields, row.language, "pt");
    // `translateObject` never throws (ADR-06): on quota exhaustion, a missing
    // key, or exhausted retries it silently returns the *original* object
    // instead. That's the right contract for the synchronous read-path
    // fallback it was built for, but it means the worker has to detect a
    // no-op translation itself — an unchanged payload means nothing was
    // actually translated, so this job must be treated as a failure (AC-07),
    // not marked `done` with untranslated pt-BR content.
    if (JSON.stringify(translated) === JSON.stringify(sourceFields)) {
      throw new Error("Translation returned unchanged content (quota exhausted, unconfigured, or model failure)");
    }
    await translationRepository.markDone(row.id, translated as Record<string, unknown>);
    return "done";
  } catch (error) {
    const attempts = row.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    devDebugger(`[worker] failed ${entity}/${row.entityId}/${row.language} (attempt ${attempts})`, error, "warn");
    await translationRepository.markFailedAttempt(row.id, attempts, message);
    return "failed";
  }
}

/**
 * Pulls one batch of `pending` rows (oldest first) and translates each one,
 * gating every row against the worker's own shared-quota sub-ceiling
 * (`WORKER_DAILY_BUDGET`, ADR-04) — never the account-wide ceiling. Stops the
 * cycle the moment quota runs out rather than skipping row-by-row, since
 * every remaining row would fail the same check anyway.
 *
 * Never throws: a failure on one row increments its `attempts` (flipping to
 * `failed` at `MAX_ATTEMPTS`) and the loop moves on to the next row.
 */
export async function processPendingBatch(limit = DEFAULT_BATCH_SIZE): Promise<ProcessBatchResult> {
  const result: ProcessBatchResult = { processed: 0, failed: 0, skippedByQuota: 0 };
  const batch = await translationRepository.findPendingBatch(limit);

  for (const row of batch) {
    // biome-ignore lint/nursery/noAwaitInLoop: quota and jobs must be processed sequentially, same reasoning as aiService's chunk loop
    const canMakeRequest = await QuotaManager.canMakeRequest(env.WORKER_DAILY_BUDGET);
    if (!canMakeRequest) {
      result.skippedByQuota += batch.length - result.processed - result.failed;
      break;
    }

    const outcome = await processOne(row);
    if (outcome === "done") result.processed++;
    else result.failed++;
  }

  return result;
}
